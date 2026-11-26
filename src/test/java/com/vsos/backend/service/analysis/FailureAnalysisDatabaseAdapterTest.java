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
    @Test void databaseCollectionOverOneMiBPreservesEveryOriginalAndUploadLimit()throws Exception {
        var members = new ArrayList<Row>();
        var documents = new ArrayList<byte[]>();
        for (long runId = 2499; runId < 2503; runId++) {
            var doc = FailureAnalysisJson.object(raw);
            ((Map<String,Object>)doc.get("source")).put("run_id",runId);
            ((Map<String,Object>)at(doc,"/dataset/identity")).put("run_id",runId);
            byte[] bytes = FailureAnalysisJson.bytes(doc);
            Path file = runs.runDir(runId).resolve("result.json");
            Files.createDirectories(file.getParent());
            Files.write(file,bytes);
            members.add(identity(bytes));
            documents.add(bytes);
        }
        when(repo.members(4,1033)).thenReturn(members);
        var inspection = adapter.inspect(4,1033,true);
        assertThat(inspection.get("can_analyze")).isEqualTo(true);
        var execution = adapter.analyze(4,7,1033,true,inspection.get("source_sha256").toString());
        assertThat(execution).containsEntry("expected",4L).containsEntry("analyzed",4L);
        byte[] saved = service.download(Kind.SOURCE,4,execution.get("source_id").toString());
        assertThat(saved.length).isGreaterThan(FailureAnalysisJson.SOURCE_BYTES)
                .isLessThanOrEqualTo(FailureAnalysisJson.DB_COLLECTION_BYTES);
        String text = new String(saved,java.nio.charset.StandardCharsets.UTF_8);
        for (byte[] bytes : documents) assertThat(text).contains(new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
        assertThat(service.metadata(Kind.HANDOFF,4,execution.get("handoff_id").toString())).containsEntry("dispatch_allowed",false);
        assertThatThrownBy(()->service.ingest(4,7,new java.io.ByteArrayInputStream(saved),saved.length,null))
                .hasMessage("SOURCE_BYTES_EXCEEDED");
    }
    @Test
    @org.junit.jupiter.api.condition.EnabledIfSystemProperty(named="fa.real.collection",matches="true")
    void realCarlaCollectionCanBeAnalyzedWithoutDroppingMembers()throws Exception {
        String[] paths=System.getProperty("fa.real.paths","").split(",");
        assertThat(paths).hasSize(4);
        var members=new ArrayList<Row>();
        var originals=new ArrayList<byte[]>();
        long project=0,variant=0,scenario=0;
        for(String path:paths) {
            byte[] bytes=Files.readAllBytes(Path.of(path));
            var doc=FailureAnalysisJson.object(bytes);
            long runId=((Number)at(doc,"/dataset/identity/run_id")).longValue();
            long currentProject=((Number)at(doc,"/dataset/identity/project_id")).longValue();
            long currentVariant=((Number)at(doc,"/dataset/identity/scenario_version_id")).longValue();
            long currentScenario=((Number)at(doc,"/dataset/identity/scenario_id")).longValue();
            if(members.isEmpty()) {project=currentProject;variant=currentVariant;scenario=currentScenario;}
            assertThat(currentProject).isEqualTo(project);
            assertThat(currentVariant).isEqualTo(variant);
            assertThat(currentScenario).isEqualTo(scenario);
            Path file=runs.runDir(runId).resolve("result.json");
            Files.createDirectories(file.getParent());Files.write(file,bytes);
            originals.add(bytes);members.add(identity(bytes));
        }
        when(repo.variant(project,variant)).thenReturn(new Row(Map.of("id",variant,"scenario_id",scenario,"version_no",1L)));
        when(repo.members(project,variant)).thenReturn(members);
        var inspection=adapter.inspect(project,variant,true);
        assertThat(inspection.get("can_analyze")).isEqualTo(true);
        var execution=adapter.analyze(project,7,variant,true,inspection.get("source_sha256").toString());
        assertThat(execution).containsEntry("expected",4L).containsEntry("analyzed",4L);
        byte[] saved=service.download(Kind.SOURCE,project,execution.get("source_id").toString());
        assertThat(saved.length).isGreaterThan(FailureAnalysisJson.SOURCE_BYTES).isLessThanOrEqualTo(FailureAnalysisJson.DB_COLLECTION_BYTES);
        String text=new String(saved,java.nio.charset.StandardCharsets.UTF_8);
        for(byte[] bytes:originals) assertThat(text).contains(new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
        assertThat(service.metadata(Kind.HANDOFF,project,execution.get("handoff_id").toString())).containsEntry("dispatch_allowed",false);
    }
    @Test void databaseCollectionOverTwoMiBIsRejectedWithoutTruncation() {
        when(repo.members(4,1033)).thenReturn(Collections.nCopies(8,row));
        assertThatThrownBy(()->adapter.inspect(4,1033,true)).hasMessage("DB_COLLECTION_BYTE_LIMIT_NO_TRUNCATION");
    }
    @Test void collectionWrappingKeepsRawDocumentLexicalBytesAndDigest()throws Exception {
        byte[] original=("\n  "+new String(raw,java.nio.charset.StandardCharsets.UTF_8)+"\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);Files.write(runs.runDir(2499).resolve("result.json"),original);
        var e=adapter.analyze(4,7,1033,true,null);assertThat(e.get("analyzed")).isEqualTo(1L);
        assertThat(new String(service.download(Kind.SOURCE,4,e.get("source_id").toString()),java.nio.charset.StandardCharsets.UTF_8)).contains(new String(original,java.nio.charset.StandardCharsets.UTF_8));
    }
}
