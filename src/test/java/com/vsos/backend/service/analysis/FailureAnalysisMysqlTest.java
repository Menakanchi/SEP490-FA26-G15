package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;

import com.vsos.backend.repository.analysis.FailureAnalysisStore;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind;
import com.vsos.backend.repository.common.Db;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Opt-in REAL MySQL integration. Only a disposable localhost fa_ber1_test database.
 * Never uses application datasource configuration or .env. Password stays in process env. */
@EnabledIfEnvironmentVariable(named="FA_BE_R1_MYSQL_URL",matches="jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/fa_ber1_test[?].*")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FailureAnalysisMysqlTest {
    JdbcTemplate jdbc;
    FailureAnalysisStore store;
    FailureAnalysisService service;
    @BeforeAll void isolatedSchemaAndUpgrade()throws Exception {
        var ds=new DriverManagerDataSource(System.getenv("FA_BE_R1_MYSQL_URL"),"root",System.getenv("FA_BE_R1_MYSQL_PASSWORD"));
        jdbc=new JdbcTemplate(ds);
        assertThat(jdbc.queryForObject("SELECT DATABASE()",String.class)).isEqualTo("fa_ber1_test");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()",Integer.class)).isZero();
        String base=Files.readString(Path.of("database/mysql/01_schema.sql"),StandardCharsets.UTF_8)
                .replace("CREATE DATABASE IF NOT EXISTS vehicsim ","CREATE DATABASE IF NOT EXISTS fa_ber1_test ")
                .replace("USE vehicsim;","USE fa_ber1_test;");
        try(var connection=ds.getConnection()) {ScriptUtils.executeSqlScript(connection,new ByteArrayResource(base.getBytes(StandardCharsets.UTF_8)));}
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()",Integer.class)).isEqualTo(34);
        // These four tables have just been created in this empty disposable DB; no historical rows exist.
        for(String table:List.of("fa_json_handoffs","fa_json_reports","fa_json_executions","fa_json_sources"))jdbc.execute("DROP TABLE "+table);
        try(var connection=ds.getConnection()) {ScriptUtils.executeSqlScript(connection,new org.springframework.core.io.FileSystemResource("database/mysql/migrations/020_2026-11-25_failure_analysis_json.sql"));}
        jdbc.update("INSERT INTO users(id,email,password_hash,role_id,last_name,first_name) SELECT 7,'fa-test@example.invalid','unused',id,'Test','FA' FROM roles WHERE code='ENGINEER'");
        jdbc.update("INSERT INTO projects(id,name,created_by_user_id) VALUES (1,'FA test A',7),(2,'FA test B',7)");
        store=new FailureAnalysisStore(new Db(jdbc),new DataSourceTransactionManager(ds));service=new FailureAnalysisService(store);
    }
    Map<String,Object> upload(byte[] raw)throws Exception{return service.ingest(1,7,new ByteArrayInputStream(raw),raw.length,null);}
    @ParameterizedTest @ValueSource(strings={"result_run2499_full_dataset.json","result_run2499_full_dataset_v2.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json",
            "vsos-collections-2026-11-24/vehicsim-variant-1034-collection.json"})
    void actualJdbcRoundTripAllRealInputs(String file)throws Exception {
        byte[] raw=FailureAnalysisServiceTest.input(file);var source=upload(raw);String sid=source.get("id").toString();
        assertThat(upload(raw).get("id")).isEqualTo(sid);
        var execution=service.analyze(1,sid,null);String eid=execution.get("id").toString();
        assertThat(execution.get("status")).isEqualTo("COMPLETED");
        var reload=new FailureAnalysisService(new FailureAnalysisStore(new Db(jdbc),new DataSourceTransactionManager(jdbc.getDataSource())));
        assertThat(reload.download(Kind.SOURCE,1,sid)).isEqualTo(raw);
        assertThat(reload.analyze(1,sid,null).get("id")).isEqualTo(eid);
        var reports=reload.list(Kind.REPORT,1,eid,20,0);assertThat(reports).hasSize(file.contains("collection")?2:1);
        for(var report:reports) {
            String rid=report.get("id").toString();assertThat(reload.download(Kind.REPORT,1,rid)).isEqualTo(service.download(Kind.REPORT,1,rid));
            assertThatThrownBy(()->reload.download(Kind.REPORT,2,rid)).hasMessage("RESOURCE_NOT_FOUND");
        }
        String hid=execution.get("handoff_id").toString();assertThat(reload.download(Kind.HANDOFF,1,hid)).isEqualTo(service.download(Kind.HANDOFF,1,hid));
        assertThatThrownBy(()->reload.download(Kind.HANDOFF,2,hid)).hasMessage("RESOURCE_NOT_FOUND");
    }
    @Test void databaseUniqueConstraintSerializesConcurrentDuplicates()throws Exception {
        byte[] raw=(new String(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json"),StandardCharsets.UTF_8)+"\n\n\n").getBytes(StandardCharsets.UTF_8);
        String sid=upload(raw).get("id").toString();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);Callable<String> task=()->{gate.await();return service.analyze(1,sid,null).get("id").toString();};
            var a=pool.submit(task);var b=pool.submit(task);gate.countDown();assertThat(a.get(30,TimeUnit.SECONDS)).isEqualTo(b.get(30,TimeUnit.SECONDS));
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_executions WHERE source_id=?",Integer.class,sid)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_reports WHERE source_id=?",Integer.class,sid)).isEqualTo(1);
    }
    @Test void childFailureReallyRollsBackAndRetryPersistsCompleteGraph()throws Exception {
        byte[] raw=(new String(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json"),StandardCharsets.UTF_8)+"\n\n\n\n").getBytes(StandardCharsets.UTF_8);
        String sid=upload(raw).get("id").toString();
        jdbc.execute("CREATE TRIGGER fa_test_reject_report BEFORE INSERT ON fa_json_reports FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic child failure'");
        try {assertThatThrownBy(()->service.analyze(1,sid,null)).isInstanceOf(org.springframework.dao.DataAccessException.class);}
        finally {jdbc.execute("DROP TRIGGER fa_test_reject_report");}
        for(String table:List.of("fa_json_executions","fa_json_reports","fa_json_handoffs"))
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE source_id=?",Integer.class,sid)).isZero();
        assertThat(service.analyze(1,sid,null).get("status")).isEqualTo("COMPLETED");
    }
    @Test void foreignKeysAndCorruptStoredBytesAreActuallyEnforced()throws Exception {
        byte[] raw=(new String(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json"),StandardCharsets.UTF_8)+"\n\n\n\n\n").getBytes(StandardCharsets.UTF_8);
        String sid=upload(raw).get("id").toString();String eid=service.analyze(1,sid,null).get("id").toString();
        String rid=service.list(Kind.REPORT,1,eid,20,0).getFirst().get("id").toString();byte[] saved=service.download(Kind.REPORT,1,rid);
        assertThatThrownBy(()->jdbc.update("INSERT INTO fa_json_reports(id,project_id,source_id,execution_id,dedupe_key,payload_bytes,payload_sha256,metadata_bytes,metadata_sha256) SELECT ?,2,source_id,execution_id,?,payload_bytes,payload_sha256,metadata_bytes,metadata_sha256 FROM fa_json_reports WHERE id=?",
                UUID.randomUUID().toString(),UUID.randomUUID().toString(),rid)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        jdbc.update("UPDATE fa_json_reports SET payload_bytes=? WHERE id=?","{}".getBytes(StandardCharsets.UTF_8),rid);
        try {assertThatThrownBy(()->service.download(Kind.REPORT,1,rid)).hasMessage("STORED_BYTE_DIGEST_MISMATCH");}
        finally {jdbc.update("UPDATE fa_json_reports SET payload_bytes=? WHERE id=?",saved,rid);}
        assertThat(service.download(Kind.REPORT,1,rid)).isEqualTo(saved);
    }
    @Test void partialCollectionActuallyPersistsValidMemberWithoutFakeHandoff()throws Exception {
        var json=FailureAnalysisJson.object(FailureAnalysisServiceTest.input("vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json"));
        json.put("runs",List.of(((List<?>)json.get("runs")).getFirst()));
        var source=upload(FailureAnalysisJson.bytes(json));var execution=service.analyze(1,source.get("id").toString(),null);
        assertThat(execution).containsEntry("status","PARTIAL").containsEntry("expected",2L).containsEntry("analyzed",1L).containsEntry("missing",1L);
        assertThat(service.list(Kind.REPORT,1,execution.get("id").toString(),20,0)).hasSize(1);
        String hid=execution.get("handoff_id").toString();
        assertThat(service.metadata(Kind.HANDOFF,1,hid).get("status")).isEqualTo("BLOCKED");
        assertThatThrownBy(()->service.download(Kind.HANDOFF,1,hid)).hasMessage("HANDOFF_NOT_GENERATED");
    }
    @Test void realWorkspaceArchiveBlocksWritesAndRetainsReadAccess()throws Exception {
        jdbc.update("INSERT INTO workspaces(id,name,manager_id,created_by_user_id) VALUES(99,'FA lifecycle test',7,7)");
        jdbc.update("INSERT INTO projects(id,workspace_id,name,created_by_user_id) VALUES(99,99,'FA workspace project',7)");
        byte[] raw=FailureAnalysisServiceTest.input("result_run2499_full_dataset.json");
        var source=service.ingest(99,7,new ByteArrayInputStream(raw),raw.length,null);String sid=source.get("id").toString();
        var execution=service.analyze(99,sid,null);
        jdbc.update("UPDATE workspaces SET status='ARCHIVED' WHERE id=99");
        assertThatThrownBy(()->service.ingest(99,7,new ByteArrayInputStream(raw),raw.length,null)).hasMessage("FA_PROJECT_OR_WORKSPACE_READ_ONLY");
        assertThatThrownBy(()->service.analyze(99,sid,null)).hasMessage("FA_PROJECT_OR_WORKSPACE_READ_ONLY");
        assertThat(service.download(Kind.SOURCE,99,sid)).isEqualTo(raw);
        assertThat(service.metadata(Kind.EXECUTION,99,execution.get("id").toString()).get("status")).isEqualTo("COMPLETED");
        jdbc.update("UPDATE workspaces SET status='ACTIVE' WHERE id=99");
        assertThat(service.analyze(99,sid,null).get("id")).isEqualTo(execution.get("id"));
    }
}
