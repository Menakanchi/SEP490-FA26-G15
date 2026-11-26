package com.vsos.backend.service.analysis;

import com.vsos.backend.repository.analysis.FailureAnalysisDatabaseRepository;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.common.analysis.FailureAnalysisJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;

class FailureAnalysisDatabaseAdapterTest {
    @TempDir Path root;
    FailureAnalysisDatabaseRepository repo;RunService runs;FailureAnalysisService service;FailureAnalysisDatabaseAdapter adapter;Row row;byte[] raw;
    static Row identity(byte[] raw) {
        var i=new LinkedHashMap<>((Map<String,Object>)at(FailureAnalysisJson.object(raw),"/dataset/identity"));
        i.put("id",i.get("run_id"));i.put("random_seed",i.get("seed"));i.put("simulator_version",i.get("simulator"));return new Row(i);
    }
    @BeforeEach void setup()throws Exception {
        raw=FailureAnalysisServiceTest.input("result_run2499_full_dataset_v2.json");row=identity(raw);
        repo=mock(FailureAnalysisDatabaseRepository.class);runs=mock(RunService.class);service=new FailureAnalysisService(new FailureAnalysisMemoryStore());
        when(runs.runDir(anyLong())).thenAnswer(a->root.resolve("runs/"+a.getArgument(0)));
        when(repo.run(4,2499)).thenReturn(row);when(repo.variant(4,1033)).thenReturn(new Row(Map.of("id",1033L,"scenario_id",26L,"version_no",12L)));
        when(repo.members(4,1033)).thenReturn(List.of(row));Path file=runs.runDir(2499).resolve("result.json");Files.createDirectories(file.getParent());Files.write(file,raw);
        adapter=new FailureAnalysisDatabaseAdapter(repo,runs,service);
    }
    @Test void originalBytesAndProvenanceReachExistingPersistence()throws Exception {
        var before=adapter.inspect(4,2499,false);assertThat(before.get("can_analyze")).isEqualTo(true);
        var e=adapter.analyze(4,7,2499,false,before.get("source_sha256").toString());assertThat(e.get("analyzed")).isEqualTo(1L);
        assertThat(service.download(Kind.SOURCE,4,e.get("source_id").toString())).isEqualTo(raw);
        assertThat(at(service.metadata(Kind.SOURCE,4,e.get("source_id").toString()),"/database_input/members/0/byte_sha256")).isEqualTo(sha256(raw));
        assertThat(adapter.analyze(4,7,2499,false,null).get("id")).isEqualTo(e.get("id"));assertThat(Files.readAllBytes(runs.runDir(2499).resolve("result.json"))).isEqualTo(raw);
        var uploaded=service.ingest(4,7,new java.io.ByteArrayInputStream(raw),raw.length,null);
        assertThat(uploaded.get("identity_disagreement")).isEqualTo("NONE_DETECTED");
    }
    @Test void noForeignProjectAndNoWritesToProducerRepository() {
        assertThatThrownBy(()->adapter.inspect(2,2499,false)).hasMessage("DB_SELECTION_NOT_FOUND");verify(repo,never()).artifacts(eq(2L),anyLong());
    }
    @Test void missingFileIdentifiesRequiredSourceAndDoesNotInventJson()throws Exception {
        Files.delete(runs.runDir(2499).resolve("result.json"));var detail=adapter.inspect(4,2499,false);
        assertThat(detail.get("can_analyze")).isEqualTo(false);assertThat(at(detail,"/members/0/issues/0/field")).isEqualTo("result.json");
        assertThatThrownBy(()->adapter.analyze(4,7,2499,false,null)).hasMessage("DB_RESULT_SOURCE_UNAVAILABLE_SEE_INSPECTION");
    }
    @Test void staleHashIsRejectedAndIdentityConflictHasExactField()throws Exception {
        assertThatThrownBy(()->adapter.analyze(4,7,2499,false,"0".repeat(64))).hasMessage("DB_SOURCE_CHANGED_REINSPECT");
        var bad=new LinkedHashMap<>(row.asMap());bad.put("random_seed",999L);when(repo.run(4,2499)).thenReturn(new Row(bad));
        var inspected=adapter.inspect(4,2499,false);assertThat(at(inspected,"/members/0/issues/0/field")).isEqualTo("/dataset/identity/seed");assertThat(inspected.get("can_analyze")).isEqualTo(false);
    }
    @Test void unsafeOrAmbiguousArtifactReferencesAreNotOpened()throws Exception {
        when(repo.artifacts(4,2499)).thenReturn(List.of(new Row(Map.of("id",1L,"storage_url",root.resolve("other.json").toString()))));
        assertThat(at(adapter.inspect(4,2499,false),"/members/0/issues/0/reason_code")).isEqualTo("DB_RESULT_REFERENCE_OUTSIDE_CANONICAL_STORAGE");
        when(repo.artifacts(4,2499)).thenReturn(List.of(new Row(Map.of("id",1L)),new Row(Map.of("id",2L))));
        assertThat(at(adapter.inspect(4,2499,false),"/members/0/issues/0/reason_code")).isEqualTo("DB_RESULT_REFERENCE_AMBIGUOUS");
    }
    @Test void missingDatasetIsNeverReconstructed()throws Exception {
        var old=FailureAnalysisJson.object(raw);old.remove("dataset");Files.write(runs.runDir(2499).resolve("result.json"),FailureAnalysisJson.bytes(old));
        assertThat(at(adapter.inspect(4,2499,false),"/members/0/issues/0/reason_code")).isEqualTo("DATASET_REQUIRED");verify(runs,never()).bundleForRun(any());
    }
    @Test void collectionBudgetRejectsWholeSelectionInsteadOfDroppingRepetitions() {
        when(repo.members(4,1033)).thenReturn(Collections.nCopies(17,row));
        assertThatThrownBy(()->adapter.inspect(4,1033,true)).hasMessage("DB_COLLECTION_MEMBER_LIMIT_NO_TRUNCATION");
    }
    @Test void collectionWrappingKeepsRawDocumentLexicalBytesAndDigest()throws Exception {
        byte[] original=("\n  "+new String(raw,java.nio.charset.StandardCharsets.UTF_8)+"\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);Files.write(runs.runDir(2499).resolve("result.json"),original);
        var e=adapter.analyze(4,7,1033,true,null);assertThat(e.get("analyzed")).isEqualTo(1L);
        assertThat(new String(service.download(Kind.SOURCE,4,e.get("source_id").toString()),java.nio.charset.StandardCharsets.UTF_8)).contains(new String(original,java.nio.charset.StandardCharsets.UTF_8));
    }
}
