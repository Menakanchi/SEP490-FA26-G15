package com.vsos.backend.service.analysis;

import com.vsos.backend.repository.analysis.FailureAnalysisStore;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.*;
import com.vsos.backend.common.analysis.FailureAnalysisJson;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.core.failureanalysis.*;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import java.io.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Semaphore;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.backend.common.analysis.FailureAnalysisJson.*;

/**
 * JSON-first synchronous application boundary. Approved runtime contexts bind original
 * DB producer bytes to a reviewed selection; unbound intake remains diagnostic only.
 */
@Service
public class FailureAnalysisService {
    public static final String CONTEXT_DIGEST = sha256("AnalysisContext.empty()/fa-rest-context/1");
    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    private final FailureAnalysisStore store;
    private final ObjectProvider<FailureAnalysisHandoffService> handoffs;
    private final RestJsonAnalysis core = new RestJsonAnalysis();
    private final Semaphore slots = new Semaphore(2);
    private final String coreVersion = VERSION + ":" + RestJsonAnalysis.VERSION + ":" + coreFingerprint() + ":"
            + sha256(policy(RESOURCE_BYTES).toString() + ":" + System.getProperty("java.runtime.version"));

    public FailureAnalysisService(FailureAnalysisStore store) {
        this(store,null);
    }
    @Autowired
    public FailureAnalysisService(FailureAnalysisStore store,ObjectProvider<FailureAnalysisHandoffService> handoffs) {
        this.store=store;this.handoffs=handoffs;
    }
    private FailureAnalysisHandoffService handoffs() {
        if(handoffs==null) throw new FailureAnalysisException(409,"APPROVED_CONTEXT_REGISTRY_UNAVAILABLE");
        return handoffs.getObject();
    }
    public Map<String,Object> createContext(long project,long user,FailureAnalysisHandoffService.Review review) throws IOException {
        Map<String,Object> context=handoffs().createContext(project,user,review);
        var approved=handoffs().approved(project,context.get("context_id").toString());
        Map<String,Object> source=ingestDatabase(project,user,approved.sourceBytes(),approved.acquisition());
        context.put("source_id",source.get("id"));return context;
    }
    public Map<String,Object> context(long project,String id) throws IOException {return handoffs().context(project,id);}
    public Map<String,Object> executeContext(long project,long user,String id) throws IOException {
        var approved=handoffs().approved(project,id);
        var source=ingestDatabase(project,user,approved.sourceBytes(),approved.acquisition());
        return analyze(project,source.get("id").toString(),id);
    }
    public Map<String,Object> campaign(long project,String id,String digest) {return handoffs().campaign(project,id,digest);}

    public Map<String, Object> ingest(long project, long user, InputStream stream, long length, String expectedSha) throws IOException {
        return ingest(project, user, stream, length, expectedSha, null, SOURCE_BYTES);
    }

    public void requireDatabaseWrite(long project) {
        store.requireWritableProject(project);
    }

    public Map<String, Object> ingestDatabase(long project, long user, byte[] raw, Map<String, Object> provenance) throws IOException {
        int maxBytes = "COLLECTION".equals(provenance.get("selection_kind")) ? DB_COLLECTION_BYTES : SOURCE_BYTES;
        return ingest(project, user, new ByteArrayInputStream(raw), raw.length, null, provenance, maxBytes);
    }

    /** Module 2 calls this inside the same transaction that commits the completed simulation result. */
    public Map<String,Object> persistProducerResult(Row run, byte[] raw) throws IOException {
        long project = run.lng("project_id"), id = run.lng("id"), attempt = run.lng("attempt");
        var provenance = obj("origin", "MODULE2_RESULT_DATABASE", "selection_kind", "RUN", "selection_id", id,
                "project_id", project, "run_id", id, "attempt", attempt, "original_result_bytes_preserved", true);
        return ingest(project, run.lng("created_by_user_id"), new ByteArrayInputStream(raw), raw.length, null,
                provenance, SOURCE_BYTES, producerResultKey(project, id, attempt));
    }

    /** The numeric run's current committed attempt is the only official input; never searches disk or uploaded peers. */
    public Resource producerResult(Row run) {
        long project = run.lng("project_id"), id = run.lng("id"), attempt = run.lng("attempt");
        Resource source = store.byKey(Kind.SOURCE, project, producerResultKey(project, id, attempt));
        if (source == null) return null;
        verify(source);
        Map<String,Object> provenance = com.vsos.backend.common.Json.asMap(source.meta().get("database_input"));
        if (!"MODULE2_RESULT_DATABASE".equals(provenance.get("origin"))
                || !Long.toString(id).equals(Objects.toString(provenance.get("run_id")))
                || !Long.toString(project).equals(Objects.toString(provenance.get("project_id")))
                || !Long.toString(attempt).equals(Objects.toString(provenance.get("attempt"))))
            throw new FailureAnalysisException(409, "DB_PRODUCER_RESULT_REVISION_MISMATCH");
        return source;
    }

