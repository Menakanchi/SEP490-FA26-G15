package com.vsos.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.controller.system.AdminController;
import com.vsos.backend.dto.auth.AdminRequests.*;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.*;
import com.vsos.backend.service.auth.OtpService;
import com.vsos.backend.service.system.AdminService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@WebMvcTest(AdminController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class AdminSecurityTest {
    private static final String BASE = "/api/v1/vehicsim/admin/";
    private static final List<String> RESOURCES = List.of("users", "workspaces", "tech-references");
    private static final String DECIMAL = "123456789012345678.123456789012";

    @TestConfiguration
    static class PropsConfig {
        @Bean VehicSimProperties vehicSimProperties() {
            return new VehicSimProperties("kinematic", "", "", "", "inline", 60, 1, "python", "worker", false, 1000, 1000);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockitoBean AdminService admin;
    @MockitoBean OtpService otp;
    @MockitoBean ProjectAccess projects;
    @MockitoBean JwtService jwt;
    @MockitoBean UserDetailsService users;

    private static CustomUserDetails as(RoleCode role) {
        return new CustomUserDetails(User.builder().id(1L).email("admin@example.com").isActive(true)
                .role(Role.builder().code(role).build()).build());
    }

    private static String body(String resource, boolean update) {
        return switch (resource) {
            case "users" -> """
                    {"email":"a@example.com","last_name":"A","first_name":"B","role":"REVIEWER","is_active":%s%s}
                    """.formatted(!update, update ? "" : ",\"password\":\"some-secret-12\"");
            case "workspaces" -> """
                    {"name":"Lab","description":"Keep workspace children","manager_id":7}
                    """;
            case "tech-references" -> """
                    {"ref_code":"REF","ref_name":"Reference","ref_type":"CONSTANT","ref_value":"%s","is_active":%s}
                    """.formatted(DECIMAL, !update);
            default -> throw new IllegalArgumentException(resource);
        };
    }

    private static MockHttpServletRequestBuilder write(String resource, boolean update) {
        return (update ? put(BASE + resource + "/42") : post(BASE + resource))
                .contentType(MediaType.APPLICATION_JSON).content(body(resource, update));
    }

    private static List<MockHttpServletRequestBuilder> routes(String resource) {
        return List.of(get(BASE + resource), get(BASE + resource + "/42"), write(resource, false), write(resource, true));
    }

    @Test void everyAdminRouteRequiresAdminAcrossAllFiveRoles() throws Exception {
        for (String resource : RESOURCES) {
            for (RoleCode role : RoleCode.values()) {
                for (var req : routes(resource)) {
                    clearInvocations(admin, otp);
                    var method = req.buildRequest(new org.springframework.mock.web.MockServletContext()).getMethod();
                    int expected = role == RoleCode.ADMIN ? ("POST".equals(method) ? 201 : 200) : 403;
                    assertThat(mvc.perform(req.with(user(as(role)))).andReturn().getResponse().getStatus())
                            .as("%s %s %s", role, method, resource).isEqualTo(expected);
                    if (role != RoleCode.ADMIN) verifyNoInteractions(admin, otp);
                }
            }
        }
    }

    @Test void everyAdminRouteRejectsGuestsBeforeServicesOrQuota() throws Exception {
        for (String resource : RESOURCES) {
            for (var req : routes(resource)) {
                assertThat(mvc.perform(req).andReturn().getResponse().getStatus()).isEqualTo(401);
            }
        }
        verifyNoInteractions(admin, otp);
    }

    @Test void validCreateUpdateAndListDelegateWithActorAndQuota() throws Exception {
        for (String resource : RESOURCES) {
            assertThat(mvc.perform(write(resource, false).with(user(as(RoleCode.ADMIN))))
                    .andReturn().getResponse().getStatus()).isEqualTo(201);
            assertThat(mvc.perform(write(resource, true).with(user(as(RoleCode.ADMIN))))
                    .andReturn().getResponse().getStatus()).isEqualTo(200);
        }
        verify(admin).createUser(1, json.readValue(body("users", false), UserRequest.class));
        verify(admin).updateUser(1, 42, json.readValue(body("users", true), UserRequest.class));
        verify(admin).createWorkspace(1, json.readValue(body("workspaces", false), WorkspaceRequest.class));
        verify(admin).updateWorkspace(1, 42, json.readValue(body("workspaces", true), WorkspaceRequest.class));
        verify(admin).createReference(1, json.readValue(body("tech-references", false), ReferenceRequest.class));
        verify(admin).updateReference(1, 42, json.readValue(body("tech-references", true), ReferenceRequest.class));
        verify(otp, times(6)).hitRateLimit("vs_admin", "1", 1000);
        verifyNoMoreInteractions(otp);
        mvc.perform(get(BASE + "users").with(user(as(RoleCode.ADMIN))).param("q", "An").param("page", "2"));
        verify(admin).list("users", "An", null, null, 2, 20, "newest");
    }

    @Test void allAdminWritesHonourTheRealQuotaBeforeCallingServices() throws Exception {
        when(otp.hitRateLimit("vs_admin", "1", 1000)).thenReturn(true);
        for (String resource : RESOURCES) {
            for (boolean update : List.of(false, true)) {
                clearInvocations(otp);
                assertThat(mvc.perform(write(resource, update).with(user(as(RoleCode.ADMIN))))
                        .andReturn().getResponse().getStatus()).isEqualTo(429);
                verify(otp).hitRateLimit("vs_admin", "1", 1000);
                verifyNoMoreInteractions(otp);
                verifyNoInteractions(admin);
            }
        }
    }

    @Test void invalidRolesAndNumericInputReturn400AndNoHardDelete() throws Exception {
        for (String body : List.of("{\"ref_code\":\"X\",\"ref_name\":\"Y\",\"ref_type\":\"CONSTANT\",\"is_active\":true,\"ref_value\":\"abc\"}",
                "{\"ref_code\":\"X\",\"ref_name\":\"Y\",\"ref_type\":\"PARAMETER\",\"is_active\":true}")) {
            assertThat(mvc.perform(post(BASE + "tech-references").with(user(as(RoleCode.ADMIN)))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus()).isEqualTo(400);
        }
        for (String resource : RESOURCES)
            assertThat(mvc.perform(delete(BASE + resource + "/42").with(user(as(RoleCode.ADMIN))))
                    .andReturn().getResponse().getStatus()).isEqualTo(405);
        verifyNoInteractions(admin, otp);
    }
}
