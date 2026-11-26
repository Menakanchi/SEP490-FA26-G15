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
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Actual HTTP + JWT + Spring transactions + isolated MySQL/Redis + Java simulator.
 * Opt-in, empty disposable database only. No team datasource, CARLA or LLM provider. */
@EnabledIfEnvironmentVariable(named="VSOS_AUDIT_MYSQL_URL",matches="jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_logic_audit_test[?].*")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "spring.config.import=optional:file:./target/logic-audit-no-env.properties",
        "vehicsim.simulator=kinematic","vehicsim.run-mode=inline","vehicsim.recover-on-startup=false",
        "vehicsim.data-root=./target/e2e-flow-audit/main-flow","spring.data.redis.host=127.0.0.1",
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
        // Seed fixture setup only: all results below are produced by the real Java simulator, never inserted.
        var variants=jdbc.queryForList("SELECT id,scenario_ir_json FROM scenario_versions WHERE scenario_id=? AND source='GENERATED'",scenario)
                .stream().map(com.vsos.backend.repository.common.Row::new).toList();
        long vehicle=jdbc.queryForObject("SELECT carla_vehicle_model_id FROM simulation_runs WHERE project_id=? LIMIT 1",Long.class,projectId);
        var secondSeeds=runService.createRuns(projectId,scenario,variants,vehicle,baseline,engineerId,"BASELINE",null,null);
        for(long runId:secondSeeds) jdbc.update("UPDATE simulation_runs SET random_seed=random_seed+100000 WHERE id=? AND status='PENDING'",runId);
        runService.dispatch(secondSeeds);
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
}
