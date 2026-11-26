package com.vsos.backend.service.analysis;
import com.vsos.core.evaluation.AnalysisMetrics;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.repository.common.Row;

class AnalysisServiceTest {
    private final ProjectAccess projects = mock(ProjectAccess.class);
    Db db=mock(Db.class); Queries queries=mock(Queries.class); AnalysisViewService views=mock(AnalysisViewService.class);
    AnalysisService service=new AnalysisService(db,queries,views,projects);
    List<Row> rows;
    @BeforeEach void setup() {
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id",1L)));
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id",4L,"label","v1","version_no",1L)));
        rows=List.of(row(1,11),row(2,12),row(3,13),row(4,14));
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(rows);
        when(db.list(startsWith("SELECT id, run_config_json"),any(Object[].class))).thenReturn(rows.stream().map(row ->
                new Row(Json.obj("id",row.lng("id"),"run_config_json","{}","telemetry_json",Json.write(trace())))).toList());
        when(db.insert(startsWith("INSERT INTO analysis_results"),any(Object[].class))).thenReturn(99L);
    }
    static Map<String,Object> trace() {
        return Json.obj("frames",List.of(Json.obj("t",0.0,"ego_x",0.0,"ego_v",1.0,"ego_a",0.0,"ped_x",20.0,"ped_y",2.0,"ped_vy",1.0)));
    }
    static Row row(long id,long variant) {
        return new Row(Json.obj("id",id,"scenario_id",8L,"scenario_version_id",variant,"aeb_version_id",4L,
                "carla_vehicle_model_id",3L,"simulator_version","vehicsim-kinematic-1.0","fixed_delta_seconds",0.05,
                "random_seed",48000+id,"status","COMPLETED","end_reason","EGO_STOPPED","verdict","PASS",
                "collision_occurred",false,"is_false_positive",false,"is_false_negative",false,
                "rms_jerk_mps3",3.0,"stopping_distance_m",12.0,"impact_speed_mps",null,"min_ttc_s",2.0,"min_distance_m",2.0,
                "trace_frames",1,"code","PX","name","Crossing","category","CP_CROSSING","version_no",variant));
    }
    AnalysisService.Selection selection() {
        Map<String,String> revisions=new HashMap<>();
        rows.forEach(row->revisions.put(String.valueOf(row.lng("id")),(String)AnalysisService.item(row).get("revision")));
        return new AnalysisService.Selection(8,4,List.of(1L,2L),List.of(3L,4L),revisions);
    }
    @Test void snapshotPreservesSplitIdentityAndMeasuredValues() {
        Map<String,Object> saved=service.freeze(selection(),7L);
        assertThat(saved).containsEntry("id",99L).containsEntry("schema","vehicsim.analysis-dataset/v2");
        assertThat(saved.get("optimization_run_ids")).isEqualTo(List.of(1L,2L));
        assertThat(saved.get("validation_run_ids")).isEqualTo(List.of(3L,4L));
        assertThat(Json.asList(saved.get("manifests"))).hasSize(4);
    }
    @Test void overlappingVariantsAreRejectedEvenWithDifferentSeeds() {
        rows=List.of(row(1,11),row(2,12),row(3,11),row(4,14));
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(rows);
        assertThatThrownBy(()->service.freeze(selection(),7)).hasMessageContaining("overlap");
        verify(db,never()).insert(anyString(),any(Object[].class));
    }
    @Test void sourcePreviewCannotChangeBetweenSelectionAndSave() {
        var selection=selection();
        Map<String,Object> changed=new LinkedHashMap<>(rows.get(0).asMap());changed.put("rms_jerk_mps3",20.0);
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(List.of(new Row(changed),rows.get(1),rows.get(2),rows.get(3)));
        assertThatThrownBy(()->service.freeze(selection,7)).hasMessageContaining("preview changed");
    }
    @Test void mixedSimulatorIsRejected() {
        Map<String,Object> changed=new LinkedHashMap<>(rows.get(0).asMap());changed.put("simulator_version","carla-0.9.16-xosc3");
        rows=List.of(new Row(changed),rows.get(1),rows.get(2),rows.get(3));
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(rows);
        assertThatThrownBy(()->service.freeze(selection(),7)).hasMessageContaining("mixes");
    }
    @Test void baselineChangeAndMissingTraceBlockSave() {
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id",5L)));
        assertThatThrownBy(()->service.freeze(selection(),7)).hasMessageContaining("baseline changed");
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id",4L,"label","v1","version_no",1L)));
        when(db.list(startsWith("SELECT id, run_config_json"),any(Object[].class))).thenReturn(List.of());
        assertThatThrownBy(()->service.freeze(selection(),7)).hasMessageContaining("missing telemetry");
    }
    @Test void handoffKeepsTheFrozenSeedsAndVerifiesArtifacts() {
        Map<String,Object> saved=service.freeze(selection(),7);
        when(views.savedAnalysisDataset(99)).thenReturn(new LinkedHashMap<>(saved));
        when(db.first(startsWith("SELECT telemetry_json, run_config_json"),any(Object[].class)))
                .thenReturn(new Row(Json.obj("telemetry_json",Json.write(trace()),"run_config_json","{}")));
        Map<String,Object> handed=service.handoff(99);
        assertThat(handed.get("runs")).isEqualTo(saved.get("runs"));
        assertThat(handed).containsEntry("handoff_ready",true);
        assertThat(handed.get("dataset_digest")).isEqualTo(AnalysisService.datasetDigest(saved));
    }
    @Test void staleBaselineBlocksHandoffEvenWhenTheArchiveRemainsReadable() {
        when(views.savedAnalysisDataset(99)).thenReturn(Json.obj("schema","vehicsim.analysis-dataset/v2","baseline_current",false));
        assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("baseline changed");
        verifyNoInteractions(db);
    }
    @Test void legacySnapshotsCannotBeHandedOff() {
        when(views.savedAnalysisDataset(99)).thenReturn(Json.obj("schema","vehicsim.analysis-dataset/v1"));
        assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("Legacy");
    }
    @Test void timeoutCancelledMissingAndAebFailureCannotBeSafe() {
        for(var pair:List.of(List.of("STOPPED","TARGET_CLEARED","CANCELLED"),List.of("FAILED","ERROR","ERROR"),
                List.of("COMPLETED","TIMEOUT","TIMEOUT"))) {
            Map<String,Object> data=new LinkedHashMap<>(rows.get(0).asMap());data.put("status",pair.get(0));data.put("end_reason",pair.get(1));
            assertThat(AnalysisService.outcome(new Row(data))).isEqualTo(pair.get(2));
        }
        Map<String,Object> missing=new LinkedHashMap<>(rows.get(0).asMap());missing.put("collision_occurred",null);
        assertThat(AnalysisService.outcome(new Row(missing))).isEqualTo("INCOMPLETE");
    }
    @Test void kpisAndItemsUseTheSameParameterizedFilters() {
        var result=service.dashboard(new AnalysisService.Filters(8L,11L,4L,null,null,"RAIN",null,"COMPLETED",null),1,30);
        assertThat(result).containsEntry("total",4);
        assertThat(Json.asMap(result.get("counts"))).containsEntry("SAFE",4L);
        verify(db).list(contains("r.scenario_version_id = ?"),eq(1L),eq(8L),eq(11L),eq(4L),eq("RAIN"),eq("COMPLETED"));
    }
    @Test void dashboardOrdersRunsBeforePagingRegardlessOfDatabaseOrder() {
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class)))
                .thenReturn(List.of(rows.get(1), rows.get(3), rows.get(0), rows.get(2)));
        var result=service.dashboard(new AnalysisService.Filters(null,null,null,null,null,null,null,null,null),2,2);
        assertThat(Json.asList(result.get("items")).stream().map(Json::asMap).map(item -> item.get("run_id")))
                .containsExactly(2L,1L);
    }
    @Test void snapshotKeepsRunAndManifestOrderRegardlessOfDatabaseOrder() {
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class)))
                .thenReturn(List.of(rows.get(2), rows.get(0), rows.get(3), rows.get(1)));
        when(db.list(startsWith("SELECT id, run_config_json"),any(Object[].class))).thenReturn(
                List.of(rows.get(3), rows.get(1), rows.get(0), rows.get(2)).stream().map(row ->
                        new Row(Json.obj("id",row.lng("id"),"run_config_json","{}","telemetry_json",Json.write(trace())))).toList());
        var saved=service.freeze(selection(),7L);
        assertThat(Json.asList(saved.get("runs")).stream().map(Json::asMap).map(item -> item.get("run_id")))
                .containsExactly(1L,2L,3L,4L);
        assertThat(Json.asList(saved.get("manifests")).stream().map(Json::asMap).map(item -> item.get("run_id")))
                .containsExactly(1L,2L,3L,4L);
    }
    @Test void missingTraceAndMissingBrakingMetricsNeverCountAsSafe() {
        Map<String,Object> missing=new LinkedHashMap<>(rows.get(0).asMap());missing.put("trace_frames",0);
        assertThat(AnalysisService.outcome(new Row(missing))).isEqualTo("INCOMPLETE");
        missing.put("trace_frames",1);missing.put("brake_onset",1.0);
        missing.put("rms_jerk_mps3",null);
        assertThat(AnalysisService.outcome(new Row(missing))).isEqualTo("INCOMPLETE");
    }
    @Test void sqlJsonOrderingAndNumberWidthsDoNotInvalidateSnapshot() {
        assertThat(AnalysisService.sameValue(Map.of("seed",48011L,"value",3.0),Map.of("value",3,"seed",48011))).isTrue();
    }
    @Test void artifactFingerprintSurvivesMysqlJsonNumberAndKeyNormalization() {
        assertThat(AnalysisService.digest(Map.of("a",1.0,"b",List.of(0.0,2.0))))
                .isEqualTo(AnalysisService.digest(Map.of("b",List.of(0,2),"a",1)));
        assertThat(AnalysisService.digest(Map.of("a",1))).isNotEqualTo(AnalysisService.digest(Map.of("a",2)));
    }
    @Test void invalidTraceAndUnknownBrakingStayUnknown() {
        assertThat(AnalysisService.validTrace(trace())).isTrue();
        assertThat(AnalysisService.validTrace(Json.obj("frames",List.of(Map.of("t",0))))).isFalse();
        assertThat(AnalysisService.sample(new Row(Json.obj("status","COMPLETED"))).braked()).isNull();
    }
    @Test void backgroundHandoffIsProjectScopedAndChecksumIgnoresOnlyDerivedMetadata() {
        var saved=service.freeze(selection(),7);
        when(db.first(startsWith("SELECT id, aeb_version_id, summary_json"),eq(99L),eq(1L)))
                .thenReturn(new Row(Json.obj("id",99L,"aeb_version_id",4L,"summary_json",Json.write(saved))));
        when(db.first(startsWith("SELECT telemetry_json, run_config_json"),any(Object[].class)))
                .thenReturn(new Row(Json.obj("telemetry_json",Json.write(trace()),"run_config_json","{}")));
        reset(projects);
        var handed=service.handoff(1L,99L);
        verifyNoInteractions(projects);
        var derived=new LinkedHashMap<>(handed);derived.put("created_at","later");derived.put("baseline_current",false);
        assertThat(AnalysisService.datasetDigest(derived)).isEqualTo(handed.get("dataset_digest"));
        derived.put("optimization_run_ids",List.of(2L,1L));
        assertThat(AnalysisService.datasetDigest(derived)).isNotEqualTo(handed.get("dataset_digest"));
        assertThatThrownBy(()->service.handoff(2L,99L)).hasMessageContaining("analysis dataset");
    }
    @Test void handoffRejectsMissingManifestAndOverlappingPartitions() {
        var saved=service.freeze(selection(),7);
        saved.put("manifests",List.of());
        when(views.savedAnalysisDataset(99)).thenReturn(saved);
        assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("manifests");
        saved.put("validation_run_ids",List.of(2L,4L));
        assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("partitions");
    }
    @Test void storedObjectiveRecordsRemainEqualAfterSqlJsonRoundTrip() {
        var saved=service.freeze(selection(),7);
        var reloaded=Json.parseMap(Json.write(saved));
        assertThat(AnalysisService.datasetDigest(reloaded)).isEqualTo(AnalysisService.datasetDigest(saved));
        when(views.savedAnalysisDataset(99)).thenReturn(reloaded);
        when(db.first(startsWith("SELECT telemetry_json, run_config_json"),any(Object[].class)))
                .thenReturn(new Row(Json.obj("telemetry_json",Json.write(trace()),"run_config_json","{}")));
        assertThat(service.handoff(99)).containsEntry("handoff_ready",true);
    }
}
