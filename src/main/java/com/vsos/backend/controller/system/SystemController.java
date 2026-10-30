package com.vsos.backend.controller.system;

import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.system.BootstrapService;
import com.vsos.backend.service.system.SystemViewService;

/**
 * HTTP của dữ liệu hệ thống {@code /api/v1/vehicsim}: khởi tạo dữ liệu mặc định và ngữ cảnh chung. Mọi route cần đăng nhập;
 * luật role ở {@link VehicSimAccess}.
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · System", description = "Khởi tạo dữ liệu mặc định và ngữ cảnh chung")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class SystemController {

    private final BootstrapService bootstrap;
    private final SystemViewService views;

    @Operation(summary = "Khởi tạo dữ liệu mặc định (workspace, project, xe, baseline AEB v1.0)",
            description = "Chỉ ADMIN. Idempotent: đã có project thì không tạo thêm. Thay cho scripts/seed_vehicsim.py của backend Python.")
    @PostMapping("/bootstrap")
    public Map<String, Object> bootstrap(@AuthenticationPrincipal UserDetails user) {
        if (!"ADMIN".equals(VehicSimAccess.roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ ADMIN được khởi tạo dữ liệu mặc định");
        }
        return bootstrap.ensureDefaultProject(VehicSimAccess.userId(user));
    }

    @Operation(summary = "Ngữ cảnh: workspace, project, xe, AEB versions, họ kịch bản, danh mục tham số")
    @GetMapping("/context")
    public Map<String, Object> context() {
        return views.context();
    }
}
