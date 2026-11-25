package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;

import com.vsos.backend.config.*;
import com.vsos.backend.controller.analysis.FailureAnalysisController;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.*;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.*;
import com.vsos.backend.service.auth.OtpService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.web.context.request.*;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** HTTP + unchanged real SecurityConfig/VehicSimAccess + real service/core.
 * Persistence and project membership resolution are explicitly test doubles. */
@WebMvcTest(FailureAnalysisController.class)
@Import({SecurityConfig.class,VehicSimAccess.class})
class FailureAnalysisRestTest {
    static final String BASE="/api/v1/vehicsim/analysis/v3";
    static final String ID="11111111-1111-1111-1111-111111111111";
    @TestConfiguration static class Config {
        @Bean VehicSimProperties props(){return new VehicSimProperties("kinematic","","","","inline",60,1,"python","worker",false,1000,1000);}
        @Bean FailureAnalysisMemoryStore store(){return new FailureAnalysisMemoryStore();}
        @Bean FailureAnalysisService service(FailureAnalysisMemoryStore store){return new FailureAnalysisService(store);}
    }
    @Autowired MockMvc mvc;
    @Autowired FailureAnalysisMemoryStore store;
    @MockitoBean JwtService jwt;
    @MockitoBean UserDetailsService users;
    @MockitoBean OtpService otp;
    @MockitoBean ProjectAccess projects;
    @MockitoBean FailureAnalysisDatabaseAdapter database;
    static CustomUserDetails person(RoleCode role){return new CustomUserDetails(User.builder().id(7L).email("fa@example.com").passwordHash("x").isActive(true)
            .firstName("A").lastName("B").role(Role.builder().code(role).name(role.name()).build()).build());}
    @BeforeEach void init(){store.rows.clear();store.failWrites=false;store.projectStatus="ACTIVE";store.workspaceStatus="ACTIVE";
        when(projects.currentProject()).thenAnswer(inv->{
            var request=((ServletRequestAttributes)RequestContextHolder.currentRequestAttributes()).getRequest();
            String header=request.getHeader("X-VehicSim-Project");return new Row(Map.of("id",header==null?1L:Long.parseLong(header)));
        });
    }
    MvcResult upload()throws Exception{return mvc.perform(post(BASE+"/sources").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON)
            .content(FailureAnalysisServiceTest.input("vsos-collections-2026-11-24/vehicsim-variant-1033-collection.json"))).andExpect(status().isCreated()).andReturn();}
    static Map<String,Object> json(MvcResult r){return FailureAnalysisJson.object(r.getResponse().getContentAsByteArray());}
    @Test void allNewRoutesRequireAuthentication()throws Exception {
        for(String path:List.of("/database/runs","/database/collections","/database/runs/2499","/database/collections/1033"))mvc.perform(get(BASE+path)).andExpect(status().isUnauthorized());
        for(String path:List.of("/database/runs/2499/executions","/database/collections/1033/executions"))mvc.perform(post(BASE+path)).andExpect(status().isUnauthorized());
        for(String path:List.of("/sources","/sources/"+ID,"/sources/"+ID+"/download","/executions","/executions/"+ID,
                "/executions/"+ID+"/reports","/reports/"+ID,"/reports/"+ID+"/download","/handoffs/"+ID,"/handoffs/"+ID+"/download"))
            mvc.perform(get(BASE+path)).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE+"/sources").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE+"/sources/"+ID+"/executions")).andExpect(status().isUnauthorized());
        assertThat(store.rows).isEmpty();
    }
    @Test void databaseRoutesAreScopedBodylessAndUseCorsCompatibleDigestQuery()throws Exception {
        when(database.list(2,false,20,0)).thenReturn(Map.of("items",List.of()));
        mvc.perform(get(BASE+"/database/runs").header("X-VehicSim-Project","2").with(user(person(RoleCode.ENGINEER)))).andExpect(status().isOk());
        verify(database).list(2,false,20,0);
        when(database.analyze(2,7,2499,false,"a".repeat(64))).thenReturn(Map.of("status","COMPLETED"));
        mvc.perform(post(BASE+"/database/runs/2499/executions?source_sha256="+"a".repeat(64)).header("X-VehicSim-Project","2").with(user(person(RoleCode.ENGINEER)))).andExpect(status().isCreated());
        verify(database).analyze(2,7,2499,false,"a".repeat(64));
        mvc.perform(post(BASE+"/database/runs/2499/executions").with(user(person(RoleCode.MANAGER)))).andExpect(status().isForbidden());
        mvc.perform(post(BASE+"/database/collections/1033/executions").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("ANALYSIS_BODY_NOT_ALLOWED"));
    }
    @Test void realHttpRoundTripStoresPerMemberReportsAndBlockedHandoff()throws Exception {
        var source=upload();String sid=json(source).get("id").toString();
        var execution=mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.analyzed").value(2)).andExpect(jsonPath("$.status").value("COMPLETED")).andReturn();
        String eid=json(execution).get("id").toString(),hid=json(execution).get("handoff_id").toString();
        var reports=mvc.perform(get(BASE+"/executions/"+eid+"/reports").with(user(person(RoleCode.MANAGER))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2)).andReturn();
        String rid=at(json(reports),"/items/0/id").toString();
        var report=mvc.perform(get(BASE+"/reports/"+rid).with(user(person(RoleCode.MANAGER))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.schema_version").value("vehicsim.failure-analysis/v1")).andReturn();
        var downloaded=mvc.perform(get(BASE+"/reports/"+rid+"/download").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isOk()).andExpect(header().string("Content-Disposition","attachment; filename=\"report-"+rid+".json\"")).andReturn();
        assertThat(downloaded.getResponse().getContentAsByteArray()).isEqualTo(report.getResponse().getContentAsByteArray());
        var handoff=mvc.perform(get(BASE+"/handoffs/"+hid).with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.dispatch_allowed").value(false)).andExpect(jsonPath("$.status").value("DIAGNOSTIC_ONLY")).andReturn();
        var payload=mvc.perform(get(BASE+"/handoffs/"+hid+"/download").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.schema_version").value("vehicsim.failure-analysis-mobo-handoff/v1")).andReturn();
        for(String path:List.of("/sources","/sources/"+sid,"/sources/"+sid+"/download","/executions?source_id="+sid,"/executions/"+eid))
            mvc.perform(get(BASE+path).with(user(person(RoleCode.ENGINEER)))).andExpect(status().isOk());
        var retry=mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isCreated()).andReturn();assertThat(json(retry).get("id")).isEqualTo(eid);
        Files.createDirectories(FailureAnalysisServiceTest.EVIDENCE);
        for(var entry:Map.of("source",source,"execution",execution,"reports",reports,"report",report,"handoff-status",handoff,"handoff",payload).entrySet())
            Files.write(FailureAnalysisServiceTest.EVIDENCE.resolve("http-"+entry.getKey()+".json"),entry.getValue().getResponse().getContentAsByteArray());
    }
    @Test void crossProjectAllResourceReadsAndMutationFailClosed()throws Exception {
        String sid=json(upload()).get("id").toString();var ex=mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(RoleCode.ENGINEER)))).andReturn();
        String eid=json(ex).get("id").toString(),hid=json(ex).get("handoff_id").toString();
        String rid=store.rows.values().stream().filter(r->r.kind()==com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind.REPORT).findFirst().orElseThrow().id();
        for(String path:List.of("/sources/"+sid,"/sources/"+sid+"/download","/executions/"+eid,"/executions/"+eid+"/reports","/reports/"+rid,
                "/reports/"+rid+"/download","/handoffs/"+hid,"/handoffs/"+hid+"/download"))
            mvc.perform(get(BASE+path).header("X-VehicSim-Project","2").with(user(person(RoleCode.ENGINEER)))).andExpect(status().isNotFound());
        mvc.perform(post(BASE+"/sources/"+sid+"/executions").header("X-VehicSim-Project","2").with(user(person(RoleCode.ENGINEER)))).andExpect(status().isNotFound());
        mvc.perform(get(BASE+"/sources").header("X-VehicSim-Project","2").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    }
    @Test void roleBasedMutationsUseExistingEngineerPolicy()throws Exception {
        byte[] valid=FailureAnalysisServiceTest.input("result_run2499_full_dataset.json");
        for(RoleCode role:RoleCode.values()) {
            boolean write=Set.of(RoleCode.ADMIN,RoleCode.ENGINEER,RoleCode.EXPERIENCER).contains(role);
            mvc.perform(post(BASE+"/sources").with(user(person(role))).contentType(MediaType.APPLICATION_JSON).content(valid))
                    .andExpect(status().is(write?201:403));
            mvc.perform(post(BASE+"/sources/"+ID+"/executions").with(user(person(role))))
                    .andExpect(status().is(write?404:403));
        }
    }
    @Test void malformedLargeHashAndUntrustedContextRequestsAreRejected()throws Exception {
        mvc.perform(get(BASE+"/sources?limit=abc").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("FA_REQUEST_ARGUMENT_INVALID"));
        mvc.perform(post(BASE+"/sources").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON).content("{\"format\":\"vehicsim.result/v99\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("JSON_SCHEMA_UNSUPPORTED"));
        mvc.perform(post(BASE+"/sources").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON).content(new byte[FailureAnalysisJson.SOURCE_BYTES+1]))
                .andExpect(status().isPayloadTooLarge());
        mvc.perform(post(BASE+"/sources").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON).header("X-Source-SHA256","0".repeat(64)).content("{}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("SOURCE_DIGEST_MISMATCH"));
        String sid=json(upload()).get("id").toString();
        mvc.perform(post(BASE+"/sources/"+sid+"/executions?context_id=approved-by-client").with(user(person(RoleCode.ENGINEER))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("APPROVED_CONTEXT_REGISTRY_UNAVAILABLE"));
        mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON).content("{\"project_id\":2,\"approved\":true}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("ANALYSIS_BODY_NOT_ALLOWED"));
    }
    @Test void databaseFailureIsSanitizedAndRetryable()throws Exception {
        store.failWrites=true;
        var result=mvc.perform(post(BASE+"/sources").with(user(person(RoleCode.ENGINEER))).contentType(MediaType.APPLICATION_JSON)
                        .content(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json")))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error.code").value("FA_STORAGE_UNAVAILABLE"))
                .andExpect(jsonPath("$.error.retryable").value(true)).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("C:/","private","Exception","stack");assertThat(store.rows).isEmpty();
    }
    @Test void archivedWorkspaceOrProjectAllowsHistoricalReadsButBlocksBothMutations()throws Exception {
        String sid=json(upload()).get("id").toString();
        var execution=mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(RoleCode.ENGINEER)))).andReturn();
        String eid=json(execution).get("id").toString(),hid=json(execution).get("handoff_id").toString();
        for(String scope:List.of("workspace","project")) {
            store.workspaceStatus=scope.equals("workspace")?"ARCHIVED":"ACTIVE";store.projectStatus=scope.equals("project")?"ARCHIVED":"ACTIVE";
            int before=store.rows.size();
            for(RoleCode role:List.of(RoleCode.ADMIN,RoleCode.ENGINEER,RoleCode.EXPERIENCER)) {
                mvc.perform(post(BASE+"/sources").with(user(person(role))).contentType(MediaType.APPLICATION_JSON).content("{}"))
                        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("FA_PROJECT_OR_WORKSPACE_READ_ONLY"));
                mvc.perform(post(BASE+"/sources/"+sid+"/executions").with(user(person(role))))
                        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("FA_PROJECT_OR_WORKSPACE_READ_ONLY"));
            }
            for(String path:List.of("/sources/"+sid,"/executions/"+eid,"/handoffs/"+hid))
                mvc.perform(get(BASE+path).with(user(person(RoleCode.ENGINEER)))).andExpect(status().isOk());
            assertThat(store.rows).hasSize(before);
        }
    }
}
