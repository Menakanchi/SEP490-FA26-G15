package com.vehicsim.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    /** Tên scheme; các endpoint cần đăng nhập tham chiếu bằng @SecurityRequirement(name = BEARER_AUTH). */
    public static final String BEARER_AUTH = "bearerAuth";

    @Bean
    public OpenAPI vehicSimOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("VehicSim API")
                        .version("1.0.0")
                        .description("REST API của VehicSim (VSOS). Gọi POST /api/v1/auth/login, "
                                + "copy access_token, bấm Authorize rồi dán token để thử các API cần đăng nhập."))
                .components(new Components().addSecuritySchemes(BEARER_AUTH,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
