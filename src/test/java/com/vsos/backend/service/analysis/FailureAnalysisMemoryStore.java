package com.vsos.backend.service.analysis;

import com.vsos.backend.repository.analysis.FailureAnalysisStore;
import com.vsos.backend.repository.common.Db;
import org.springframework.transaction.PlatformTransactionManager;
import java.util.*;
import static org.mockito.Mockito.mock;

/** Explicit in-memory TEST DOUBLE. Provides no evidence about MySQL DDL/transactions. */
public final class FailureAnalysisMemoryStore extends FailureAnalysisStore {
    public final Map<String,Resource> rows=new LinkedHashMap<>();
    @Override public synchronized List<String> identityPeersWithDifferentBytes(long project,String identity,String digest) {
        return rows.values().stream().filter(r->r.kind()==Kind.SOURCE&&r.project()==project&&Objects.equals(r.identityDigest(),identity)&&!Objects.equals(r.byteDigest(),digest)).map(Resource::id).toList();
    }
    public boolean failWrites;
    public String projectStatus="ACTIVE",workspaceStatus="ACTIVE";
    public FailureAnalysisMemoryStore(){super(mock(Db.class),mock(PlatformTransactionManager.class));}
    @Override public void requireWritableProject(long project){if(!"ACTIVE".equals(projectStatus)||!"ACTIVE".equals(workspaceStatus))
        throw new com.vsos.backend.exception.analysis.FailureAnalysisException(403,"FA_PROJECT_OR_WORKSPACE_READ_ONLY");}
    @Override public synchronized Resource find(Kind k,long project,String id){Resource r=rows.get(id);return r!=null&&r.kind()==k&&r.project()==project?r:null;}
    @Override public synchronized Resource byKey(Kind k,long project,String key){return rows.values().stream().filter(r->r.kind()==k&&r.project()==project&&r.key().equals(key)).findFirst().orElse(null);}
    @Override public synchronized List<String> identityPeers(long project,String identity){return rows.values().stream().filter(r->r.kind()==Kind.SOURCE&&r.project()==project&&Objects.equals(r.identityDigest(),identity)).map(Resource::id).toList();}
    @Override public synchronized List<Map<String,Object>> list(Kind k,long project,String parent,int limit,int offset){return rows.values().stream().filter(r->r.kind()==k&&r.project()==project&&(parent==null||Objects.equals(k==Kind.REPORT||k==Kind.HANDOFF?r.executionId():r.sourceId(),parent))).skip(offset).limit(limit).map(Resource::meta).toList();}
    @Override public synchronized Resource saveSource(Resource r){Resource old=byKey(r.kind(),r.project(),r.key());if(old!=null)return old;if(failWrites)throw new org.springframework.dao.DataAccessResourceFailureException("synthetic db failure C:/private/path");r.verify();rows.put(r.id(),r);return r;}
    @Override public synchronized Resource saveGraph(Resource e,List<Resource> children){Resource old=byKey(e.kind(),e.project(),e.key());if(old!=null)return old;if(failWrites)throw new org.springframework.dao.DataAccessResourceFailureException("synthetic db failure C:/private/path");e.verify();children.forEach(Resource::verify);rows.put(e.id(),e);children.forEach(r->rows.put(r.id(),r));return e;}
}
