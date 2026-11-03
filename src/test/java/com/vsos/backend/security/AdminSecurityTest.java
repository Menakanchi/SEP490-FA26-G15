package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.controller.system.AdminController;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.*;
import com.vsos.backend.service.system.AdminService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@WebMvcTest(AdminController.class)
@Import(SecurityConfig.class)
class AdminSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean AdminService admin;
    @MockitoBean VehicSimAccess access;
    @MockitoBean JwtService jwt;
    @MockitoBean UserDetailsService users;
    private static CustomUserDetails as(RoleCode role) {
        return new CustomUserDetails(User.builder().id(1L).email("admin@example.com").isActive(true)
                .role(Role.builder().code(role).build()).build());
    }
    @Test void everyAdminRouteRequiresAdminAcrossAllFiveRoles() throws Exception {
        for(String resource:List.of("users","workspaces","tech-references")) {
            String base="/api/v1/vehicsim/admin/"+resource;
            for(RoleCode role:RoleCode.values()) {
                for(var req:List.of(get(base),get(base+"/2"),post(base),put(base+"/2"))) {
                    var result=mvc.perform(req.with(user(as(role))).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn();
                    assertThat(result.getResponse().getStatus()).as("%s %s",role,base)
                            .isEqualTo(role==RoleCode.ADMIN ? (req.buildRequest(new org.springframework.mock.web.MockServletContext()).getMethod().equals("GET") ? 200:400) :403);
                }
            }
            assertThat(mvc.perform(get(base)).andReturn().getResponse().getStatus()).isEqualTo(401);
        }
    }
    @Test void validCreateUpdateAndListDelegateWithActorAndQuota() throws Exception {
        String body="{\"email\":\"a@example.com\",\"last_name\":\"A\",\"first_name\":\"B\",\"role\":\"MANAGER\",\"is_active\":true,\"password\":\"some-secret-12\"}";
        assertThat(mvc.perform(post("/api/v1/vehicsim/admin/users").with(user(as(RoleCode.ADMIN)))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus()).isEqualTo(201);
        verify(access).limitWrites(1,"admin");
        verify(admin).createUser(eq(1L),any());
        mvc.perform(get("/api/v1/vehicsim/admin/users").with(user(as(RoleCode.ADMIN))).param("q","An").param("page","2"));
        verify(admin).list("users","An",null,null,2,20,"newest");
    }
    @Test void invalidRolesAndNumericInputReturn400AndNoHardDelete() throws Exception {
        for(String body:List.of("{\"ref_code\":\"X\",\"ref_name\":\"Y\",\"ref_type\":\"CONSTANT\",\"is_active\":true,\"ref_value\":\"abc\"}",
                "{\"ref_code\":\"X\",\"ref_name\":\"Y\",\"ref_type\":\"PARAMETER\",\"is_active\":true}")) {
            assertThat(mvc.perform(post("/api/v1/vehicsim/admin/tech-references").with(user(as(RoleCode.ADMIN)))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus()).isEqualTo(400);
        }
        for(String resource:List.of("users","workspaces","tech-references"))
            assertThat(mvc.perform(delete("/api/v1/vehicsim/admin/"+resource+"/2").with(user(as(RoleCode.ADMIN))))
                    .andReturn().getResponse().getStatus()).isEqualTo(405);
    }
}