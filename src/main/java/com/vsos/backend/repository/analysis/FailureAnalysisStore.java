package com.vsos.backend.repository.analysis;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.common.analysis.FailureAnalysisJson;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.core.failureanalysis.Evidence;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;

/** Insert-only JSON repository. All resource lookup predicates include the authenticated project.
 * CPU/core work is performed before the short atomic graph transaction. */
@Repository
public class FailureAnalysisStore {
    public enum Kind {
        SOURCE("fa_json_sources"), EXECUTION("fa_json_executions"), REPORT("fa_json_reports"), HANDOFF("fa_json_handoffs");
        final String table; Kind(String table) { this.table=table; }
    }
    public record Resource(Kind kind,String id,long project,String sourceId,String executionId,String key,
                           String identityDigest,byte[] body,String byteDigest,byte[] metadata,String metadataDigest) {
        public Resource { body=body==null?null:body.clone(); metadata=metadata.clone(); }
        @Override public byte[] body() { return body==null?null:body.clone(); }
        @Override public byte[] metadata() { return metadata.clone(); }
        public Map<String,Object> meta() {
            if(metadata.length>FailureAnalysisJson.METADATA_BYTES) throw new FailureAnalysisException(409,"STORED_METADATA_LIMIT");
            if (!Objects.equals(Evidence.sha256(metadata),metadataDigest)) throw new FailureAnalysisException(409,"STORED_METADATA_DIGEST_MISMATCH");
            Map<String,Object> result=FailureAnalysisJson.object(metadata);
            if(!"vehicsim.fa-rest-resource/v1".equals(result.get("resource_schema"))
                    ||!id.equals(result.get("id"))||!Long.toString(project).equals(Objects.toString(result.get("project_id")))
                    ||!kind.name().equals(result.get("resource_kind"))
                    ||!Objects.equals(sourceId,result.get("source_id"))||!Objects.equals(executionId,result.get("execution_id"))
                    ||!Objects.equals(byteDigest,result.get("byte_sha256"))) throw new FailureAnalysisException(409,"STORED_RESOURCE_VERSION_OR_IDENTITY_MISMATCH");
            return result;
        }
        public void verify() {
            meta();
            if(body!=null && (body.length>FailureAnalysisJson.RESOURCE_BYTES||!Objects.equals(Evidence.sha256(body),byteDigest)))
                throw new FailureAnalysisException(409,"STORED_BYTE_DIGEST_MISMATCH");
            if(body==null && byteDigest!=null) throw new FailureAnalysisException(409,"STORED_BYTE_DIGEST_MISMATCH");
        }
    }
    private final Db db;
    private final TransactionTemplate transactions;
    public FailureAnalysisStore(Db db,PlatformTransactionManager transactions) {
        this.db=db; this.transactions=new TransactionTemplate(transactions);
    }
    /** Lifecycle gate after the caller has resolved project authorization. Rechecked with
     * shared row locks inside writes, so archive cannot race a successful commit. */
    public void requireWritableProject(long project) { requireWritableProject(project,false); }
    private void requireWritableProject(long project,boolean lock) {
        Row state=db.first("SELECT p.status AS project_status, p.workspace_id, w.status AS workspace_status FROM projects p "+
                "LEFT JOIN workspaces w ON w.id = p.workspace_id WHERE p.id = ?"+(lock?" FOR SHARE":""),project);
        if(state==null||!"ACTIVE".equals(state.str("project_status"))
                ||(!state.isNull("workspace_id")&&!"ACTIVE".equals(state.str("workspace_status"))))
            throw new FailureAnalysisException(403,"FA_PROJECT_OR_WORKSPACE_READ_ONLY");
    }
    public Resource find(Kind kind,long project,String id) {
        return resource(kind,db.first("SELECT * FROM "+kind.table+" WHERE project_id = ? AND id = ?",project,id));
    }
    public Resource byKey(Kind kind,long project,String key) {
        return resource(kind,db.first("SELECT * FROM "+kind.table+" WHERE project_id = ? AND dedupe_key = ?",project,key));
    }
    public List<Map<String,Object>> list(Kind kind,long project,String parent,int limit,int offset) {
        String filter=parent==null?"":" AND "+(kind==Kind.REPORT||kind==Kind.HANDOFF?"execution_id":"source_id")+" = ?";
        List<Object> args=new ArrayList<>();args.add(project);if(parent!=null)args.add(parent);args.add(limit);args.add(offset);
        return db.list("SELECT id, project_id, source_id, execution_id, payload_sha256, metadata_bytes, metadata_sha256 FROM "+kind.table+
                " WHERE project_id = ?"+filter+" ORDER BY created_at DESC, id LIMIT ? OFFSET ?",args.toArray())
                .stream().map(row->new Resource(kind,row.str("id"),row.lng("project_id"),row.str("source_id"),row.str("execution_id"),null,null,null,row.str("payload_sha256"),
                        (byte[])row.get("metadata_bytes"),row.str("metadata_sha256")).meta()).toList();
    }
    public List<String> identityPeers(long project,String identityDigest) {
        return db.list("SELECT id FROM fa_json_sources WHERE project_id = ? AND identity_digest = ? ORDER BY id LIMIT 100",
                project,identityDigest).stream().map(r->r.str("id")).toList();
    }
    public List<String> identityPeersWithDifferentBytes(long project,String identityDigest,String byteDigest) {
        return db.list("SELECT id FROM fa_json_sources WHERE project_id=? AND identity_digest=? AND payload_sha256<>? ORDER BY id LIMIT 100",project,identityDigest,byteDigest)
                .stream().map(r->r.str("id")).toList();
    }
    public Resource saveSource(Resource source) {
        try { transactions.executeWithoutResult(s->{requireWritableProject(source.project(),true);insert(source);}); return source; }
        catch(DuplicateKeyException e) {
            Resource winner=byKey(Kind.SOURCE,source.project(),source.key());
            if(winner==null) throw e; winner.verify(); return winner;
        }
    }
    public Resource saveGraph(Resource execution,List<Resource> children) {
        try {
            transactions.executeWithoutResult(s->{requireWritableProject(execution.project(),true);insert(execution);children.forEach(this::insert);});
            return execution;
        } catch(DuplicateKeyException e) {
            // The losing transaction is already rolled back before reading the committed winner.
            Resource winner=byKey(Kind.EXECUTION,execution.project(),execution.key());
            if(winner==null) throw e; winner.verify();return winner;
        }
    }
    private void insert(Resource r) {
        r.verify();
        db.update("INSERT INTO "+r.kind().table+" (id, project_id, source_id, execution_id, dedupe_key, identity_digest, "+
                "payload_bytes, payload_sha256, metadata_bytes, metadata_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)",
                r.id(),r.project(),r.sourceId(),r.executionId(),r.key(),r.identityDigest(),r.body(),r.byteDigest(),r.metadata(),r.metadataDigest());
    }
    private static Resource resource(Kind kind,Row row) {
        if(row==null)return null;
        return new Resource(kind,row.str("id"),row.lng("project_id"),row.str("source_id"),row.str("execution_id"),
                row.str("dedupe_key"),row.str("identity_digest"),(byte[])row.get("payload_bytes"),row.str("payload_sha256"),
                (byte[])row.get("metadata_bytes"),row.str("metadata_sha256"));
    }
}
