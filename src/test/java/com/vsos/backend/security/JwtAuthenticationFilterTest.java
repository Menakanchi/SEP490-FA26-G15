package com.vsos.backend.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void storageFailureReturns503WithoutAuthenticatingOrInvokingTheHandler() throws Exception {
        JwtService jwt = mock(JwtService.class);
        UserDetailsService users = mock(UserDetailsService.class);
        UserDetails user = mock(UserDetails.class);
        FilterChain chain = mock(FilterChain.class);
        when(jwt.extractUsername("token")).thenReturn("demo@example.invalid");
        when(users.loadUserByUsername("demo@example.invalid")).thenReturn(user);
        when(jwt.isTokenValid("token", user)).thenThrow(new IllegalStateException("storage unavailable"));
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer token");
        var response = new MockHttpServletResponse();
        new JwtAuthenticationFilter(jwt, users).doFilter(request, response, chain);
        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(chain);
    }
}
