package com.vsos.backend.controller.system;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@Tag(name = "Health", description = "Kiểm tra backend đang chạy")
public class HealthController {

    @GetMapping({"/", "/health", "/api/health"})
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "VehicSim Backend (Java Spring Boot)",
                "message", "VehicSim REST API is running successfully!",
                "timestamp", LocalDateTime.now().toString()
        ));
    }
}
