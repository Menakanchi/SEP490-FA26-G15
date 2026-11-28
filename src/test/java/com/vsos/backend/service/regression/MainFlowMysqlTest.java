package com.vsos.backend.service.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.service.system.BootstrapService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.net.URI;
import java.net.http.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Actual HTTP + JWT + Spring transactions + isolated MySQL/Redis + Java simulator.
 * Opt-in, empty disposable database only. No team datasource, CARLA or LLM provider. */
@EnabledIfEnvironmentVariable(named="VSOS_AUDIT_MYSQL_URL",matches="jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_logic_audit_test[?].*")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "spring.config.import=optional:file:./target/logic-audit-no-env.properties",
        "vehicsim.simulator=kinematic","vehicsim.run-mode=inline","vehicsim.recover-on-startup=false",
        "vehicsim.data-root=${VSOS_AUDIT_DATA_ROOT:./target/e2e-flow-audit/main-flow}","spring.data.redis.host=127.0.0.1",
        "spring.data.redis.port=16379","app.env=development","app.auth.login-attempts-per-ip=100"})
class MainFlowMysqlTest {
    @DynamicPropertySource static void isolatedDatabase(DynamicPropertyRegistry properties) throws Exception {
        String url=System.getenv("VSOS_AUDIT_MYSQL_URL"),password=System.getenv("VSOS_AUDIT_MYSQL_PASSWORD");
        assertThat(url).matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_logic_audit_test[?].*");
        var ds=new DriverManagerDataSource(url,"root",password);
        var jdbc=new JdbcTemplate(ds);
        assertThat(jdbc.queryForObject("SELECT DATABASE()",String.class)).isEqualTo("vsos_logic_audit_test");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()",Integer.class)).isZero();
        String ddl=Files.readString(Path.of("database/mysql/01_schema.sql"),StandardCharsets.UTF_8)
                .replace("CREATE DATABASE IF NOT EXISTS vehicsim ","CREATE DATABASE IF NOT EXISTS vsos_logic_audit_test ")
                .replace("USE vehicsim;","USE vsos_logic_audit_test;");
        try(var connection=ds.getConnection()) { ScriptUtils.executeSqlScript(connection,new ByteArrayResource(ddl.getBytes(StandardCharsets.UTF_8))); }
        // Verify fresh schema and an upgrade from the former one-variant index on a disposable DB only.
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.statistics WHERE table_schema=DATABASE() "
                + "AND table_name='regression_test_items' AND index_name='uq_rti_test_baseline' ORDER BY seq_in_index",String.class))
                .containsExactly("regression_test_id","baseline_run_id");
        jdbc.execute("ALTER TABLE regression_test_items ADD UNIQUE KEY uq_rti_test_variant (regression_test_id,scenario_version_id), DROP INDEX uq_rti_test_baseline");
        try(var connection=ds.getConnection()) {
            ScriptUtils.executeSqlScript(connection,new ByteArrayResource(Files.readAllBytes(
                    Path.of("database/mysql/migrations/023_2026-11-26_regression-frozen-seeds.sql"))));
        }
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.statistics WHERE table_schema=DATABASE() "
                + "AND table_name='regression_test_items' AND index_name='uq_rti_test_baseline' ORDER BY seq_in_index",String.class))
                .containsExactly("regression_test_id","baseline_run_id");
        properties.add("spring.datasource.url",()->url);
        properties.add("spring.datasource.username",()->"root");
        properties.add("spring.datasource.password",()->password);
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired BootstrapService bootstrap;
    @Autowired com.vsos.backend.service.simulation.RunService runService;
    @Autowired com.vsos.backend.repository.common.Db db;
    @Autowired com.vsos.backend.repository.common.Queries queries;
    @Autowired com.vsos.backend.service.analysis.AnalysisService analysis;
    @Autowired com.vsos.backend.repository.analysis.FailureAnalysisStore faStore;
    @Autowired com.vsos.backend.service.analysis.FailureAnalysisService failureAnalysis;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    private long projectId;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final String BASE="/api/v1/vehicsim";
    private static final String PASSWORD="Audit-only-2026!";

    private HttpResponse<byte[]> request(String method,String path,String token,Object body,int status) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(60));
        if(token!=null) builder.header("Authorization","Bearer "+token).header("X-VehicSim-Project",String.valueOf(projectId));
        builder.header("Content-Type","application/json");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(Json.write(body)));
        var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.statusCode()).as("%s %s: %s",method,path,new String(response.body(),StandardCharsets.UTF_8)).isEqualTo(status);
        return response;
    }
    private Map<String,Object> json(String method,String path,String token,Object body,int status) throws Exception {
        return Json.parseMap(new String(request(method,path,token,body,status).body(),StandardCharsets.UTF_8));
    }
    private long id(Map<String,Object> data,String key) { return ((Number)data.get(key)).longValue(); }
    private long user(String email,String role) {
        jdbc.update("INSERT INTO users(email,password_hash,role_id,last_name,first_name) SELECT ?,?,id,'Audit','User' FROM roles WHERE code=?",
                email,encoder.encode(PASSWORD),role);
        return jdbc.queryForObject("SELECT id FROM users WHERE email=?",Long.class,email);
    }
    private String login(String email) throws Exception {
        return json("POST","/api/v1/auth/login",null,Json.obj("email",email,"password",PASSWORD),200).get("access_token").toString();
    }
    private void awaitRuns() throws Exception {
        long deadline=System.nanoTime()+Duration.ofSeconds(45).toNanos();
        while(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE project_id=? AND status IN ('PENDING','RUNNING')",Integer.class,projectId)>0) {
            if(System.nanoTime()>deadline) fail("Simulation did not finish within 45 seconds");
            Thread.sleep(100);
        }
        assertThat(jdbc.queryForList("SELECT id,status,error_message FROM simulation_runs WHERE project_id=? AND status<>'COMPLETED'",projectId)).isEmpty();
    }

    @Test void designBaselineAnalysisCandidateRegressionAndReviewerDecision() throws Exception {
        long admin=user("audit-admin@example.invalid","ADMIN");
        long engineerId=user("audit-engineer@example.invalid","EXPERIENCER");
        long reviewerId=user("audit-reviewer@example.invalid","EXPERIENCER");
        long managerId=user("audit-manager@example.invalid","MANAGER");
        projectId=id(bootstrap.ensureDefaultProject(admin),"project_id");
        long workspaceId=jdbc.queryForObject("SELECT workspace_id FROM projects WHERE id=?",Long.class,projectId);
        jdbc.update("UPDATE workspaces SET manager_id=? WHERE id=?",managerId,workspaceId);
        String manager=login("audit-manager@example.invalid");
        json("POST",BASE+"/workspaces/"+workspaceId+"/members",manager,Json.obj("user_id",engineerId,"role","ENGINEER"),201);
        json("POST",BASE+"/workspaces/"+workspaceId+"/members",manager,Json.obj("user_id",reviewerId,"role","REVIEWER"),201);
        user("audit-outsider@example.invalid","ENGINEER");
        bootstrap.ensureDefaultProject(admin); // Repeated bootstrap must never grant outsiders membership.
        String engineer=login("audit-engineer@example.invalid"),reviewer=login("audit-reviewer@example.invalid");
        String outsider=login("audit-outsider@example.invalid");
        // Team project was created by the admin, not by this engineer; workspace membership grants visibility.
        var engineerProjects=json("GET",BASE+"/projects",engineer,null,200);
        assertThat(Json.asList(engineerProjects.get("items")).stream().map(Json::asMap).toList())
                .anySatisfy(item -> assertThat(id(item,"id")).isEqualTo(projectId));
        assertThat(Json.asList(json("GET",BASE+"/projects",outsider,null,200).get("items"))).isEmpty();
        var workspace=json("GET",BASE+"/workspaces/"+workspaceId,engineer,null,200);
        assertThat(Json.asList(workspace.get("projects")).stream().map(Json::asMap).toList())
                .anySatisfy(item -> {
                    assertThat(id(item,"id")).isEqualTo(projectId);
                    assertThat(((Number)item.get("member_count")).intValue()).isEqualTo(2);
                });
        request("GET",BASE+"/families",null,null,401);
        var definition=Json.obj("name","Phân tích lỗi — audit","ego_speeds_kmh",List.of(40,70),"trigger_distances_m",List.of(30),
                "pedestrian_speeds_mps",List.of(1.5),"stops_at_curb",List.of(false,true),"weathers",List.of("CLEAR"),
                "times_of_day",List.of("DAY"),"run_baseline",false);
        request("POST",BASE+"/families",manager,definition,403);
        long scenario=id(json("POST",BASE+"/families",engineer,definition,201),"scenario_id");
        request("GET",BASE+"/analysis/dataset?scenario_id="+scenario,outsider,null,404);
        long baseline=jdbc.queryForObject("SELECT id FROM aeb_versions WHERE project_id=? AND status='BASELINE'",Long.class,projectId);
        json("POST",BASE+"/families/"+scenario+"/run",engineer,Json.obj("with_aeb_off",true),202);
        awaitRuns();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE project_id=?",Integer.class,projectId)).isEqualTo(8);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM failures f JOIN simulation_runs r ON r.id=f.simulation_run_id WHERE r.aeb_mode='OFF'",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM collision_events c JOIN simulation_runs r ON r.id=c.simulation_run_id WHERE r.aeb_mode='OFF'",Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE aeb_mode='OFF' AND (aeb_activated=1 OR is_false_positive=1 OR is_false_negative=1)",Integer.class)).isZero();
        long referenceRun=jdbc.queryForObject("SELECT MIN(id) FROM simulation_runs WHERE project_id=? AND aeb_mode='OFF'",Long.class,projectId);
        long referenceVariant=jdbc.queryForObject("SELECT scenario_version_id FROM simulation_runs WHERE id=?",Long.class,referenceRun);
        var byVariant=json("GET",BASE+"/analysis/runs?variant_id="+referenceVariant,engineer,null,200);
        var variantItems=Json.asList(byVariant.get("items")).stream().map(Json::asMap).toList();
        assertThat(variantItems).hasSize(2);
        assertThat(variantItems).anySatisfy(item -> {
            assertThat(id(item,"run_id")).isEqualTo(referenceRun);
            assertThat(item).containsEntry("aeb_mode","OFF").containsEntry("outcome","REFERENCE");
        });
        assertThat(Json.asMap(byVariant.get("counts"))).containsEntry("REFERENCE",1);
        var referenceInspection=json("GET",BASE+"/analysis/runs/"+referenceRun,engineer,null,200);
        assertThat(Json.asMap(referenceInspection.get("run"))).containsEntry("aeb_mode","OFF").containsEntry("outcome","REFERENCE");
        var baselineOnly=json("GET",BASE+"/analysis/runs?scenario_id="+scenario,engineer,null,200);
        assertThat(Json.asList(baselineOnly.get("items"))).allSatisfy(item -> assertThat(Json.asMap(item)).doesNotContainEntry("aeb_mode","OFF"));
        // Seed fixture setup only: all results below are produced by the real Java simulator, never inserted.
        var variants=jdbc.queryForList("SELECT id,scenario_ir_json FROM scenario_versions WHERE scenario_id=? AND source='GENERATED'",scenario)
                .stream().map(com.vsos.backend.repository.common.Row::new).toList();
        long vehicle=jdbc.queryForObject("SELECT carla_vehicle_model_id FROM simulation_runs WHERE project_id=? LIMIT 1",Long.class,projectId);
        var secondSeeds=runService.createRuns(projectId,scenario,variants,vehicle,baseline,engineerId,"BASELINE",null,null);
        for(long runId:secondSeeds) jdbc.update("UPDATE simulation_runs SET random_seed=random_seed+100000 WHERE id=? AND status='PENDING'",runId);
        // Exercise the actual worker completion path while both interactive FA slots are held.
        // The simulator, producer JSON and database transactions are real, but this is not CARLA.
        var originalRun=new com.vsos.backend.repository.common.Row(jdbc.queryForMap(
                "SELECT * FROM simulation_runs WHERE project_id=? AND status='COMPLETED' LIMIT 1",projectId));
        byte[] original=failureAnalysis.producerResult(originalRun).body();
        var entered=new CountDownLatch(2);var release=new CountDownLatch(1);
        class HeldInput extends ByteArrayInputStream {
            boolean held;
            HeldInput(){super(original);}
            @Override public synchronized int read(byte[] bytes,int offset,int length) {
                if(!held){held=true;entered.countDown();try {
                    if(!release.await(60,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");
                } catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
                return super.read(bytes,offset,length);
            }
        }
        try(var pool=Executors.newFixedThreadPool(secondSeeds.size()+2)) {
            var first=pool.submit(()->failureAnalysis.ingest(projectId,engineerId,new HeldInput(),original.length,null));
            var second=pool.submit(()->failureAnalysis.ingest(projectId,engineerId,new HeldInput(),original.length,null));
            try {
                assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
                var start=new CountDownLatch(1);var workers=new ArrayList<Future<?>>();
                for(long runId:secondSeeds)workers.add(pool.submit(()->{
                    if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException("test start timeout");
                    runService.executeRun(runId);return null;
                }));
                start.countDown();
                for(var worker:workers)worker.get(45,TimeUnit.SECONDS);
                for(long runId:secondSeeds) {
                    var row=new com.vsos.backend.repository.common.Row(jdbc.queryForMap("SELECT * FROM simulation_runs WHERE id=?",runId));
                    assertThat(row.str("status")).as("run %s: %s",runId,row.str("error_message")).isEqualTo("COMPLETED");
                    var source=failureAnalysis.producerResult(row);
                    assertThat(source).isNotNull();
                    var producer=Json.parseMap(new String(source.body(),StandardCharsets.UTF_8));
                    assertThat(((Number)Json.asMap(producer.get("source")).get("run_id")).longValue()).isEqualTo(runId);
                    assertThat(producer.get("simulator")).isEqualTo(com.vsos.backend.service.simulation.RunService.KINEMATIC_SIMULATOR);
                }
            } finally {release.countDown();}
            first.get(30,TimeUnit.SECONDS);second.get(30,TimeUnit.SECONDS);
        }
        awaitRuns();
        var dataset=json("GET",BASE+"/analysis/dataset?scenario_id="+scenario,engineer,null,200);
        assertThat(Json.asList(dataset.get("variants"))).hasSize(4);
        var dashboard=json("GET",BASE+"/analysis/runs?scenario_id="+scenario,engineer,null,200);
        assertThat(id(dashboard,"total")).isEqualTo(8);
        var optimization=new ArrayList<Long>();var validation=new ArrayList<Long>();var revisions=new LinkedHashMap<String,String>();
        for(Object value:Json.asList(dashboard.get("items"))) {
            var item=Json.asMap(value);long runId=id(item,"run_id");
            double speed=jdbc.queryForObject("SELECT JSON_EXTRACT(run_config_json,'$.ego_speed_kmh') FROM simulation_runs WHERE id=?",Double.class,runId);
            (speed==40?optimization:validation).add(runId);
            revisions.put(String.valueOf(runId),item.get("revision").toString());
        }
        var selection=json("POST",BASE+"/analysis/selections",engineer,Json.obj("scenario_id",scenario,"baseline_id",baseline,
                "optimization_run_ids",optimization,"validation_run_ids",validation,"run_revisions",revisions),200);
        long selectionId=id(selection,"id");
        assertThat(Json.asMap(selection.get("evaluation"))).containsEntry("impact","RELATIVE_SPEED_CORE_COLLISION_TICK");
        var handoff=json("GET",BASE+"/analysis/datasets/"+selectionId+"/handoff",engineer,null,200);
        assertThat(handoff).containsEntry("handoff_ready",true);
        String datasetDigest=handoff.get("dataset_digest").toString();
        assertThat(datasetDigest).matches("[a-f0-9]{64}");
        // A later baseline repetition must never replace the exact source IDs already sealed by FA.
        json("POST",BASE+"/families/"+scenario+"/run",engineer,Json.obj("with_aeb_off",false),202);
        awaitRuns();
        var frozenSpace=Json.obj("TTC_THRESHOLD",List.of(1.5,1.5),"BRAKE_ACTIVATION_DELAY",List.of(.14,.1498),
                "BRAKE_BUILDUP_RATE",List.of(20,20),"MAX_DECELERATION",List.of(8,8));
        var campaignRequest=Json.obj("scenario_id",scenario,"base_aeb_version_id",baseline,"max_trials",2,"n_initial_points",1,
                "search_space",frozenSpace,"simulator_type","KINEMATIC","dataset_id",selectionId,"dataset_digest",datasetDigest);
        var tampered=new LinkedHashMap<>(campaignRequest);tampered.put("dataset_digest","0".repeat(64));
        request("POST",BASE+"/optimizations",engineer,tampered,400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM optimization_runs",Integer.class)).isZero();
        request("POST",BASE+"/optimizations",outsider,campaignRequest,404);
        long frozenCampaign=id(json("POST",BASE+"/optimizations",engineer,campaignRequest,201),"id");
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,frozenCampaign)).isEqualTo("COMPLETED");
        var frozenTrials=jdbc.queryForList("SELECT id FROM optimization_trials WHERE optimization_run_id=? AND status='COMPLETED' ORDER BY trial_number",Long.class,frozenCampaign);
        assertThat(frozenTrials).hasSize(2);
        assertThat(jdbc.queryForList("SELECT sampling_source FROM optimization_trials WHERE optimization_run_id=? ORDER BY trial_number",String.class,frozenCampaign))
                .containsExactly("INITIAL_DESIGN","ACQUISITION");
        assertThat(jdbc.queryForObject("SELECT acquisition_value FROM optimization_trials WHERE optimization_run_id=? AND trial_number=2",Double.class,frozenCampaign))
                .isNotNull().isFinite().isGreaterThanOrEqualTo(0);
        var sourceVariants=jdbc.queryForList("SELECT scenario_version_id FROM simulation_runs WHERE id IN ("+String.join(",",optimization.stream().map(String::valueOf).toList())+")",Long.class);
        for(long trialId:frozenTrials) {
            var trialSources=jdbc.queryForList("SELECT baseline_run_id FROM simulation_runs WHERE optimization_trial_id=?",Long.class,trialId);
            assertThat(trialSources).containsExactlyInAnyOrderElementsOf(optimization);
            assertThat(jdbc.queryForList("SELECT scenario_version_id FROM simulation_runs WHERE optimization_trial_id=?",Long.class,trialId))
                    .containsExactlyInAnyOrderElementsOf(sourceVariants);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id "
                + "JOIN optimization_trials t ON t.id=c.optimization_trial_id WHERE t.optimization_run_id=? AND "
                + "(c.random_seed<>b.random_seed OR c.simulator_version<>b.simulator_version OR c.carla_vehicle_model_id<>b.carla_vehicle_model_id)",Integer.class,frozenCampaign)).isZero();
        long paretoTrial=jdbc.queryForObject("SELECT id FROM optimization_trials WHERE optimization_run_id=? AND is_pareto_optimal=1 AND constraint_violated=0 ORDER BY trial_number LIMIT 1",Long.class,frozenCampaign);
        var verified=json("POST",BASE+"/optimizations/"+frozenCampaign+"/select/"+paretoTrial,engineer,null,200);
        long frozenTest=id(verified,"regression_test_id"),frozenCandidate=id(verified,"candidate_aeb_version_id");
        awaitRuns();
        assertThat(id(json("POST",BASE+"/optimizations/"+frozenCampaign+"/select/"+paretoTrial,engineer,null,200),"regression_test_id")).isEqualTo(frozenTest);
        assertThat(jdbc.queryForList("SELECT baseline_run_id FROM simulation_runs WHERE regression_test_id=?",Long.class,frozenTest))
                .containsExactlyInAnyOrderElementsOf(validation);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM regression_test_items WHERE regression_test_id=?",Integer.class,frozenTest)).isEqualTo(validation.size());
        assertThat(jdbc.queryForObject("SELECT verdict FROM regression_tests WHERE id=?",String.class,frozenTest)).isEqualTo("PASSED");
        // A design label alone cannot turn a false-braking run into an approved nonhazard control.
        var oldMembers=new ArrayList<Long>(optimization);oldMembers.addAll(validation);
        var oldControls=oldMembers.stream().filter(run -> Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT sv.stops_at_curb FROM simulation_runs r JOIN scenario_versions sv ON sv.id=r.scenario_version_id WHERE r.id=?",Boolean.class,run))).toList();
        assertThat(json("POST",BASE+"/analysis/v3/contexts",engineer,Json.obj("dataset_id",selectionId,
                "dataset_digest",datasetDigest,"confirmed",true,"canonical_targets_only",true,
                "calibration_not_applicable",true,"reason","Reject false-braking design controls",
                "nonhazard_run_ids",oldControls),400)).containsEntry("code","V3_NONHAZARD_REVIEW_CONFLICT");
        var v3 = exerciseV3(engineer, outsider, baseline);
        // A historical OFF failure must not pollute any aggregate, page, family or CSV export.
        long offRun=jdbc.queryForObject("SELECT MIN(id) FROM simulation_runs WHERE aeb_mode='OFF'",Long.class);
        jdbc.update("INSERT INTO failures(simulation_run_id,failure_type,severity,description) VALUES(?,'COLLISION','HIGH','Legacy OFF fixture')",offRun);
        var failures=json("GET",BASE+"/failures?scenario_id="+scenario,engineer,null,200);
        long expected=jdbc.queryForObject("SELECT COUNT(*) FROM failures f JOIN simulation_runs r ON r.id=f.simulation_run_id WHERE r.aeb_mode='ON' AND r.scenario_id=?",Long.class,scenario);
        assertThat(id(failures,"total")).isEqualTo(expected);
        assertThat(id(Json.asMap(failures.get("kpis")),"total")).isEqualTo(expected);
        assertThat(Json.asList(failures.get("items"))).allSatisfy(item -> assertThat(id(Json.asMap(item),"run_id")).isNotEqualTo(offRun));
        var csv=request("GET",BASE+"/failures.csv?scenario_id="+scenario,engineer,null,200).body();
        assertThat(csv).startsWith((byte)0xef,(byte)0xbb,(byte)0xbf);
        assertThat(new String(csv,StandardCharsets.UTF_8)).doesNotContain("Legacy OFF fixture");
        // Same values except a tiny delay adjustment: exercise a real candidate, keep comparison deterministic.
        long candidate=id(json("POST",BASE+"/aeb/versions",engineer,
                Json.obj("parent_version_id",baseline,"label","Audit candidate","values",Json.obj("BRAKE_ACTIVATION_DELAY",.1499)),201),"id");
        long test=id(json("POST",BASE+"/regression",engineer,
                Json.obj("candidate_version_id",candidate,"scenario_id",scenario,"include_all_variants",true),201),"id");
        awaitRuns();
        assertThat(jdbc.queryForObject("SELECT execution_status FROM regression_tests WHERE id=?",String.class,test)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT verdict FROM regression_tests WHERE id=?",String.class,test)).isEqualTo("PASSED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id WHERE c.regression_test_id=? AND (c.random_seed<>b.random_seed OR c.simulator_version<>b.simulator_version OR c.carla_vehicle_model_id<>b.carla_vehicle_model_id OR b.aeb_mode<>'ON')",Integer.class,test)).isZero();
        var regressionCsv=request("GET",BASE+"/regression/"+test+"/export.csv",reviewer,null,200).body();
        assertThat(regressionCsv).startsWith((byte)0xef,(byte)0xbb,(byte)0xbf);
        var decision=Json.obj("decision","ACCEPT","reason","Isolated HTTP audit with matching seeds and complete evidence","confirmed",true);
        request("POST",BASE+"/recommendations/"+frozenTest+"/decision",engineer,decision,403);
        json("POST",BASE+"/recommendations/"+frozenTest+"/decision",reviewer,decision,200);
        assertThat(jdbc.queryForObject("SELECT status FROM aeb_versions WHERE id=?",String.class,frozenCandidate)).isEqualTo("BASELINE");
        assertThat(jdbc.queryForObject("SELECT status FROM aeb_versions WHERE id=?",String.class,baseline)).isEqualTo("ARCHIVED");
        request("GET",BASE+"/analysis/datasets/"+selectionId+"/handoff",engineer,null,400);
        assertThat(json("GET",BASE+"/analysis/datasets/"+selectionId,engineer,null,200)).containsEntry("baseline_current",false);
        request("POST",BASE+"/optimizations",engineer,campaignRequest,400);
        request("GET",BASE+"/analysis/v3/handoffs/"+v3.get("handoff_id")+"/campaign?digest="+v3.get("handoff_digest"),engineer,null,409);
        var space=Json.obj("TTC_THRESHOLD",List.of(1.5,1.5),"BRAKE_ACTIVATION_DELAY",List.of(.14,.1498),
                "BRAKE_BUILDUP_RATE",List.of(20,20),"MAX_DECELERATION",List.of(8,8));
        long campaign=id(json("POST",BASE+"/optimizations",engineer,Json.obj("scenario_id",scenario,
                "base_aeb_version_id",frozenCandidate,"max_trials",1,"n_initial_points",1,"search_space",space,"simulator_type","KINEMATIC"),201),"id");
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,campaign)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM optimization_trials WHERE optimization_run_id=? AND status='COMPLETED' AND rms_jerk_mps3 IS NOT NULL AND impact_speed_mps IS NOT NULL AND stopping_distance_m IS NOT NULL",Integer.class,campaign)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT v.param_value FROM optimization_trials t JOIN aeb_parameter_values v ON v.aeb_version_id=t.candidate_aeb_version_id JOIN aeb_parameters p ON p.id=v.parameter_id WHERE t.optimization_run_id=? AND p.code='BRAKE_ACTIVATION_DELAY'",Double.class,campaign)).isBetween(.14,.1498);
        request("POST",BASE+"/optimizations/"+campaign+"/cancel",engineer,null,400);
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,campaign)).isEqualTo("COMPLETED");
        // Crash/cancel fixtures in this disposable DB: no real worker or request remains active.
        long trial=jdbc.queryForObject("SELECT id FROM optimization_trials WHERE optimization_run_id=?",Long.class,campaign);
        long optimizationChild=jdbc.queryForObject("SELECT MIN(id) FROM simulation_runs WHERE optimization_trial_id=?",Long.class,trial);
        long regressionChild=jdbc.queryForObject("SELECT MIN(id) FROM simulation_runs WHERE regression_test_id=?",Long.class,test);
        jdbc.update("UPDATE optimization_runs SET status='RUNNING' WHERE id=?",campaign);
        jdbc.update("UPDATE optimization_trials SET status='RUNNING' WHERE id=?",trial);
        jdbc.update("UPDATE regression_tests SET execution_status='CANCELLED',verdict='PENDING' WHERE id=?",test);
        jdbc.update("UPDATE simulation_runs SET status='PENDING' WHERE id IN (?,?)",optimizationChild,regressionChild);
        assertThat(runService.recoverUnfinished()).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,campaign)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_trials WHERE id=?",String.class,trial)).isEqualTo("FAILED");
        assertThat(jdbc.queryForList("SELECT status FROM simulation_runs WHERE id IN (?,?)",String.class,optimizationChild,regressionChild)).containsOnly("STOPPED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM optimization_trials WHERE id=? AND rms_jerk_mps3 IS NOT NULL AND impact_speed_mps IS NOT NULL AND stopping_distance_m IS NOT NULL",Integer.class,trial)).isEqualTo(1);
        jdbc.update("UPDATE optimization_runs SET status='CANCELLED' WHERE id=?",campaign);
        jdbc.update("UPDATE optimization_trials SET status='RUNNING' WHERE id=?",trial);
        jdbc.update("UPDATE simulation_runs SET status='PENDING' WHERE id=?",optimizationChild);
        assertThat(runService.recoverUnfinished()).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_trials WHERE id=?",String.class,trial)).isEqualTo("PRUNED");
        assertThat(jdbc.queryForObject("SELECT status FROM simulation_runs WHERE id=?",String.class,optimizationChild)).isEqualTo("STOPPED");
        System.out.println("AUDIT_MAIN_FLOW_OK: 4 variants, ON/OFF and multiple real seeds, sealed FA -> 2 MOBO trials -> frozen validation -> Reviewer Accept; actual HTTP/MySQL/Redis and Java kinematics only, NOT CARLA");
        System.out.println("AUDIT_FROZEN_COHORT_OK: exact optimization source runs and 4 validation source runs, distinct-seed same-variant pairs, later baseline repetitions excluded, duplicate select reused, stale/checksum/scope gates retained");
        System.out.println("AUDIT_MOBO_OK: one real kinematic trial, requested narrow bounds and three recorded objectives");
        System.out.println("AUDIT_STARTUP_RECOVERY_OK: interrupted/cancelled parents never redispatch their children; stored metrics retained");
    }

    /** No fixture targets are inserted: all source documents and candidate metrics here
     * originate in the real Java simulator used above. This is integration, not CARLA. */
    private Map<String,Object> exerciseV3(String engineer, String outsider, long baseline) throws Exception {
        // The older V2 fixture deliberately has a false-braking curb case at 40 km/h.
        // V3 requires reviewed genuine nonhazard controls, so generate an independent
        // family and retain the real 70 km/h curb control beside the 40 km/h hazard.
        long scenario=id(json("POST",BASE+"/families",engineer,Json.obj("name","V3 recorded-target integration",
                "ego_speeds_kmh",List.of(40,70),"trigger_distances_m",List.of(30),"pedestrian_speeds_mps",List.of(1.5),
                "stops_at_curb",List.of(false,true),"weathers",List.of("CLEAR","RAIN"),"times_of_day",List.of("DAY"),"run_baseline",false),201),"scenario_id");
        json("POST",BASE+"/families/"+scenario+"/run",engineer,Json.obj("with_aeb_off",false),202);awaitRuns();
        var dashboard=json("GET",BASE+"/analysis/runs?scenario_id="+scenario,engineer,null,200);
        var optimization=new ArrayList<Long>();var validation=new ArrayList<Long>();var revisions=new LinkedHashMap<String,String>();
        for(Object value:Json.asList(dashboard.get("items"))) {
            var item=Json.asMap(value);long run=id(item,"run_id");
            var design=new com.vsos.backend.repository.common.Row(jdbc.queryForMap("SELECT sv.* FROM simulation_runs r JOIN scenario_versions sv ON sv.id=r.scenario_version_id WHERE r.id=?",run));
            boolean control=design.bool("stops_at_curb");double speed=design.dbl("ego_speed_kmh");
            if(speed==40&&!control||speed==70&&control) {
                ("CLEAR".equals(design.str("weather"))?optimization:validation).add(run);
                revisions.put(Long.toString(run),item.get("revision").toString());
            }
        }
        assertThat(optimization).hasSize(2);assertThat(validation).hasSize(2);
        long selection=id(json("POST",BASE+"/analysis/selections",engineer,Json.obj("scenario_id",scenario,"baseline_id",baseline,
                "optimization_run_ids",optimization,"validation_run_ids",validation,"run_revisions",revisions),200),"id");
        String digest=json("GET",BASE+"/analysis/datasets/"+selection+"/handoff",engineer,null,200).get("dataset_digest").toString();
        List<Long> all = new ArrayList<>(optimization); all.addAll(validation);
        List<Long> nonhazard = new ArrayList<>();
        for (long run : all) {
            var saved = jdbc.queryForMap("SELECT id,attempt,collision_occurred,is_false_positive,is_false_negative FROM simulation_runs WHERE id=?",run);
            String producerKey = com.vsos.backend.common.analysis.FailureAnalysisJson.producerResultKey(projectId,run,((Number)saved.get("attempt")).longValue());
            var stored = jdbc.queryForMap("SELECT id,payload_bytes,payload_sha256 FROM fa_json_sources WHERE project_id=? AND dedupe_key=?",projectId,producerKey);
            byte[] raw = (byte[]) stored.get("payload_bytes");
            assertThat(com.vsos.core.failureanalysis.Evidence.sha256(raw)).isEqualTo(stored.get("payload_sha256"));
            var source = Json.parseMap(new String(raw,StandardCharsets.UTF_8));
            assertThat(id(Json.asMap(source.get("source")),"run_id")).isEqualTo(run);
            assertThat(source).containsEntry("simulator","vehicsim-kinematic-1.4");
            assertThat(request("GET",BASE+"/analysis/v3/sources/"+stored.get("id")+"/download",engineer,null,200).body()).isEqualTo(raw);
            Boolean collision=jdbc.queryForObject("SELECT collision_occurred FROM simulation_runs WHERE id=?",Boolean.class,run);
            Boolean falsePositive=jdbc.queryForObject("SELECT is_false_positive FROM simulation_runs WHERE id=?",Boolean.class,run);
            Boolean falseNegative=jdbc.queryForObject("SELECT is_false_negative FROM simulation_runs WHERE id=?",Boolean.class,run);
            if(Boolean.FALSE.equals(collision)&&Boolean.FALSE.equals(falsePositive)&&Boolean.FALSE.equals(falseNegative)) {
                // Review the actual design/control case, rather than declaring every no-collision run nonhazard.
                Boolean curb=jdbc.queryForObject("SELECT sv.stops_at_curb FROM simulation_runs r JOIN scenario_versions sv ON sv.id=r.scenario_version_id WHERE r.id=?",Boolean.class,run);
                if(Boolean.TRUE.equals(curb)) nonhazard.add(run);
            }
        }
        assertThat(nonhazard.stream().anyMatch(optimization::contains)).isTrue();
        assertThat(nonhazard.stream().anyMatch(validation::contains)).isTrue();
        var space=Json.obj("TTC_THRESHOLD",List.of(1.5,1.5001),"BRAKE_ACTIVATION_DELAY",List.of(.14,.1498),
                "BRAKE_BUILDUP_RATE",List.of(19.9999,20),"MAX_DECELERATION",List.of(7.9999,8));
        var review=Json.obj("dataset_id",selection,"dataset_digest",digest,"confirmed",true,
                "reason","Authenticated isolated review of actual recorded canonical objectives, safe design controls and frozen holdout; no physical safety certification",
                "canonical_targets_only",true,"calibration_not_applicable",true,"nonhazard_run_ids",nonhazard,"search_space",space);
        var invalid=new LinkedHashMap<>(review);invalid.put("confirmed",false);
        request("POST",BASE+"/analysis/v3/contexts",engineer,invalid,400);
        invalid=new LinkedHashMap<>(review);invalid.put("canonical_targets_only",false);
        request("POST",BASE+"/analysis/v3/contexts",engineer,invalid,400);
        invalid=new LinkedHashMap<>(review);invalid.put("calibration_not_applicable",false);
        request("POST",BASE+"/analysis/v3/contexts",engineer,invalid,400);
        invalid=new LinkedHashMap<>(review);invalid.put("search_space",Map.of());
        request("POST",BASE+"/analysis/v3/contexts",engineer,invalid,400);
        invalid=new LinkedHashMap<>(review);invalid.put("dataset_digest","0".repeat(64));
        request("POST",BASE+"/analysis/v3/contexts",engineer,invalid,409);
        var context=json("POST",BASE+"/analysis/v3/contexts",engineer,review,201);
        String contextId=context.get("context_id").toString();
        assertThat(json("POST",BASE+"/analysis/v3/contexts",engineer,review,201).get("context_id")).isEqualTo(contextId);
        long contextRow=jdbc.queryForObject("SELECT id FROM analysis_results WHERE project_id=? AND method='FA_V3_CONTEXT' "
                +"AND JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.context_id'))=?",Long.class,projectId,contextId);
        request("GET",BASE+"/analysis/datasets/"+contextRow,engineer,null,404);
        request("GET",BASE+"/analysis/v3/contexts/"+contextId,outsider,null,404);
        assertThat(json("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,200).get("context_digest"))
                .isEqualTo(context.get("context_digest"));
        request("POST",BASE+"/analysis/v3/sources/"+context.get("source_id")+"/executions?context_id="+UUID.randomUUID(),engineer,null,404);
        var execution=json("POST",BASE+"/analysis/v3/contexts/"+contextId+"/executions",engineer,null,201);
        var retry=json("POST",BASE+"/analysis/v3/contexts/"+contextId+"/executions",engineer,null,201);
        assertThat(retry.get("id")).isEqualTo(execution.get("id"));
        assertThat(retry.get("handoff_id")).isEqualTo(execution.get("handoff_id"));
        String handoffId=execution.get("handoff_id").toString();
        var handoff=json("GET",BASE+"/analysis/v3/handoffs/"+handoffId,engineer,null,200);
        assertThat(handoff).containsEntry("status","READY").containsEntry("dispatch_allowed",true);
        String handoffDigest=handoff.get("content_digest").toString();
        var document=json("GET",BASE+"/analysis/v3/handoffs/"+handoffId+"/download",engineer,null,200);
        assertThat(document.get("schema_version")).isEqualTo("vehicsim.failure-analysis-mobo-handoff/v1");
        assertThat(Json.asMap(document.get("baseline_objectives"))).containsEntry("availability","KNOWN");
        assertThat(Json.asMap(document.get("runtime_consumer"))).containsEntry("context_id",contextId)
                .containsEntry("campaign_contract","vehicsim.fa-v3-campaign/v1");
        var unsupported=new LinkedHashMap<>(document);unsupported.put("schema_version","unsupported-contract");
        assertThat(com.vsos.backend.service.analysis.FailureAnalysisHandoffService.readiness(unsupported))
                .contains("V3_HANDOFF_CONTRACT_UNSUPPORTED");
        var projection=json("GET",BASE+"/analysis/v3/handoffs/"+handoffId+"/campaign?digest="+handoffDigest,engineer,null,200);
        assertThat(projection.get("schema")).isEqualTo("vehicsim.fa-v3-campaign/v1");
        assertThat(Json.asList(projection.get("optimization_run_ids")).stream().map(x->((Number)x).longValue()).toList())
                .containsExactlyInAnyOrderElementsOf(optimization);
        assertThat(Json.asList(projection.get("validation_run_ids")).stream().map(x->((Number)x).longValue()).toList())
                .containsExactlyInAnyOrderElementsOf(validation);
        var freshHandoffs=new com.vsos.backend.service.analysis.FailureAnalysisHandoffService(db,queries,analysis,faStore,transactions);
        assertThat(freshHandoffs.context(projectId,contextId).get("context_digest")).isEqualTo(context.get("context_digest"));
        var loadedProjection=freshHandoffs.campaign(projectId,handoffId,handoffDigest);
        assertThat(loadedProjection.get("dataset_digest")).isEqualTo(projection.get("dataset_digest"));
        assertThat(com.vsos.backend.service.analysis.AnalysisService.datasetDigest(loadedProjection))
                .isEqualTo(com.vsos.backend.service.analysis.AnalysisService.datasetDigest(projection));
        var beans=new org.springframework.beans.factory.support.StaticListableBeanFactory(Map.of("handoffs",freshHandoffs));
        var freshAnalysis=new com.vsos.backend.service.analysis.FailureAnalysisService(faStore,
                beans.getBeanProvider(com.vsos.backend.service.analysis.FailureAnalysisHandoffService.class));
        var loadedExecution=freshAnalysis.executeContext(projectId,id(Json.asMap(context.get("review")),"reviewer_id"),contextId);
        assertThat(loadedExecution.get("id")).isEqualTo(execution.get("id"));
        assertThat(loadedExecution.get("handoff_id")).isEqualTo(handoffId);
        System.out.println("AUDIT_V3_RELOAD_OK: fresh service instances reload the same approved DB context, source, handoff and projection; execution retry keeps IDs. Not a full process restart");
        request("GET",BASE+"/analysis/v3/handoffs/"+handoffId+"/campaign?digest="+"0".repeat(64),engineer,null,409);
        request("GET",BASE+"/analysis/v3/handoffs/"+handoffId+"/campaign?digest="+handoffDigest,outsider,null,404);
        Object catalogMax=jdbc.queryForMap("SELECT max_value FROM aeb_parameters WHERE code='TTC_THRESHOLD'").get("max_value");
        jdbc.update("UPDATE aeb_parameters SET max_value=max_value+0.1 WHERE code='TTC_THRESHOLD'");
        try { assertThat(json("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409))
                .containsEntry("code","V3_CATALOG_REVISION_CHANGED"); }
        finally { jdbc.update("UPDATE aeb_parameters SET max_value=? WHERE code='TTC_THRESHOLD'",catalogMax); }
        // Alter/restore only this disposable DB. The persisted review must detect stale source revision/bytes.
        long first=optimization.get(0);
        jdbc.update("UPDATE simulation_runs SET random_seed=random_seed+1 WHERE id=?",first);
        try { request("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409); }
        finally { jdbc.update("UPDATE simulation_runs SET random_seed=random_seed-1 WHERE id=?",first); }
        jdbc.update("UPDATE simulation_runs SET attempt=attempt+1 WHERE id=?",first);
        try { request("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409); }
        finally { jdbc.update("UPDATE simulation_runs SET attempt=attempt-1 WHERE id=?",first); }
        String frozenConfig=jdbc.queryForObject("SELECT run_config_json FROM simulation_runs WHERE id=?",String.class,first);
        jdbc.update("UPDATE simulation_runs SET run_config_json=JSON_SET(run_config_json,'$.ego_speed_kmh',123) WHERE id=?",first);
        try { request("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409); }
        finally { jdbc.update("UPDATE simulation_runs SET run_config_json=? WHERE id=?",frozenConfig,first); }
        Double frozenStep=jdbc.queryForObject("SELECT fixed_delta_seconds FROM simulation_runs WHERE id=?",Double.class,first);
        jdbc.update("UPDATE simulation_runs SET fixed_delta_seconds=0.02 WHERE id=?",first);
        try { request("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409); }
        finally { jdbc.update("UPDATE simulation_runs SET fixed_delta_seconds=? WHERE id=?",frozenStep,first); }
        long variant=jdbc.queryForObject("SELECT scenario_version_id FROM simulation_runs WHERE id=?",Long.class,first);
        Object friction=jdbc.queryForMap("SELECT road_friction FROM scenario_versions WHERE id=?",variant).get("road_friction");
        jdbc.update("UPDATE scenario_versions SET road_friction=? WHERE id=?",friction==null?.61:((Number)friction).doubleValue()==.61?.62:.61,variant);
        try {
            assertThat(json("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409))
                    .containsEntry("code","V3_SOURCE_FRICTION_CHANGED");
            assertThat(json("POST",BASE+"/optimizations",engineer,Json.obj("scenario_id",scenario,"handoff_id",handoffId,
                    "handoff_digest",handoffDigest,"simulator_type","KINEMATIC"),409))
                    .containsEntry("code","V3_SOURCE_FRICTION_CHANGED").containsEntry("retryable",false);
        } finally { jdbc.update("UPDATE scenario_versions SET road_friction=? WHERE id=?",friction,variant); }
        var stored=jdbc.queryForMap("SELECT id,payload_bytes FROM fa_json_sources WHERE project_id=? AND dedupe_key=?",projectId,
                com.vsos.backend.common.analysis.FailureAnalysisJson.producerResultKey(projectId,first,
                        jdbc.queryForObject("SELECT attempt FROM simulation_runs WHERE id=?",Long.class,first)));
        byte[] original=(byte[])stored.get("payload_bytes");
        byte[] corrupted=Arrays.copyOf(original,original.length+1);corrupted[corrupted.length-1]=' ';
        jdbc.update("UPDATE fa_json_sources SET payload_bytes=? WHERE id=?",corrupted,stored.get("id"));
        try { request("GET",BASE+"/analysis/v3/contexts/"+contextId,engineer,null,409); }
        finally { jdbc.update("UPDATE fa_json_sources SET payload_bytes=? WHERE id=?",original,stored.get("id")); }
        var campaignRequest=Json.obj("scenario_id",scenario,"base_aeb_version_id",baseline,"max_trials",2,"n_initial_points",1,
                "simulator_type","KINEMATIC","handoff_id",handoffId,"handoff_digest",handoffDigest);
        long campaign=id(json("POST",BASE+"/optimizations",engineer,campaignRequest,201),"id");
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,campaign)).isEqualTo("COMPLETED");
        var config=Json.parseMap(jdbc.queryForObject("SELECT objective_config_json FROM optimization_runs WHERE id=?",String.class,campaign));
        assertThat(config).containsKey("handoff_ref").doesNotContainKey("dataset_ref");
        assertThat(Json.asMap(config.get("handoff_ref"))).containsEntry("handoff_id",handoffId).containsEntry("handoff_digest",handoffDigest);
        assertThat(jdbc.queryForList("SELECT sampling_source FROM optimization_trials WHERE optimization_run_id=? ORDER BY trial_number",String.class,campaign))
                .containsExactly("INITIAL_DESIGN","ACQUISITION");
        assertThat(jdbc.queryForObject("SELECT acquisition_value FROM optimization_trials WHERE optimization_run_id=? AND trial_number=2",Double.class,campaign))
                .isNotNull().isFinite().isGreaterThanOrEqualTo(0);
        var trials=jdbc.queryForList("SELECT id FROM optimization_trials WHERE optimization_run_id=? ORDER BY trial_number",Long.class,campaign);
        assertThat(trials).hasSize(2);
        for(long trial:trials) {
            var sources=jdbc.queryForList("SELECT baseline_run_id FROM simulation_runs WHERE optimization_trial_id=?",Long.class,trial);
            assertThat(sources).containsExactlyInAnyOrderElementsOf(optimization).doesNotContainAnyElementsOf(validation);
            var samples=jdbc.queryForList("SELECT * FROM simulation_runs WHERE optimization_trial_id=? ORDER BY id",trial)
                    .stream().map(com.vsos.backend.repository.common.Row::new).map(com.vsos.backend.common.RunEvidence::sample).toList();
            var aggregate=com.vsos.core.evaluation.AnalysisMetrics.aggregate(samples);
            for(String key:List.of("rms_jerk_mps3","impact_speed_mps","stopping_distance_m")) {
                Double actual=jdbc.queryForObject("SELECT "+key+" FROM optimization_trials WHERE id=?",Double.class,trial);
                assertThat(actual).isCloseTo(((com.vsos.core.evaluation.AnalysisMetrics.Objective)aggregate.get(key)).value(),within(1e-10));
            }
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id "
                +"JOIN optimization_trials t ON t.id=c.optimization_trial_id WHERE t.optimization_run_id=? "
                +"AND (c.random_seed<>b.random_seed OR c.scenario_version_id<>b.scenario_version_id OR c.simulator_version<>b.simulator_version)",Integer.class,campaign)).isZero();
        long best=jdbc.queryForObject("SELECT id FROM optimization_trials WHERE optimization_run_id=? AND is_pareto_optimal=1 AND constraint_violated=0 ORDER BY trial_number LIMIT 1",Long.class,campaign);
        var verification=json("POST",BASE+"/optimizations/"+campaign+"/select/"+best,engineer,null,200);
        long test=id(verification,"regression_test_id");awaitRuns();
        assertThat(jdbc.queryForList("SELECT baseline_run_id FROM simulation_runs WHERE regression_test_id=?",Long.class,test))
                .containsExactlyInAnyOrderElementsOf(validation).doesNotContainAnyElementsOf(optimization);
        assertThat(jdbc.queryForObject("SELECT verdict FROM regression_tests WHERE id=?",String.class,test)).isEqualTo("PASSED");
        assertThat(id(json("POST",BASE+"/optimizations/"+campaign+"/select/"+best,engineer,null,200),"regression_test_id")).isEqualTo(test);
        System.out.println("AUDIT_V3_MAIN_FLOW_OK: producer DB bytes -> authenticated V3 context/policy/domain -> persisted V3 handoff -> 2 actual Java trials -> GP ACQUISITION -> frozen holdout regression; no V2 fallback and NOT CARLA");
        return Json.obj("handoff_id",handoffId,"handoff_digest",handoffDigest,"context_id",contextId,"campaign_id",campaign);
    }
}
