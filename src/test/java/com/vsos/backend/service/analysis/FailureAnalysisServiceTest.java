package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;

import com.vsos.backend.repository.analysis.FailureAnalysisStore.*;
import com.vsos.backend.repository.common.Row;
import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;

/** Real producer JSON + real core + explicit memory persistence double, NOT live DB E2E. */
class FailureAnalysisServiceTest {
    static final Path INPUTS=Path.of("docs/failure-analysis-v3/handover/examples/inputs");
    static final Path EVIDENCE=Path.of("target/fa-be-r1-evidence");
    FailureAnalysisMemoryStore store;
    FailureAnalysisService service;
    @BeforeEach void init(){store=new FailureAnalysisMemoryStore();service=new FailureAnalysisService(store);}
    static byte[] input(String file)throws IOException{return Files.readAllBytes(INPUTS.resolve(file));}
    Map<String,Object> ingest(byte[] bytes)throws IOException{return service.ingest(1,7,new ByteArrayInputStream(bytes),bytes.length,null);}
    @ParameterizedTest @ValueSource(strings={"result_run2499_full_dataset.json","result_run2499_full_dataset_v2.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1034-collection.json"})
    void realProducerRoundTripAndCanonicalParity(String file)throws Exception {
        byte[] raw=input(file);String original=sha256(raw);
        var source=ingest(raw);String sid=source.get("id").toString();
        assertThat(service.download(Kind.SOURCE,1,sid)).isEqualTo(raw);
        assertThat(ingest(raw).get("id")).isEqualTo(sid);
        var execution=service.analyze(1,sid,null);String eid=execution.get("id").toString();
        assertThat(execution.get("status")).isEqualTo("COMPLETED");
        long count=file.contains("collection")?2L:1L;
        assertThat(execution).containsEntry("expected",count).containsEntry("analyzed",count).containsEntry("failed",0L).containsEntry("blocked",0L);
        var reports=service.list(Kind.REPORT,1,eid,20,0);assertThat(reports).hasSize((int)count);
        var parsed=new RestJsonAnalysis().parse(raw,FailureAnalysisJson.policy(FailureAnalysisJson.RESOURCE_BYTES));
        for(var meta:reports) {
            byte[] saved=service.download(Kind.REPORT,1,meta.get("id").toString());var report=FailureAnalysisJson.object(saved);
            var run=parsed.runs().stream().filter(r->r.runKey().equals(meta.get("run_key"))).findFirst().orElseThrow();
            var expected=new CanonicalObjectiveReader().read(run);
            for(String metric:CanonicalObjectiveReader.KEYS)
                assertThat(at(report,"/report/objectives/"+metric+"/canonical_value")).isEqualTo(expected.get(metric).canonicalValue().json());
            assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");
            assertThat(new String(saved,StandardCharsets.UTF_8)).doesNotContain("file:///","C:\\\\Users","/Temp/fa-json-");
            assertThat(EvidenceReport.contentDigest(report)).isEqualTo(report.get("content_digest"));
            // Fresh application service, same storage: GET returns exact persisted bytes; no re-analysis.
            assertThat(new FailureAnalysisService(store).download(Kind.REPORT,1,meta.get("id").toString())).isEqualTo(saved);
        }
        var handoffMeta=service.metadata(Kind.HANDOFF,1,execution.get("handoff_id").toString());
        assertThat(handoffMeta).containsEntry("status","DIAGNOSTIC_ONLY").containsEntry("dispatch_allowed",false);
        byte[] handoff=service.download(Kind.HANDOFF,1,handoffMeta.get("id").toString());
        var document=FailureAnalysisJson.object(handoff);
        assertThat(HandoffSnapshots.digest(document)).isEqualTo(document.get("content_digest"));
        assertThat(document.get("schema_version")).isEqualTo(MoboHandoffBuilder.SCHEMA);
        assertThat(at(document,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        assertThat(service.analyze(1,sid,null).get("id")).isEqualTo(eid);
        assertThat(sha256(Files.readAllBytes(INPUTS.resolve(file)))).isEqualTo(original);
        Files.createDirectories(EVIDENCE);String prefix=Path.of(file).getFileName().toString().replace(".json","");
        Files.write(EVIDENCE.resolve(prefix+"-source-response.json"),FailureAnalysisJson.bytes(source));
        Files.write(EVIDENCE.resolve(prefix+"-execution-response.json"),FailureAnalysisJson.bytes(execution));
        Files.write(EVIDENCE.resolve(prefix+"-handoff.json"),handoff);
        Files.write(EVIDENCE.resolve(prefix+"-report.json"),service.download(Kind.REPORT,1,reports.getFirst().get("id").toString()));
    }
    @Test void exactIdentityDifferentBytesIsRetainedAndMarkedConflict()throws Exception {
        byte[] first=input("result_run2499_full_dataset.json");
        var a=ingest(first);byte[] second=(new String(first,StandardCharsets.UTF_8)+"\n").getBytes(StandardCharsets.UTF_8);
        var b=ingest(second);assertThat(b.get("id")).isNotEqualTo(a.get("id"));
        assertThat(b.get("identity_disagreement")).isEqualTo("SAME_DECLARED_IDENTITY_DIFFERENT_BYTES");
        assertThat(service.metadata(Kind.SOURCE,1,a.get("id").toString()).get("identity_disagreement")).isEqualTo("SAME_DECLARED_IDENTITY_DIFFERENT_BYTES");
    }
    @Test void partialCollectionKeepsValidMemberAndMissingAccounting()throws Exception {
        var json=FailureAnalysisJson.object(input("vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json"));
        json.put("runs",List.of(((List<?>)json.get("runs")).getFirst())); // Synthetic deletion; original fixture is untouched.
        var source=ingest(FailureAnalysisJson.bytes(json));var execution=service.analyze(1,source.get("id").toString(),null);
        assertThat(execution).containsEntry("status","PARTIAL").containsEntry("expected",2L).containsEntry("analyzed",1L).containsEntry("blocked",1L).containsEntry("missing",1L);
        assertThat(service.list(Kind.REPORT,1,execution.get("id").toString(),20,0)).hasSize(1);
        assertThat(service.metadata(Kind.HANDOFF,1,execution.get("handoff_id").toString()).get("status")).isEqualTo("BLOCKED");
        assertThatThrownBy(()->service.download(Kind.HANDOFF,1,execution.get("handoff_id").toString())).hasMessage("HANDOFF_NOT_GENERATED");
    }
    @Test void concurrentDuplicateAnalysisHasOnePersistedGraph()throws Exception {
        var s=ingest(input("result_run2499_full_dataset.json"));String id=s.get("id").toString();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);
            Callable<String> task=()->{gate.await();return service.analyze(1,id,null).get("id").toString();};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();
            assertThat(a.get(30,TimeUnit.SECONDS)).isEqualTo(b.get(30,TimeUnit.SECONDS));
        }
        assertThat(store.rows.values().stream().filter(r->r.kind()==Kind.EXECUTION).count()).isEqualTo(1);
        assertThat(store.rows.values().stream().filter(r->r.kind()==Kind.REPORT).count()).isEqualTo(1);
    }
    @Test void negativeIntakeAndAuthorityGates()throws Exception {
        byte[] valid=input("result_run2499_full_dataset.json");
        assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(valid),valid.length,"0".repeat(64))).hasMessage("SOURCE_DIGEST_MISMATCH");
        assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(valid),valid.length,"not-a-hash")).hasMessage("EXPECTED_SHA256_INVALID");
        assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(new byte[0]),FailureAnalysisJson.SOURCE_BYTES+1L,null)).hasMessage("SOURCE_BYTES_EXCEEDED");
        assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(new byte[FailureAnalysisJson.SOURCE_BYTES+1]),-1,null)).isInstanceOf(InputRejectedException.class);
        for(String text:List.of("{}","{\"format\":\"vehicsim.result/v99\"}","{", "{\"a\":1,\"a\":2}","{\"a\":1e999}"))
            assertThatThrownBy(()->ingest(text.getBytes(StandardCharsets.UTF_8))).isInstanceOf(InputRejectedException.class);
        var source=ingest(valid);
        assertThatThrownBy(()->service.analyze(1,source.get("id").toString(),"client-approved")).hasMessage("APPROVED_CONTEXT_REGISTRY_UNAVAILABLE");
        assertThatThrownBy(()->service.list(Kind.SOURCE,1,null,101,0)).hasMessage("PAGINATION_INVALID");
        assertThatThrownBy(()->service.download(Kind.SOURCE,1,"../../secret")).hasMessage("RESOURCE_NOT_FOUND");
    }
    @Test void failedWritesDoNotExposeAnExecutionAndRetryWorks()throws Exception {
        var source=ingest(input("result_run2499_full_dataset.json"));store.failWrites=true;
        assertThatThrownBy(()->service.analyze(1,source.get("id").toString(),null)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(store.rows).hasSize(1);store.failWrites=false;
        assertThat(service.analyze(1,source.get("id").toString(),null).get("status")).isEqualTo("COMPLETED");
    }
    @Test void crossProjectCannotReadSourceReportHandoffOrExecution()throws Exception {
        var source=ingest(input("result_run2499_full_dataset.json"));service.analyze(1,source.get("id").toString(),null);
        for(Resource r:store.rows.values()) {
            assertThatThrownBy(()->service.metadata(r.kind(),2,r.id())).hasMessage("RESOURCE_NOT_FOUND");
            assertThatThrownBy(()->service.download(r.kind(),2,r.id())).hasMessage("RESOURCE_NOT_FOUND");
        }
    }
    @Test void corruptionAndUnsupportedStoredVersionAreRejected()throws Exception {
        var source=ingest(input("result_run2499_full_dataset.json"));var ex=service.analyze(1,source.get("id").toString(),null);
        for(Resource r:new ArrayList<>(store.rows.values())) {
            byte[] corrupt=r.body();if(corrupt==null)continue;corrupt[0]^=1;
            store.rows.put(r.id(),new Resource(r.kind(),r.id(),r.project(),r.sourceId(),r.executionId(),r.key(),r.identityDigest(),corrupt,r.byteDigest(),r.metadata(),r.metadataDigest()));
            assertThatThrownBy(()->service.download(r.kind(),1,r.id())).hasMessage("STORED_BYTE_DIGEST_MISMATCH");store.rows.put(r.id(),r);
        }
        Resource r=store.find(Kind.EXECUTION,1,ex.get("id").toString());var meta=r.meta();meta.put("resource_schema","vehicsim.fa-rest-resource/v99");byte[] bytes=FailureAnalysisJson.bytes(meta);
        store.rows.put(r.id(),new Resource(r.kind(),r.id(),r.project(),r.sourceId(),r.executionId(),r.key(),null,r.body(),r.byteDigest(),bytes,sha256(bytes)));
        assertThatThrownBy(()->service.metadata(r.kind(),1,r.id())).hasMessage("STORED_RESOURCE_VERSION_OR_IDENTITY_MISMATCH");
    }
    @Test void conflictingWrapperIdentityIsKeptInPartialAccounting()throws Exception {
        var json=FailureAnalysisJson.object(input("vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json"));
        @SuppressWarnings("unchecked") var first=(Map<String,Object>)((List<?>)json.get("runs")).getFirst();
        first.put("run_id",999999L); // Synthetic inconsistent wrapper; no fixture is edited.
        var source=ingest(FailureAnalysisJson.bytes(json));var execution=service.analyze(1,source.get("id").toString(),null);
        assertThat(execution).containsEntry("status","PARTIAL").containsEntry("analyzed",1L).containsEntry("blocked",2L).containsEntry("missing",1L);
        assertThat(((List<?>)execution.get("members"))).hasSize(3);
    }
    @Test void computeSlotsRejectExcessIntakeWithoutReadingItsBody()throws Exception {
        byte[] raw=input("result_run2499_full_dataset.json");var entered=new CountDownLatch(2);var release=new CountDownLatch(1);
        class Held extends ByteArrayInputStream {
            Held(){super(raw);}
            boolean held;
            @Override public synchronized int read(byte[] b,int off,int len){
                if(!held){held=true;entered.countDown();try{if(!release.await(30,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");}
                    catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
                return super.read(b,off,len);
            }
        }
        try(var pool=Executors.newFixedThreadPool(10)) {
            var a=pool.submit(()->service.ingest(1,7,new Held(),raw.length,null));
            var b=pool.submit(()->service.ingest(1,7,new Held(),raw.length,null));
            try {
                assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(raw),raw.length,null)).hasMessage("FA_PROCESSING_CAPACITY_REACHED");
                List<Future<Map<String,Object>>> producers=new ArrayList<>();
                for(int i=1;i<=16;i++) {
                    long id=i;
                    producers.add(pool.submit(()->service.persistProducerResult(new Row(Map.of(
                            "project_id",1L,"id",id,"attempt",1L,"created_by_user_id",7L)),raw)));
                }
                for(var producer:producers) {
                    var saved=producer.get(20,TimeUnit.SECONDS);
                    assertThat(service.download(Kind.SOURCE,1,saved.get("id").toString())).isEqualTo(raw);
                }
                // Producer completions must not accidentally release interactive permits.
                assertThatThrownBy(()->service.ingest(1,7,new ByteArrayInputStream(raw),raw.length,null)).hasMessage("FA_PROCESSING_CAPACITY_REACHED");
            } finally {release.countDown();}
            assertThat(a.get(20,TimeUnit.SECONDS).get("id")).isEqualTo(b.get(20,TimeUnit.SECONDS).get("id"));
        }
    }
}
