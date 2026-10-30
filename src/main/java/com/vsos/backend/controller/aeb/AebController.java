package com.vsos.backend.controller.aeb;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.aeb.AebService;
import com.vsos.backend.service.aeb.AebViewService;

/** HTTP của phiên bản AEB {@code /api/v1/vehicsim/aeb/versions}: xem danh sách, tạo candidate từ một version cha. */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · AEB", description = "Phiên bản AEB và candidate chỉnh tay")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class AebController {

    private final AebViewService views;
    private final AebService aeb;
    private final VehicSimAccess access;

    @Operation(summary = "Danh sách AEB versions kèm tham số")
    @GetMapping("/aeb/versions")
    public List<Map<String, Object>> listAebVersions() {
        return views.aebVersions();
    }

    public record CandidateRequest(
            @JsonProperty("parent_version_id") @NotNull Long parentVersionId,
            @Size(max = 100) String label,
            @Size(max = 2000) String notes,
            @NotNull @Size(min = 1) Map<String, Double> values) {
    }

    @Operation(summary = "Tạo AEB version ứng viên từ một version cha")
    @PostMapping("/aeb/versions")
    public ResponseEntity<Map<String, Object>> createCandidate(@Valid @RequestBody CandidateRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "candidate");
        long id = aeb.createCandidate(access.projectId(), uid, body.parentVersionId(), body.values(), body.label(), body.notes());
        return ResponseEntity.status(HttpStatus.CREATED).body(Json.obj("id", id));
    }
}
