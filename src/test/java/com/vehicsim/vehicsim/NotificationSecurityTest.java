package com.vehicsim.vehicsim;

import com.vehicsim.config.SecurityConfig;
import com.vehicsim.controller.NotificationController;
import com.vehicsim.dto.NotificationDtos.NotificationList;
import com.vehicsim.entity.Role;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.RoleCode;
import com.vehicsim.security.CustomUserDetails;
import com.vehicsim.security.JwtService;
import com.vehicsim.service.NotificationService;
import com.vehicsim.service.OtpService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Thông báo qua bộ lọc bảo mật thật: chưa đăng nhập 401; mọi role dùng được; id người dùng lấy từ token (không nhận từ request) nên
 * không ai đọc thông báo của người khác. Service giả — không cần MySQL / Redis.
 */
@WebMvcTest(NotificationController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class NotificationSecurityTest {

    private static final String BASE = "/api/v1/vehicsim/notifications";

    @TestConfiguration
    static class PropsConfig {
        @Bean
        VehicSimProperties vehicSimProperties() {
            return new VehicSimProperties("kinematic", "", "", "", "inline", 60, 1, "python", "worker", false, 1000, 1000);
        }
    }

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private NotificationService notifications;
    @MockitoBean
    private ViewsService views;
    @MockitoBean
    private OtpService otp;
    @MockitoBean
    private JwtService jwtService;
    @MockitoBean
    private UserDetailsService userDetailsService;

    private static CustomUserDetails as(RoleCode code, long id) {
        return new CustomUserDetails(User.builder()
                .id(id).email(code.name().toLowerCase() + "@example.com").passwordHash("x").isActive(true)
                .role(Role.builder().code(code).name(code.name()).build())
                .lastName("A").firstName("B").build());
    }

    private static List<MockHttpServletRequestBuilder> routes() {
        return List.of(request(HttpMethod.GET, BASE + "?unread_only=true"), request(HttpMethod.POST, BASE + "/3/read"),
                request(HttpMethod.POST, BASE + "/read-all"));
    }

    @Test
    void everyNotificationRouteRequiresLogin() throws Exception {
        for (MockHttpServletRequestBuilder route : routes()) {
            assertThat(mvc.perform(route).andReturn().getResponse().getStatus()).isEqualTo(401);
        }
    }

    @Test
    void everyRoleUsesOnlyTheirOwnNotifications() throws Exception {
        when(notifications.list(any(Long.class), anyBoolean(), any())).thenReturn(new NotificationList(List.of(), 0));
        long id = 100;
        for (RoleCode code : RoleCode.values()) {
            id++;
            for (MockHttpServletRequestBuilder route : routes()) {
                assertThat(mvc.perform(route.with(user(as(code, id)))).andReturn().getResponse().getStatus()).as("%s", code).isEqualTo(200);
            }
            verify(notifications).list(id, true, null);
            verify(notifications).markRead(id, 3L);
            verify(notifications).markAllRead(id);
        }
    }
}
