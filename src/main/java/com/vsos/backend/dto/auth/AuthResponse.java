package com.vsos.backend.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {

    /** JWT token — tên field phải khớp với SessionResponse TypeScript. */
    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("token_type")
    private String tokenType;

    /** Số giây còn hiệu lực. */
    @JsonProperty("expires_in")
    private long expiresIn;

    private UserDto user;

    public static AuthResponse of(String token, UserDto user, long expiresInSeconds) {
        return AuthResponse.builder()
                .accessToken(token)
                .tokenType("bearer")
                .expiresIn(expiresInSeconds)
                .user(user)
                .build();
    }
}
