package com.vsos.backend.controller.vehicle;

import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.vehicle.VehicleCatalogService;

/** Màn "Phương tiện": danh mục mẫu xe CARLA. Chỉ đọc, mọi role đã đăng nhập xem được (thông số xe cố định, ADR-038). */
@RestController
@RequestMapping("/api/v1/vehicsim/vehicles")
@RequiredArgsConstructor
@Tag(name = "VehicSim", description = "Vòng AEB 6 bước: mô tả → biến thể → baseline → lỗi → candidate → regression → Reviewer quyết định")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class VehicleController {

    private final VehicleCatalogService catalog;
    private final VehicSimAccess access;

    @Operation(summary = "Danh sách mẫu xe CARLA, xe project đang dùng đứng đầu")
    @GetMapping
    public List<Map<String, Object>> list() {
        return catalog.list(access.projectId());
    }

    @Operation(summary = "Chi tiết mẫu xe: thông số vật lý, cảm biến, số run theo bộ mô phỏng")
    @GetMapping("/{vehicleId}")
    public Map<String, Object> detail(@PathVariable long vehicleId) {
        return catalog.detail(access.projectId(), vehicleId);
    }
}
