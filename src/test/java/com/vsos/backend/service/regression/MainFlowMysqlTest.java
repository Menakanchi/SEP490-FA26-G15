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
        "vehicsim.data-root=./target/logic-audit-main-flow","spring.data.redis.host=127.0.0.1",
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
        properties.add("spring.datasource.url",()->url);
        properties.add("spring.datasource.username",()->"root");
        properties.add("spring.datasource.password",()->password);
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired BootstrapService bootstrap;
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
        user("audit-engineer@example.invalid","ENGINEER");
        user("audit-reviewer@example.invalid","REVIEWER");
        user("audit-manager@example.invalid","MANAGER");
        projectId=id(bootstrap.ensureDefaultProject(admin),"project_id");
        user("audit-outsider@example.invalid","ENGINEER");
        String engineer=login("audit-engineer@example.invalid"),reviewer=login("audit-reviewer@example.invalid");
        String manager=login("audit-manager@example.invalid"),outsider=login("audit-outsider@example.invalid");
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
        var dataset=json("GET",BASE+"/analysis/dataset?scenario_id="+scenario,engineer,null,200);
        assertThat(Json.asList(dataset.get("variants"))).hasSize(4);
        var dashboard=json("GET",BASE+"/analysis/runs?scenario_id="+scenario,engineer,null,200);
        assertThat(id(dashboard,"total")).isEqualTo(4);
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
        assertThat(json("GET",BASE+"/analysis/datasets/"+selectionId+"/handoff",engineer,null,200)).containsEntry("handoff_ready",true);
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
        request("POST",BASE+"/recommendations/"+test+"/decision",engineer,decision,403);
        json("POST",BASE+"/recommendations/"+test+"/decision",reviewer,decision,200);
        assertThat(jdbc.queryForObject("SELECT status FROM aeb_versions WHERE id=?",String.class,candidate)).isEqualTo("BASELINE");
        assertThat(jdbc.queryForObject("SELECT status FROM aeb_versions WHERE id=?",String.class,baseline)).isEqualTo("ARCHIVED");
        request("GET",BASE+"/analysis/datasets/"+selectionId+"/handoff",engineer,null,400);
        assertThat(json("GET",BASE+"/analysis/datasets/"+selectionId,engineer,null,200)).containsEntry("baseline_current",false);
        var space=Json.obj("TTC_THRESHOLD",List.of(1.5,1.5),"BRAKE_ACTIVATION_DELAY",List.of(.14,.1498),
                "BRAKE_BUILDUP_RATE",List.of(20,20),"MAX_DECELERATION",List.of(8,8));
        long campaign=id(json("POST",BASE+"/optimizations",engineer,Json.obj("scenario_id",scenario,
                "base_aeb_version_id",candidate,"max_trials",1,"n_initial_points",1,"search_space",space,"simulator_type","KINEMATIC"),201),"id");
        assertThat(jdbc.queryForObject("SELECT status FROM optimization_runs WHERE id=?",String.class,campaign)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM optimization_trials WHERE optimization_run_id=? AND status='COMPLETED' AND rms_jerk_mps3 IS NOT NULL AND impact_speed_mps IS NOT NULL AND stopping_distance_m IS NOT NULL",Integer.class,campaign)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT v.param_value FROM optimization_trials t JOIN aeb_parameter_values v ON v.aeb_version_id=t.candidate_aeb_version_id JOIN aeb_parameters p ON p.id=v.parameter_id WHERE t.optimization_run_id=? AND p.code='BRAKE_ACTIVATION_DELAY'",Double.class,campaign)).isBetween(.14,.1498);
        System.out.println("AUDIT_MAIN_FLOW_OK: 4 variants, 8 baseline ON/OFF, 4 paired regression runs, Reviewer Accept; real HTTP/MySQL/Redis, kinematic only");
        System.out.println("AUDIT_MOBO_OK: one real kinematic trial, requested narrow bounds and three recorded objectives");
    }
}
