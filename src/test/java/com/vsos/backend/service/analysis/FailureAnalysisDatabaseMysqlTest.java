package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;
import com.vsos.backend.repository.analysis.*;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.core.failureanalysis.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import com.vsos.backend.controller.analysis.FailureAnalysisController;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.entity.enums.RoleCode;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real isolated MySQL + real CARLA artifact content, restored fixture metadata only.
 * This is NOT a query/import of the team's live production database. No app datasource/.env. */
@EnabledIfEnvironmentVariable(named="FA_DB_DIRECT_MYSQL_URL",matches="jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/fa_db_direct_test[?].*")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FailureAnalysisDatabaseMysqlTest {
    Path root=Path.of("target/fa-db-direct-runtime").toAbsolutePath();
    JdbcTemplate jdbc;FailureAnalysisService service;FailureAnalysisDatabaseAdapter adapter;RunService storage;
    final Map<Long,byte[]> originals=new LinkedHashMap<>();
    @BeforeAll void isolatedRestore()throws Exception {
        var ds=new DriverManagerDataSource(System.getenv("FA_DB_DIRECT_MYSQL_URL"),"root",System.getenv("FA_DB_DIRECT_MYSQL_PASSWORD"));jdbc=new JdbcTemplate(ds);
        assertThat(jdbc.queryForObject("SELECT DATABASE()",String.class)).isEqualTo("fa_db_direct_test");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()",Integer.class)).isZero();
        String ddl=Files.readString(Path.of("database/mysql/01_schema.sql"),StandardCharsets.UTF_8).replace("CREATE DATABASE IF NOT EXISTS vehicsim ","CREATE DATABASE IF NOT EXISTS fa_db_direct_test ").replace("USE vehicsim;","USE fa_db_direct_test;");
        try(var c=ds.getConnection()){ScriptUtils.executeSqlScript(c,new ByteArrayResource(ddl.getBytes(StandardCharsets.UTF_8)));}
        jdbc.update("INSERT INTO users(id,email,password_hash,role_id,last_name,first_name) SELECT 7,'db-fa@example.invalid','unused',id,'Fixture','FA' FROM roles WHERE code='ENGINEER'");
        jdbc.update("INSERT INTO projects(id,name,created_by_user_id) VALUES(4,'Real artifact restore fixture',7),(2,'Foreign fixture project',7)");
        jdbc.update("INSERT INTO aeb_versions(id,project_id,version_no,label,created_by_user_id) VALUES(33,4,33,'Fixture identity only, not verified baseline',7)");
        jdbc.update("INSERT INTO scenarios(id,project_id,code,name,created_by_user_id) VALUES(26,4,'CP-fixture','Real CARLA artifact fixture',7)");
        jdbc.update("INSERT INTO scenario_versions(id,scenario_id,version_no,created_by_user_id,scenario_ir_json) VALUES(1033,26,12,7,'{}')");
        jdbc.update("INSERT IGNORE INTO carla_vehicle_models(id,carla_blueprint_id,length_m,width_m,height_m,mass_kg,max_brake_decel_mps2) VALUES(5,'fixture.identity-only',4,2,2,2000,8)");
        originals.put(2499L,FailureAnalysisServiceTest.input("result_run2499_full_dataset_v2.json"));
        var collection=FailureAnalysisJson.object(FailureAnalysisServiceTest.input("vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json"));
        originals.put(2511L,FailureAnalysisJson.bytes(at(collection,"/runs/1/result")));
        var db=new Db(jdbc);service=new FailureAnalysisService(new FailureAnalysisStore(db,new DataSourceTransactionManager(ds)));
        storage=mock(RunService.class);when(storage.runDir(anyLong())).thenAnswer(a->root.resolve("runs/"+a.getArgument(0)));
        for(var entry:originals.entrySet()) {
            var doc=FailureAnalysisJson.object(entry.getValue());var i=(Map<String,Object>)at(doc,"/dataset/identity");
            jdbc.update("INSERT INTO simulation_runs(id,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,aeb_mode,repetition,attempt,simulator_type,simulator_version,purpose,status,random_seed,verdict,collision_occurred,created_by_user_id,rms_jerk_mps3,impact_speed_mps,stopping_distance_m) VALUES(?,4,26,1033,5,33,?,?,?,'CARLA',?,'BASELINE','COMPLETED',?,?,?,7,?,?,?)",
                    entry.getKey(),i.get("aeb_mode"),i.get("repetition"),i.get("attempt"),i.get("simulator"),i.get("seed"),at(doc,"/evaluation/verdict"),"COLLISION".equals(at(doc,"/evaluation/outcome")),
                    at(doc,"/outcome/metrics/rms_jerk_mps3"),at(doc,"/outcome/metrics/impact_speed_mps"),at(doc,"/outcome/metrics/stopping_distance_m"));
            Path file=storage.runDir(entry.getKey()).resolve("result.json");Files.createDirectories(file.getParent());Files.write(file,entry.getValue());
            jdbc.update("INSERT INTO simulation_artifacts(simulation_run_id,artifact_type,file_name,storage_url,mime_type,file_size_bytes) VALUES(?,'RESULT_FILE','result.json',?,'application/json',?)",entry.getKey(),file.toString(),entry.getValue().length);
            service.persistProducerResult(new com.vsos.backend.repository.common.Row(jdbc.queryForMap("SELECT * FROM simulation_runs WHERE id=?",entry.getKey())),entry.getValue());
        }
        adapter=new FailureAnalysisDatabaseAdapter(new FailureAnalysisDatabaseRepository(db),service);
        Files.createDirectories(Path.of("target/fa-db-direct-evidence"));
        Files.write(Path.of("target/fa-db-direct-evidence/run-list.json"),FailureAnalysisJson.bytes(adapter.list(4,false,20,0)));
        Files.write(Path.of("target/fa-db-direct-evidence/collection-list.json"),FailureAnalysisJson.bytes(adapter.list(4,true,20,0)));
    }
    @Test @Order(1) void realRunFromDatabaseNoUploadPreservesExactCanonicalValuesAndBytes()throws Exception {
        assertThat(((List<?>)adapter.list(4,false,20,0).get("items"))).hasSize(2);
        var inspection=adapter.inspect(4,2499,false);assertThat(inspection.get("availability")).isEqualTo("COMPLETE");
        var e=adapter.analyze(4,7,2499,false,inspection.get("source_sha256").toString());
        assertThat(service.download(Kind.SOURCE,4,e.get("source_id").toString())).isEqualTo(originals.get(2499L));assertReportValues(e);
        String sid=e.get("source_id").toString();assertThat(at(service.metadata(Kind.SOURCE,4,sid),"/database_input/run_id")).isEqualTo(2499L);
        assertThat(at(service.metadata(Kind.SOURCE,4,sid),"/database_input/origin")).isEqualTo("MODULE2_RESULT_DATABASE");
        var reload=new FailureAnalysisService(new FailureAnalysisStore(new Db(jdbc),new DataSourceTransactionManager(jdbc.getDataSource())));
        for(var meta:reload.list(Kind.REPORT,4,e.get("id").toString(),20,0))assertThat(reload.download(Kind.REPORT,4,meta.get("id").toString())).isEqualTo(service.download(Kind.REPORT,4,meta.get("id").toString()));
        String hid=e.get("handoff_id").toString();assertThat(reload.download(Kind.HANDOFF,4,hid)).isEqualTo(service.download(Kind.HANDOFF,4,hid));
        assertThat(reload.metadata(Kind.HANDOFF,4,hid).get("dispatch_allowed")).isEqualTo(false);
        assertThat(adapter.analyze(4,7,2499,false,null).get("id")).isEqualTo(e.get("id"));
        writeEvidence("run",e,inspection);
    }
    @Test @Order(2) void actualCollectionIncludesEverySeedRepetitionAndOffMember()throws Exception {
        assertThat(((List<?>)adapter.list(4,true,20,0).get("items"))).hasSize(1);
        var inspection=adapter.inspect(4,1033,true);var e=adapter.analyze(4,7,1033,true,inspection.get("source_sha256").toString());
        assertThat(((Number)e.get("expected")).intValue()).isEqualTo(2);assertThat(((Number)e.get("analyzed")).intValue()).isEqualTo(2);assertReportValues(e);
        var reports=service.list(Kind.REPORT,4,e.get("id").toString(),20,0);assertThat(reports).extracting(m->m.get("run_key")).containsExactlyInAnyOrder("2499","2511");
        for(var r:reports)assertThat(at(r,"/run_identity/repetition/value")).isEqualTo(1L);
        assertThat(adapter.analyze(4,7,1033,true,null).get("id")).isEqualTo(e.get("id"));writeEvidence("collection",e,inspection);
    }
    @Test @Order(3) void unpersistedAttemptRetainsMissingMemberAndNeverUsesDiskOrEarlierAttempt()throws Exception {
        jdbc.update("UPDATE simulation_runs SET attempt=attempt+1 WHERE id=2511");
        try {
            var inspected=adapter.inspect(4,1033,true);assertThat(at(inspected,"/members/1/issues/0/field")).isEqualTo("fa_json_sources");
            Files.write(Path.of("target/fa-db-direct-evidence/missing-run-inspection.json"),FailureAnalysisJson.bytes(adapter.inspect(4,2511,false)));
            var e=adapter.analyze(4,7,1033,true,null);assertThat(((Number)e.get("missing")).intValue()).isEqualTo(1);assertThat(e.get("status")).isEqualTo("PARTIAL");
            var h=service.metadata(Kind.HANDOFF,4,e.get("handoff_id").toString());assertThat(h.get("status")).isEqualTo("BLOCKED");assertThat(h.get("content_digest")).isNull();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_handoffs WHERE id=?",Integer.class,h.get("id"))).isEqualTo(1);writeEvidence("missing-member",e,inspected);
        } finally {jdbc.update("UPDATE simulation_runs SET attempt=attempt-1 WHERE id=2511");}
    }
    @Test @Order(4) void foreignProjectCannotListSelectReadOrAnalyze()throws Exception {
        assertThat((List<?>)adapter.list(2,false,20,0).get("items")).isEmpty();
        assertThatThrownBy(()->adapter.analyze(2,7,2499,false,null)).hasMessage("DB_SELECTION_NOT_FOUND");assertThatThrownBy(()->adapter.inspect(2,1033,true)).hasMessage("DB_SELECTION_NOT_FOUND");
        var e=adapter.analyze(4,7,2499,false,null);for(var r:service.list(Kind.REPORT,4,e.get("id").toString(),20,0))assertThatThrownBy(()->service.download(Kind.REPORT,2,r.get("id").toString())).hasMessage("RESOURCE_NOT_FOUND");
    }
    @Test @Order(5) void tamperedStoredReportDigestIsActuallyRejected()throws Exception {
        var e=adapter.analyze(4,7,2499,false,null);String rid=service.list(Kind.REPORT,4,e.get("id").toString(),20,0).getFirst().get("id").toString();byte[] old=service.download(Kind.REPORT,4,rid);
        jdbc.update("UPDATE fa_json_reports SET payload_bytes=? WHERE id=?","{}".getBytes(StandardCharsets.UTF_8),rid);
        try {assertThatThrownBy(()->service.download(Kind.REPORT,4,rid)).hasMessage("STORED_BYTE_DIGEST_MISMATCH");}finally{jdbc.update("UPDATE fa_json_reports SET payload_bytes=? WHERE id=?",old,rid);}
    }
    @Test @Order(6) void extraRepetitionWithoutOriginalArtifactIsKeptBlockedNotDropped()throws Exception {
        jdbc.update("INSERT INTO simulation_runs(id,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,aeb_mode,repetition,attempt,simulator_type,simulator_version,purpose,status,random_seed,verdict,collision_occurred,created_by_user_id) SELECT 9001,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,aeb_mode,2,attempt,simulator_type,simulator_version,purpose,status,random_seed,verdict,collision_occurred,created_by_user_id FROM simulation_runs WHERE id=2499");
        try {var e=adapter.analyze(4,7,1033,true,null);assertThat(((Number)e.get("expected")).intValue()).isEqualTo(3);assertThat(((Number)e.get("analyzed")).intValue()).isEqualTo(2);assertThat(((Number)e.get("blocked")).intValue()).isEqualTo(1);}
        finally {jdbc.update("DELETE FROM simulation_runs WHERE id=9001");}
    }
    @Test @Order(7) void realControllerDatabaseFlowUsesPersistedMysqlWithoutUpload()throws Exception {
        var access=mock(VehicSimAccess.class);when(access.projectId()).thenReturn(4L);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new FailureAnalysisController(service,access,adapter)).setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        var person=FailureAnalysisRestTest.person(RoleCode.ENGINEER);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(person,null,person.getAuthorities()));
        try {
            mvc.perform(get("/api/v1/vehicsim/analysis/v3/database/runs")).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
            var selected=mvc.perform(get("/api/v1/vehicsim/analysis/v3/database/collections/1033")).andExpect(status().isOk()).andReturn();
            var metadata=FailureAnalysisJson.object(selected.getResponse().getContentAsByteArray());
            var response=mvc.perform(post("/api/v1/vehicsim/analysis/v3/database/collections/1033/executions?source_sha256="+metadata.get("source_sha256")))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.analyzed").value(2)).andReturn();
            String execution=FailureAnalysisJson.object(response.getResponse().getContentAsByteArray()).get("id").toString();
            mvc.perform(get("/api/v1/vehicsim/analysis/v3/executions/"+execution)).andExpect(status().isOk()).andExpect(jsonPath("$.expected").value(2));
            when(access.projectId()).thenReturn(2L);
            mvc.perform(get("/api/v1/vehicsim/analysis/v3/database/collections/1033")).andExpect(status().isNotFound());
            mvc.perform(get("/api/v1/vehicsim/analysis/v3/executions/"+execution)).andExpect(status().isNotFound());
        } finally {SecurityContextHolder.clearContext();}
    }
    @Test @Order(8) void persistedBytesRemainTheInputWhenDiskIsMissingOrChanged()throws Exception {
        Path result=storage.runDir(2499).resolve("result.json");Files.delete(result);
        try {
            var execution=adapter.analyze(4,7,2499,false,sha256(originals.get(2499L)));
            assertThat(service.download(Kind.SOURCE,4,execution.get("source_id").toString())).isEqualTo(originals.get(2499L));
            Files.writeString(result,"unrelated disk content");
            assertThat(adapter.inspect(4,2499,false).get("source_sha256")).isEqualTo(sha256(originals.get(2499L)));
        } finally {Files.write(result,originals.get(2499L));}
    }
    @Test @Order(9) void storedProducerByteChecksumIsCheckedBeforeAnalysis()throws Exception {
        var row=new com.vsos.backend.repository.common.Row(jdbc.queryForMap("SELECT * FROM simulation_runs WHERE id=2499"));
        String source=service.producerResult(row).id();
        jdbc.update("UPDATE fa_json_sources SET payload_bytes=? WHERE id=?","{}".getBytes(StandardCharsets.UTF_8),source);
        try {assertThatThrownBy(()->adapter.inspect(4,2499,false)).hasMessage("STORED_BYTE_DIGEST_MISMATCH");}
        finally {jdbc.update("UPDATE fa_json_sources SET payload_bytes=? WHERE id=?",originals.get(2499L),source);}
    }
    @Test @Order(10) void moduleTwoCommitsFullSourceWithRunOrRollsBothBack()throws Exception {
        jdbc.update("INSERT INTO simulation_runs(id,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,aeb_mode,repetition,attempt,simulator_type,simulator_version,purpose,status,random_seed,created_by_user_id) "
                +"SELECT 9002,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,aeb_mode,3,attempt,simulator_type,simulator_version,purpose,'FAILED',random_seed,created_by_user_id FROM simulation_runs WHERE id=2499");
        var input=com.vsos.backend.common.Json.parseMap(new String(originals.get(2499L),StandardCharsets.UTF_8));
        ((Map<String,Object>)input.get("source")).put("run_id",9002L);
        var identity=(Map<String,Object>)at(input,"/dataset/identity");identity.put("run_id",9002L);identity.put("repetition",3L);
        var queries=mock(com.vsos.backend.repository.common.Queries.class);
        var params=(Map<String,Object>)at(input,"/outcome/params");
        when(queries.aebValues(33L)).thenReturn(Map.of("TTC_THRESHOLD",((Number)params.get("ttc_threshold")).doubleValue(),
                "BRAKE_ACTIVATION_DELAY",((Number)params.get("brake_activation_delay")).doubleValue(),
                "MAX_DECELERATION",((Number)params.get("max_deceleration")).doubleValue(),
                "BRAKE_BUILDUP_RATE",((Number)params.get("brake_buildup_rate")).doubleValue()));
        var events=mock(org.springframework.context.ApplicationEventPublisher.class);
        var runs=new RunService(new Db(jdbc),queries,mock(com.vsos.backend.config.VehicSimProperties.class),
                mock(org.springframework.core.task.TaskExecutor.class),events,
                new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
                mock(com.vsos.backend.service.scenario.FamilyService.class),service);
        int before=jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_sources",Integer.class);
        jdbc.execute("CREATE TRIGGER audit_reject_completion BEFORE UPDATE ON simulation_runs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated audit rollback'");
        try {
            assertThatThrownBy(()->runs.submitCarlaResult(4,9002,7,input)).isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_sources",Integer.class)).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT status FROM simulation_runs WHERE id=9002",String.class)).isEqualTo("FAILED");
            verifyNoInteractions(events);
        } finally {jdbc.execute("DROP TRIGGER audit_reject_completion");}
        runs.submitCarlaResult(4,9002,7,input);
        var execution=adapter.analyze(4,7,9002,false,null);
        assertThat(service.download(Kind.SOURCE,4,execution.get("source_id").toString()))
                .isEqualTo(com.vsos.backend.common.Json.write(input).getBytes(StandardCharsets.UTF_8));
        assertThat(jdbc.queryForObject("SELECT status FROM simulation_runs WHERE id=9002",String.class)).isEqualTo("COMPLETED");
        verify(events).publishEvent(new RunService.RunFinished(9002));
    }
    @AfterAll void originalInputsUntouched()throws Exception {for(var e:originals.entrySet())assertThat(Files.readAllBytes(storage.runDir(e.getKey()).resolve("result.json"))).isEqualTo(e.getValue());}
    void assertReportValues(Map<String,Object> e) {
        for(var meta:service.list(Kind.REPORT,4,e.get("id").toString(),20,0)) {
            var report=FailureAnalysisJson.object(service.download(Kind.REPORT,4,meta.get("id").toString()));var input=FailureAnalysisJson.object(originals.get(Long.parseLong(meta.get("run_key").toString())));
            for(String key:CanonicalObjectiveReader.KEYS)assertThat(at(report,"/report/objectives/"+key+"/canonical_value/value")).isEqualTo(at(input,"/outcome/metrics/"+key));
            assertThat(EvidenceReport.contentDigest(report)).isEqualTo(report.get("content_digest"));assertThat(at(report,"/input/baseline_binding/v1_confirmation/status")).isNotEqualTo("VERIFIED");
        }
    }
    void writeEvidence(String name,Map<String,Object> e,Map<String,Object> inspection)throws Exception {
        Path dir=Path.of("target/fa-db-direct-evidence");Files.createDirectories(dir);
        Files.write(dir.resolve(name+"-execution.json"),FailureAnalysisJson.bytes(e));Files.write(dir.resolve(name+"-inspection.json"),FailureAnalysisJson.bytes(inspection));
        Files.write(dir.resolve(name+"-reports.json"),FailureAnalysisJson.bytes(obj("items",service.list(Kind.REPORT,4,e.get("id").toString(),20,0),"limit",20,"offset",0)));
        for(var m:service.list(Kind.REPORT,4,e.get("id").toString(),20,0))Files.write(dir.resolve(name+"-report-"+m.get("run_key")+".json"),service.download(Kind.REPORT,4,m.get("id").toString()));
        Files.write(dir.resolve(name+"-handoff-status.json"),FailureAnalysisJson.bytes(service.metadata(Kind.HANDOFF,4,e.get("handoff_id").toString())));
    }
}