    private Map<String, Object> ingest(long project, long user, InputStream stream, long length, String expectedSha,
                                       Map<String, Object> acquisition, int maxBytes) throws IOException {
        return ingest(project, user, stream, length, expectedSha, acquisition, maxBytes, null);
    }

    private Map<String, Object> ingest(long project, long user, InputStream stream, long length, String expectedSha,
                                       Map<String, Object> acquisition, int maxBytes, String producerKey) throws IOException {
        store.requireWritableProject(project);
        if (length > maxBytes) {
            throw new FailureAnalysisException(413, "SOURCE_BYTES_EXCEEDED");
        }
        if (expectedSha != null && !expectedSha.matches("[a-f0-9]{64}")) {
            throw new FailureAnalysisException(400, "EXPECTED_SHA256_INVALID");
        }
        acquire();
        try {
            byte[] bytes = new BoundedInput(policy(maxBytes)).read(stream, "request-body", -1);
            String digest = sha256(bytes);
            if (expectedSha != null && !digest.equals(expectedSha)) {
                throw new FailureAnalysisException(422, "SOURCE_DIGEST_MISMATCH");
            }
            String key = producerKey != null ? producerKey : acquisition == null ? digest
                    : sha256("fa-db-source/1:" + digest + ":" + EvidenceReport.contentDigest(acquisition));
            Resource existing = store.byKey(Kind.SOURCE, project, key);
            if (existing != null) {
                verify(existing);
                if (producerKey != null && !digest.equals(existing.byteDigest()))
                    throw new FailureAnalysisException(409, "DB_PRODUCER_RESULT_REVISION_CONFLICT");
                return sourceView(existing);
            }
            var parsed = core.parse(bytes, policy(RESOURCE_BYTES));
            List<Object> identities = new ArrayList<>();
            List<Object> producers = new ArrayList<>();
            for (var entry : parsed.entries()) {
                if (entry.run() == null) {
                    identities.add(obj("run_key", entry.runKey(), "pointer", entry.pointer(), "status", "BLOCKED"));
                } else {
                    identities.add(entry.run().get("result", "/dataset/identity"));
                    producers.add(obj("run_key", entry.runKey(), "provenance", entry.run().get("result", "/dataset/provenance")));
                }
            }
            String identity = parsed.entries().stream().anyMatch(e -> e.run() == null) ? null
                    : EvidenceReport.contentDigest(obj("format", parsed.manifest().get("input_format"), "members", identities));
            Map<String, Object> meta = obj("source_schema", parsed.manifest().get("input_format"), "source_sha256", digest,
                    "size_bytes", bytes.length, "uploaded_by", user, "declared_member_identities", identities, "producer_metadata", producers,
                    "input_manifest", parsed.manifest(), "transport_expected_sha256", expectedSha,
                    "producer_authenticity", "UNVERIFIED", "freshness", "UNKNOWN_NO_AUTHORITATIVE_COHORT",
                    "reason_codes", List.of("SOURCE_CURRENTNESS_UNVERIFIED"), "status", parsed.manifest().get("status"));
            if (acquisition != null) {
                meta.put("database_input", acquisition);
            }
            Resource saved = store.saveSource(resource(Kind.SOURCE, project, null, null, key, identity, bytes, meta));
            if (producerKey != null && !digest.equals(saved.byteDigest()))
                throw new FailureAnalysisException(409, "DB_PRODUCER_RESULT_REVISION_CONFLICT");
            return sourceView(saved);
        } finally {
            slots.release();
        }
    }

    private void acquire() {
        if (!slots.tryAcquire()) {
            throw new FailureAnalysisException(429, "FA_PROCESSING_CAPACITY_REACHED");
        }
    }

    private Map<String, Object> sourceView(Resource source) {
        Map<String, Object> meta = new LinkedHashMap<>(source.meta());
        List<String> peers = source.identityDigest() == null ? List.of()
                : store.identityPeers(source.project(), source.identityDigest()).stream().filter(id -> !source.id().equals(id)).toList();
        boolean differentBytes = source.identityDigest() != null
                && !store.identityPeersWithDifferentBytes(source.project(), source.identityDigest(), source.byteDigest()).isEmpty();
        meta.put("identity_disagreement", source.identityDigest() == null ? "UNKNOWN_IDENTITY_INCOMPLETE"
                : differentBytes ? "SAME_DECLARED_IDENTITY_DIFFERENT_BYTES" : "NONE_DETECTED");
        meta.put("other_source_ids", peers);
        return meta;
    }

