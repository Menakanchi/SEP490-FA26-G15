package com.vsos.backend.security;

import com.vsos.backend.common.Json;
import com.vsos.backend.service.system.BootstrapService;
import org.junit.jupiter.api.AfterAll;
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
import org.springframework.util.FileSystemUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Opt-in HTTP/JWT test against an empty loopback MySQL database and a dedicated Redis. */
@EnabledIfEnvironmentVariable(named="VSOS_ENGINEER_MYSQL_URL", matches="jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_engineer_demo[?].*")
@EnabledIfEnvironmentVariable(named="VSOS_ENGINEER_REDIS_PORT", matches="[0-9]+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
        "spring.config.import=optional:file:./target/engineer-no-env.properties",
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "spring.data.redis.host=127.0.0.1",
        "app.env=development", "app.auth.login-attempts-per-ip=100"})
class EngineerProjectPermissionsMysqlTest {
    private static final String PASSWORD="Engineer-demo-only-2026!";
    private static final String BASE="/api/v1/vehicsim";
    private static final Path ROOT;
    static {
        try { ROOT=Files.createTempDirectory("vsos-engineer-root-"); }
        catch(Exception e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource static void database(DynamicPropertyRegistry p) throws Exception {
        String url=System.getenv("VSOS_ENGINEER_MYSQL_URL"), password=System.getenv("VSOS_ENGINEER_MYSQL_PASSWORD");
        var ds=new DriverManagerDataSource(url,"root",password);
        var jdbc=new JdbcTemplate(ds);
        assertThat(jdbc.queryForObject("SELECT DATABASE()",String.class)).isEqualTo("vsos_engineer_demo");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()",Integer.class)).isZero();
        String ddl=Files.readString(Path.of("database/mysql/01_schema.sql"),StandardCharsets.UTF_8)
                .replace("CREATE DATABASE IF NOT EXISTS vehicsim ","CREATE DATABASE IF NOT EXISTS vsos_engineer_demo ")
                .replace("USE vehicsim;","USE vsos_engineer_demo;");
        try(var c=ds.getConnection()){ScriptUtils.executeSqlScript(c,new ByteArrayResource(ddl.getBytes(StandardCharsets.UTF_8)));}
        p.add("spring.datasource.url",()->url); p.add("spring.datasource.username",()->"root"); p.add("spring.datasource.password",()->password);
        p.add("spring.data.redis.port",()->System.getenv("VSOS_ENGINEER_REDIS_PORT"));
        p.add("vehicsim.data-root",ROOT::toString);
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired BootstrapService bootstrap;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterAll static void cleanup() throws Exception { FileSystemUtils.deleteRecursively(ROOT); }

    private long user(String email,String role) {
        jdbc.update("INSERT INTO users(email,password_hash,role_id,last_name,first_name) SELECT ?,?,id,'Demo','User' FROM roles WHERE code=?",email,encoder.encode(PASSWORD),role);
        return jdbc.queryForObject("SELECT id FROM users WHERE email=?",Long.class,email);
    }
    private HttpResponse<String> request(String method,String path,String token,Long project,Object body,int expected) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(20)).header("Content-Type","application/json");
        if(token!=null)b.header("Authorization","Bearer "+token);
        if(project!=null)b.header("X-VehicSim-Project",project.toString());
        var response=http.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(Json.write(body))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s: %s",method,path,response.body()).isEqualTo(expected);
        return response;
    }
    private Map<String,Object> json(String method,String path,String token,Long project,Object body,int expected) throws Exception {
        return Json.parseMap(request(method,path,token,project,body,expected).body());
    }
    private String login(String email) throws Exception { return json("POST","/api/v1/auth/login",null,null,Json.obj("email",email,"password",PASSWORD),200).get("access_token").toString(); }
    private static long id(Map<String,Object> m) { return ((Number)m.get("id")).longValue(); }

    @Test void membershipControlsProjectsAndEngineerCannotManageProjectsEvenWhenCreator() throws Exception {
        long admin=user("eng-admin@example.invalid","ADMIN"), member=user("eng-member@example.invalid","ENGINEER"),
                creator=user("eng-creator@example.invalid","ENGINEER"), outsider=user("eng-outsider@example.invalid","ENGINEER");
        long team=((Number)bootstrap.ensureDefaultProject(admin).get("project_id")).longValue();
        long workspace=jdbc.queryForObject("SELECT workspace_id FROM projects WHERE id=?",Long.class,team);
        jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,added_by_user_id) VALUES (?,?,?),(?,?,?)",workspace,member,admin,workspace,creator,admin);
        jdbc.update("INSERT INTO workspaces(name,manager_id,created_by_user_id) VALUES ('Foreign workspace',?,?)",admin,admin);
        long otherWorkspace=jdbc.queryForObject("SELECT id FROM workspaces WHERE name='Foreign workspace'",Long.class);
        jdbc.update("INSERT INTO projects(workspace_id,name,created_by_user_id) VALUES (?,'Foreign project',?)",otherWorkspace,admin);
        long foreign=jdbc.queryForObject("SELECT id FROM projects WHERE name='Foreign project'",Long.class);
        jdbc.update("INSERT INTO projects(name,created_by_user_id) VALUES ('Prior personal project',?)",member);
        long personal=jdbc.queryForObject("SELECT id FROM projects WHERE name='Prior personal project'",Long.class);
        String memberToken=login("eng-member@example.invalid"),creatorToken=login("eng-creator@example.invalid"),outsiderToken=login("eng-outsider@example.invalid");

        var memberProjects=Json.asList(json("GET",BASE+"/projects",memberToken,null,null,200).get("items")).stream().map(Json::asMap).map(EngineerProjectPermissionsMysqlTest::id).toList();
        assertThat(memberProjects).contains(team,personal).doesNotContain(foreign);
        var outsiderProjects=Json.asList(json("GET",BASE+"/projects",outsiderToken,null,null,200).get("items"));
        assertThat(outsiderProjects).isEmpty();
        request("GET",BASE+"/context",memberToken,team,null,200);
        request("GET",BASE+"/context",memberToken,foreign,null,404);
        request("GET",BASE+"/context",outsiderToken,team,null,404);
        request("GET",BASE+"/projects/"+personal,memberToken,null,null,200);
        request("GET",BASE+"/projects/"+team,memberToken,null,null,403);
        request("POST",BASE+"/projects",outsiderToken,null,Json.obj("name","Denied","workspace_id",workspace),403);
        long created=id(json("POST",BASE+"/projects",creatorToken,null,Json.obj("name","Engineer created","workspace_id",workspace),201));
        request("GET",BASE+"/context",memberToken,created,null,200);
        request("PATCH",BASE+"/projects/"+created,creatorToken,null,Json.obj("name","Changed"),403);
        request("POST",BASE+"/projects/"+created+"/archive",creatorToken,null,null,403);
        request("DELETE",BASE+"/projects/"+created,creatorToken,null,Json.obj("confirm_name","Engineer created"),403);
        request("POST",BASE+"/projects/"+created+"/regressions/999/adopt",creatorToken,null,Json.obj("reason","Demo","confirmed",true),403);
        request("DELETE",BASE+"/projects/"+personal,memberToken,null,Json.obj("confirm_name","Prior personal project"),403);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id IN (?,?,?,?)",Integer.class,team,foreign,personal,created)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT name FROM projects WHERE id=?",String.class,created)).isEqualTo("Engineer created");
    }
}
