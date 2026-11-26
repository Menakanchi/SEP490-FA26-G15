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
        when(db.scalar(eq("SELECT CAST(? AS JSON)"),any(Object[].class))).thenAnswer(inv -> inv.getArgument(1));
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

    @Test void changedOptimizationAndValidationObjectivesHaveDistinctErrors() {
        var saved=Json.parseMap(Json.write(service.freeze(selection(),7)));
        when(views.savedAnalysisDataset(99)).thenReturn(saved);
        when(db.first(startsWith("SELECT telemetry_json, run_config_json"),any(Object[].class)))
                .thenReturn(new Row(Json.obj("telemetry_json",Json.write(trace()),"run_config_json","{}")));
        for (var partition : List.of("optimization", "validation")) {
            var objective=Json.asMap(Json.asMap(saved.get(partition+"_objectives")).get("rms_jerk_mps3"));
            Object previous=objective.put("value",123.0);
            assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("Analysis "+partition+" objectives changed");
            objective.put("value",previous);
        }
        assertThat(service.handoff(99)).containsEntry("handoff_ready",true);
    }

    @Test void partitionAndEvidenceChecksExplainTheirOwnFailure() {
        var snapshot=Json.parseMap(Json.write(service.freeze(selection(),7)));
        var original=List.copyOf(rows);
        for (String kind : List.of("shared-variant","identity","duplicate-seed","optimization","validation")) {
            var altered=new ArrayList<>(original);
            if (kind.equals("shared-variant")) altered.set(2,with(original.get(2),"scenario_version_id",11L));
            if (kind.equals("identity")) altered.set(2,with(original.get(2),"fixed_delta_seconds",0.1));
            if (kind.equals("duplicate-seed")) {
                var row=with(original.get(1),"scenario_version_id",11L);
                altered.set(1,with(row,"random_seed",original.get(0).getLong("random_seed")));
            }
            if (kind.equals("optimization")) for (int i=0;i<2;i++) {
                var fields=new LinkedHashMap<>(original.get(i).asMap());
                fields.put("rms_jerk_mps3",null); fields.put("stopping_distance_m",null); fields.put("aeb_activated",false);
                altered.set(i,new Row(fields));
            }
            if (kind.equals("validation")) altered.set(2,with(original.get(2),"rms_jerk_mps3",null));
            var saved=Json.parseMap(Json.write(snapshot));
            saved.put("runs",altered.stream().map(AnalysisService::item).toList());
            when(views.savedAnalysisDataset(99)).thenReturn(saved);
            when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(altered);
            String message=switch(kind) {
                case "shared-variant" -> "Analysis dataset partitions contain the same variant";
                case "identity" -> "Analysis dataset mixes vehicle or simulator identities";
                case "duplicate-seed" -> "Analysis dataset repeats a variant and seed";
                case "optimization" -> "Analysis optimization objectives are incomplete";
                default -> "Analysis validation evidence is incomplete";
            };
            assertThatThrownBy(()->service.handoff(99)).as(kind).hasMessageContaining(message);
        }
    }
    private static Row with(Row original,String key,Object value) {
        var copy=new LinkedHashMap<>(original.asMap()); copy.put(key,value); return new Row(copy);
    }

    @Test void mysqlJsonRoundTripKeepsUnchangedPartitionObjectives() throws Exception {
        String url=System.getenv("VSOS_HANDOFF_TEST_MYSQL_URL"), password=System.getenv("VSOS_HANDOFF_TEST_MYSQL_PASSWORD");
        Assumptions.assumeTrue(url != null && url.matches("jdbc:mysql://127\\.0\\.0\\.1:13337/handoff_audit\\?.*") && password != null,
                "Requires the isolated localhost handoff_audit database");
        double[] values={13.003,4.592,13.248,18.293,12.307,10.188,7.755,13.864,8.081,11.504};
        var generated=new ArrayList<Row>();
        for(int i=0;i<10;i++) {
            var fields=new LinkedHashMap<>(row(i+1,11+i).asMap());
            fields.put("rms_jerk_mps3",values[i]);
            generated.add(new Row(fields));
        }
        rows=generated;
        when(db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(rows);
        when(db.list(startsWith("SELECT id, run_config_json"),any(Object[].class))).thenReturn(rows.stream().map(row ->
                new Row(Json.obj("id",row.lng("id"),"run_config_json","{}","telemetry_json",Json.write(trace())))).toList());
        when(db.first(startsWith("SELECT telemetry_json, run_config_json"),any(Object[].class)))
                .thenReturn(new Row(Json.obj("telemetry_json",Json.write(trace()),"run_config_json","{}")));
        var revisions=new HashMap<String,String>();
        rows.forEach(row -> revisions.put(String.valueOf(row.lng("id")),(String)AnalysisService.item(row).get("revision")));
        try (var connection=java.sql.DriverManager.getConnection(url,"root",password);
             var create=connection.createStatement()) {
            try (var database=create.executeQuery("SELECT DATABASE()")) { database.next(); assertThat(database.getString(1)).isEqualTo("handoff_audit"); }
            create.execute("CREATE TEMPORARY TABLE handoff_json_probe (snapshot JSON NOT NULL)");
            when(db.scalar(eq("SELECT CAST(? AS JSON)"),any(Object[].class))).thenAnswer(inv -> {
                try (var query=connection.prepareStatement("SELECT CAST(? AS JSON)")) {
                    query.setString(1,inv.getArgument(1));
                    try (var result=query.executeQuery()) { result.next(); return result.getString(1); }
                }
            });
            for (var split : List.of(new AnalysisService.Selection(8,4,List.of(1L,2L,3L,4L,5L),List.of(6L,7L,8L,9L,10L),revisions),
                    new AnalysisService.Selection(8,4,List.of(6L,7L,8L,9L,10L),List.of(1L,2L,3L,4L,5L),revisions))) {
                Map<String,Object> fresh=service.freeze(split,7);
                try (var insert=connection.prepareStatement("INSERT INTO handoff_json_probe VALUES (?)")) {
                    insert.setString(1,Json.write(fresh)); insert.executeUpdate();
                }
                Map<String,Object> stored;
                try (var result=create.executeQuery("SELECT snapshot FROM handoff_json_probe")) { result.next(); stored=Json.parseMap(result.getString(1)); }
                // Demonstrates the old equality check fails against a real MySQL JSON column.
                assertThat(AnalysisService.sameValue(stored.get("optimization_objectives"),fresh.get("optimization_objectives"))).isFalse();
                when(views.savedAnalysisDataset(99)).thenReturn(stored);
                assertThat(service.handoff(99)).containsEntry("handoff_ready",true);
                var objective=Json.asMap(Json.asMap(stored.get("optimization_objectives")).get("rms_jerk_mps3"));
                objective.put("value",((Number)objective.get("value")).doubleValue()+0.001);
                assertThatThrownBy(()->service.handoff(99)).hasMessageContaining("Analysis optimization objectives changed");
                create.executeUpdate("DELETE FROM handoff_json_probe");
            }
        }
    }
}