    public List<Map<String, Object>> list(Kind kind, long project, String parent, int limit, int offset) {
        if (limit < 1 || limit > 20 || offset < 0 || offset > 10000) {
            throw new FailureAnalysisException(400, "PAGINATION_INVALID");
        }
        if (kind == Kind.REPORT) {
            required(Kind.EXECUTION, project, parent);
        }
        if (kind == Kind.EXECUTION && parent != null) {
            required(Kind.SOURCE, project, parent);
        }
        return store.list(kind, project, parent, limit, offset);
    }

    public Map<String, Object> metadata(Kind kind, long project, String id) {
        Resource r = required(kind, project, id);
        return kind == Kind.SOURCE ? sourceView(r) : r.meta();
    }

    public byte[] download(Kind kind, long project, String id) {
        Resource r = required(kind, project, id);
        if (r.body() == null) {
            throw new FailureAnalysisException(409, "HANDOFF_NOT_GENERATED");
        }
        return r.body();
    }

    public Map<String, Object> analyze(long project, String sourceId, String contextId) throws IOException {
        store.requireWritableProject(project);
        var approved=contextId==null?null:handoffs().approved(project,contextId);
        String contextDigest=approved==null?CONTEXT_DIGEST:approved.digest();
        Resource source = required(Kind.SOURCE, project, sourceId);
        if(approved!=null&&!sha256(approved.sourceBytes()).equals(source.byteDigest()))
            throw new FailureAnalysisException(409,"V3_CONTEXT_SOURCE_SCOPE_MISMATCH");
        // A changed runtime mapping must produce a new execution rather than retrying an obsolete handoff.
        String runtimeVersion=approved==null?coreVersion:coreVersion+":"+FailureAnalysisHandoffAdapter.VERSION;
        String key = sha256(source.id() + ":" + source.byteDigest() + ":" + runtimeVersion + ":" + contextDigest);
        Resource previous = store.byKey(Kind.EXECUTION, project, key);
        if (previous != null) {
            verify(previous);
            return previous.meta();
        }
        acquire();
        try {
            var parsed = core.parse(source.body(), policy(RESOURCE_BYTES));
            if(approved!=null){
                Map<String,Run> originals=new HashMap<>();for(var input:approved.inputs())for(var run:input.runs())originals.put(run.runKey(),run);
                List<JsonInputAdapter.Entry> entries=new ArrayList<>();
                for(var entry:parsed.entries()){
                    Run original=originals.get(entry.runKey());
                    if(original==null) throw new FailureAnalysisException(409,"V3_CONTEXT_MEMBER_MISMATCH");
                    entries.add(new JsonInputAdapter.Entry(entry.runKey(),entry.pointer(),original,entry.issues()));
                }
                parsed=new RestJsonAnalysis.Parsed(parsed.manifest(),entries);
            }
            String executionId = UUID.randomUUID().toString();
            List<Resource> children = new ArrayList<>();
            List<Object> accounting = new ArrayList<>();
            List<MoboHandoffBuilder.MemberInput> members = new ArrayList<>();
            int analyzed = 0;
            int blocked = 0;
            int failed = 0;
            int missing = 0;
            long generatedBytes = 0;
            long start = System.nanoTime();
            for (int index = 0; index < parsed.entries().size(); index++) {
                var entry = parsed.entries().get(index);
                Map<String, Object> row = new LinkedHashMap<>(entry.json());
                row.put("member_index", index);
                if (entry.run() == null) {
                    blocked++;
                    if (entry.issues().stream().anyMatch(i -> i.code().contains("DOCUMENT_MISSING"))) {
                        missing++;
                    }
                } else {
                    try {
                        Map<String, Object> report = approved==null?core.diagnose(entry.run(), parsed)
                                :core.diagnose(entry.run(),parsed,approved.adapter().context(entry.run()));
                        Resource saved = resource(Kind.REPORT, project, source.id(), executionId, executionId + ":" + index, null, bytes(report),
                                obj("member_index", index, "run_key", entry.runKey(), "run_identity", JsonInputAdapter.declaredIdentity(entry.run()),
                                        "report_schema", report.get("schema_version"), "content_digest", report.get("content_digest"),
                                        "status", "GENERATED", "evidence_sufficiency", at(report, "/report/evidence_sufficiency"),
                                        "core_version", coreVersion, "context_id", contextId, "context_digest", contextDigest,
                                        "source_sha256", approved==null?source.byteDigest():entry.run().artifact("result").sha256()));
                        generatedBytes += saved.body().length + saved.metadata().length;
                        if (generatedBytes > GRAPH_BYTES) {
                            throw new FailureAnalysisException(413, "OUTPUT_GRAPH_LIMIT");
                        }
                        children.add(saved);
                        members.add(new MoboHandoffBuilder.MemberInput(entry.run(), report));
                        row.put("status", "ANALYZED");
                        row.put("report_id", saved.id());
                        analyzed++;
                    } catch (FailureAnalysisException e) {
                        throw e;
                    } catch (InputRejectedException e) {
                        failed++;
                        row.put("status", "FAILED");
                        row.put("reason_codes", List.of(e.reason()));
                    } catch (RuntimeException e) {
                        // Preserve other members. No exception text/path/stack trace crosses the REST boundary.
                        failed++;
                        row.put("status", "FAILED");
                        row.put("reason_codes", List.of("CORE_MEMBER_ANALYSIS_FAILED"));
                    }
                }
                accounting.add(row);
            }
            Map<String, Object> handoff = null;
            Map<String, Object> compatibility = null;
            List<String> handoffReasons = approved==null?new ArrayList<>(List.of("APPROVED_CONTEXT_AND_COHORT_UNAVAILABLE", "CONSUMER_NOT_INTEGRATED")):new ArrayList<>();
            if (parsed.complete() && analyzed == parsed.entries().size() && analyzed > 0) {
                try {
                    handoff = approved==null?core.diagnosticHandoff(parsed, members):approved.adapter().handoff(members);
                    Artifact artifact = new Artifact("stored-handoff", "external", "urn:vehicsim:fa:handoff", sha256(bytes(handoff)),
                            "application/json", Integrity.VERIFIED, handoff, List.of());
                    if(approved==null) compatibility = new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(artifact,
                            RestJsonAnalysis.unavailableConsumerProfile(), null, null, null));
                    else {
                        handoffReasons.addAll(FailureAnalysisHandoffService.readiness(handoff));
                        compatibility=obj("adapter_version","fa-runtime-v3-campaign/1","status",handoffReasons.isEmpty()?"VALIDATED":"BLOCKED",
                                "context_id",contextId,"context_digest",contextDigest,"training_contract","CANONICAL_CANDIDATE_TRIALS_ON_SEALED_OPTIMIZATION_COHORT",
                                "holdout_policy","FROZEN_VALIDATION_ONLY","reason_codes",List.copyOf(handoffReasons));
                    }
                } catch (RuntimeException e) {
                    handoffReasons.add(handoff == null ? "HANDOFF_BUILD_FAILED" : "COMPATIBILITY_VALIDATION_UNAVAILABLE");
                }
            } else {
                handoffReasons.add("INCOMPLETE_INPUT_POPULATION");
            }
            Resource handoffResource = resource(Kind.HANDOFF, project, source.id(), executionId, executionId, null,
                    handoff == null ? null : bytes(handoff),
                    obj("status", handoff == null ? "BLOCKED" : approved!=null&&handoffReasons.isEmpty()?"READY":"DIAGNOSTIC_ONLY",
                            "handoff_schema", handoff == null ? null : handoff.get("schema_version"),
                            "content_digest", handoff == null ? null : handoff.get("content_digest"), "dispatch_allowed", approved!=null&&handoff!=null&&handoffReasons.isEmpty(),
                            "reason_codes", handoffReasons, "consumer_compatibility", compatibility,
                            "core_version", coreVersion, "context_id", contextId, "context_digest", contextDigest, "source_sha256", source.byteDigest()));
            children.add(handoffResource);
            String status = parsed.complete() && failed == 0 ? "COMPLETED" : analyzed > 0 ? "PARTIAL" : "BLOCKED";
            Map<String, Object> summary = obj("status", status, "source_sha256", source.byteDigest(), "core_version", coreVersion,
                    "context_id", contextId, "context_digest", contextDigest, "context_policy", approved==null?"UNKNOWN_DEFAULT_NO_AUTHORITY":"AUTHENTICATED_CANONICAL_TARGET_REVIEW",
                    "expected", parsed.entries().size(), "accepted", parsed.runs().size(), "analyzed", analyzed, "blocked", blocked,
                    "failed", failed, "missing", missing, "missing_is_subset_of_blocked", true, "members", accounting,
                    "input_manifest", parsed.manifest(), "handoff_id", handoffResource.id(), "runtime_ms", (System.nanoTime() - start) / 1_000_000,
                    "completeness_scope", approved==null?"DELIVERED_MANIFEST_ONLY_NOT_FROZEN_SCENARIO_COHORT":"FROZEN_REVIEWED_SELECTION_NOT_ENTIRE_SCENARIO_POPULATION");
            Resource execution = resourceWithId(Kind.EXECUTION, executionId, project, source.id(), null, key, null, bytes(summary), summary);
            long total = execution.body().length + execution.metadata().length;
            for (Resource r : children) {
                total += r.metadata().length + (r.body() == null ? 0 : r.body().length);
            }
            if (total > GRAPH_BYTES) {
                throw new FailureAnalysisException(413, "OUTPUT_GRAPH_LIMIT");
            }
            return store.saveGraph(execution, children).meta();
        } finally {
            slots.release();
        }
    }

    private Resource required(Kind kind, long project, String id) {
        if (id == null || !id.matches(UUID_PATTERN)) {
            throw new FailureAnalysisException(404, "RESOURCE_NOT_FOUND");
        }
        Resource r = store.find(kind, project, id);
        if (r == null) {
            throw new FailureAnalysisException(404, "RESOURCE_NOT_FOUND");
        }
        verify(r);
        return r;
    }

    private static void verify(Resource r) {
        r.verify();
        Map<String, Object> meta = r.meta();
        if (r.body() == null) {
            return;
        }
        if (r.kind() == Kind.SOURCE) {
            if (!Set.of("vehicsim.result/v1", "vehicsim.run-collection/v1").contains(meta.get("source_schema"))) {
                throw new FailureAnalysisException(409, "STORED_SOURCE_VERSION_UNSUPPORTED");
            }
            boolean dbCollection = "vehicsim.run-collection/v1".equals(meta.get("source_schema"))
                    && Set.of("DATABASE_ARTIFACT_STORAGE", "MODULE2_RESULT_DATABASE").contains(Objects.toString(at(meta, "/database_input/origin"), ""))
                    && "COLLECTION".equals(at(meta, "/database_input/selection_kind"));
            int maxBytes = dbCollection ? DB_COLLECTION_BYTES : SOURCE_BYTES;
            if (r.body().length > maxBytes || !r.byteDigest().equals(meta.get("source_sha256"))) {
                throw new FailureAnalysisException(409, "STORED_SOURCE_IDENTITY_MISMATCH");
            }
        } else if (r.kind() == Kind.REPORT || r.kind() == Kind.HANDOFF) {
            Map<String, Object> json = object(r.body());
            String schema = r.kind() == Kind.REPORT ? "vehicsim.failure-analysis/v1" : MoboHandoffBuilder.SCHEMA;
            String digest = r.kind() == Kind.REPORT ? EvidenceReport.contentDigest(json) : HandoffSnapshots.digest(json);
            if (!schema.equals(json.get("schema_version")) || !digest.equals(json.get("content_digest"))
                    || !digest.equals(meta.get("content_digest"))) {
                throw new FailureAnalysisException(409, "STORED_CONTENT_DIGEST_OR_SCHEMA_MISMATCH");
            }
            if (r.kind() == Kind.REPORT && (!Objects.equals(at(json, "/input/run_key"), meta.get("run_key"))
                    || !Objects.equals(at(json, "/input/json_source/container_sha256_bytes"), meta.get("source_sha256")))) {
                throw new FailureAnalysisException(409, "STORED_REPORT_SOURCE_IDENTITY_MISMATCH");
            }
        }
    }

    private static Resource resource(Kind kind, long project, String source, String execution, String key, String identity,
                                     byte[] body, Map<String, Object> fields) {
        return resourceWithId(kind, UUID.randomUUID().toString(), project, source, execution, key, identity, body, fields);
    }

    private static Resource resourceWithId(Kind kind, String id, long project, String source, String execution, String key,
                                           String identity, byte[] body, Map<String, Object> fields) {
        Map<String, Object> meta = new LinkedHashMap<>(fields);
        meta.putAll(obj("resource_schema", "vehicsim.fa-rest-resource/v1", "resource_kind", kind.name(), "id", id, "project_id", project,
                "source_id", source, "execution_id", execution, "created_at_utc", Instant.now().toString(),
                "byte_sha256", body == null ? null : sha256(body)));
        byte[] metadata = bytes(meta);
        if (metadata.length > METADATA_BYTES) {
            throw new FailureAnalysisException(413, "OUTPUT_METADATA_LIMIT");
        }
        return new Resource(kind, id, project, source, execution, key, identity, body, body == null ? null : sha256(body), metadata, sha256(metadata));
    }
}
