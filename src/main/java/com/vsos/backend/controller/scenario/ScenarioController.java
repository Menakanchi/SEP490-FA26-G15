package com.vsos.backend.controller.scenario;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.service.auth.OtpService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.scenario.DescribeService;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.scenario.ScenarioViewService;
import com.vsos.backend.service.simulation.RunService;

/**
 * HTTP của họ kịch bản {@code /api/v1/vehicsim}: mô tả → Scenario IR, họ, bản, biến thể, nhãn tập thử, xuất .xosc từ IR.
 * Mọi route cần đăng nhập; tạo / sửa cần ENGINEER, EXPERIENCER hoặc ADMIN (luật ở {@link VehicSimAccess}).
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Scenario", description = "Mô tả → Scenario IR, họ kịch bản, bản, biến thể")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class ScenarioController {

    /** Mỗi lượt mô tả tốn tiền LLM và app là public: giới hạn theo người dùng trong cửa sổ rate-limit (mặc định 15 phút). */
    private static final int DESCRIBE_LIMIT_PER_WINDOW = 30;

    private final ScenarioViewService views;
    private final FamilyService families;
    private final RunService runs;
    private final DescribeService describe;
    private final OtpService otp;
    private final VehicSimAccess access;

    /** Bước 1 "Sinh từ mô tả": câu gốc + model + IR đã trích, lưu vào bản gốc của họ. */
    public record FamilyOrigin(
            @JsonProperty("natural_language_input") @NotBlank @Size(max = 4000) String naturalLanguageInput,
            @JsonProperty("llm_model") @Size(max = 100) String llmModel,
            Map<String, Object> described) {
    }

    public record FamilyRequest(
            @Size(min = 1, max = 200) String name,
            @Size(max = 2000) String description,
            @JsonProperty("ego_speeds_kmh") @NotNull @Size(min = 1, max = 20) List<Double> egoSpeedsKmh,
            @JsonProperty("trigger_distances_m") @NotNull @Size(min = 1, max = 20) List<Double> triggerDistancesM,
            @JsonProperty("pedestrian_speeds_mps") @NotNull @Size(min = 1, max = 20) List<Double> pedestrianSpeedsMps,
            @JsonProperty("stops_at_curb") @NotNull @Size(min = 1, max = 2) List<Boolean> stopsAtCurb,
            @NotNull @Size(min = 1) List<String> weathers,
            @JsonProperty("times_of_day") @NotNull @Size(min = 1) List<String> timesOfDay,
            @JsonProperty("run_baseline") Boolean runBaseline,
            @Valid FamilyOrigin origin) {
    }

    @Operation(summary = "Danh sách họ kịch bản")
    @GetMapping("/families")
    public List<Map<String, Object>> listFamilies() {
        return views.families();
    }

    @Operation(summary = "Tạo họ kịch bản (và chạy baseline nếu run_baseline)")
    @PostMapping("/families")
    public ResponseEntity<Map<String, Object>> createFamily(@Valid @RequestBody FamilyRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "family");
        FamilyService.FamilySpec spec = new FamilyService.FamilySpec(
                body.name() == null ? FamilyService.MOTIF_NAME : body.name(),
                body.description() == null ? "" : body.description(),
                body.egoSpeedsKmh(), body.triggerDistancesM(), body.pedestrianSpeedsMps(), body.stopsAtCurb(), body.weathers(), body.timesOfDay());
        Map<String, Object> origin = null;
        if (body.origin() != null) {
            origin = new LinkedHashMap<>();
            origin.put("natural_language_input", body.origin().naturalLanguageInput());
            origin.put("llm_model", body.origin().llmModel());
            origin.put("described", body.origin().described());
        }
        long pid = access.projectId();
        Map<String, Object> created = families.createFamily(pid, spec, uid, origin);
        if (body.runBaseline() == null || body.runBaseline()) {
            created.put("queued_runs", runs.runFamily(pid, ((Number) created.get("scenario_id")).longValue(), uid, null).size());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Sửa họ: tạo bản gốc mới (v2, v3…) với không gian tham số mới; bản cũ và run của nó giữ nguyên")
    @PostMapping("/families/{scenarioId}/versions")
    public ResponseEntity<Map<String, Object>> createFamilyVersion(@PathVariable long scenarioId, @Valid @RequestBody FamilyRequest body,
                                                                   @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "family");
        // Tên họ không đổi theo bản (UNIQUE theo project); chỉ không gian tham số và mô tả.
        FamilyService.FamilySpec spec = new FamilyService.FamilySpec(FamilyService.MOTIF_NAME,
                body.description() == null ? "" : body.description(),
                body.egoSpeedsKmh(), body.triggerDistancesM(), body.pedestrianSpeedsMps(), body.stopsAtCurb(), body.weathers(), body.timesOfDay());
        long pid = access.projectId();
        Map<String, Object> created = families.createVersion(pid, scenarioId, spec, uid);
        if (body.runBaseline() == null || body.runBaseline()) {
            created.put("queued_runs", runs.runFamily(pid, scenarioId, uid, null).size());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Lịch sử bản của họ kịch bản (v1, v2…), bản cuối là hiện hành")
    @GetMapping("/families/{scenarioId}/versions")
    public List<Map<String, Object>> familyVersions(@PathVariable long scenarioId) {
        return views.familyVersions(scenarioId);
    }

    @Operation(summary = "Biến thể của một bản họ kịch bản kèm nhãn tập thử (nguy hiểm / an toàn)")
    @GetMapping("/families/{scenarioId}/variants")
    public Map<String, Object> familyVariants(@PathVariable long scenarioId,
                                              @RequestParam(name = "base_version_id", required = false) Long baseVersionId) {
        return views.familyVariants(scenarioId, baseVersionId);
    }

    public record RiskLabelRequest(@NotBlank String label) {
    }

    @Operation(summary = "Sửa tay nhãn tập thử của biến thể: DANGEROUS / SAFE, hoặc AUTO để quay về nhãn tự suy")
    @PutMapping("/families/{scenarioId}/variants/{variantId}/risk-label")
    public Map<String, Object> setRiskLabel(@PathVariable long scenarioId, @PathVariable long variantId,
                                            @Valid @RequestBody RiskLabelRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "family");
        Map<String, Object> out = families.setRiskLabel(access.projectId(), scenarioId, variantId, body.label());
        AuditLog.event("scenario.risk_label", "success", "variant_id", variantId, "label", body.label(), "by", uid);
        return out;
    }

    public record DescribeRequest(@NotBlank @Size(max = 2000) String text) {
    }

    @Operation(summary = "Bước 1: câu mô tả tiếng Việt → Scenario IR (chưa lưu gì)")
    @PostMapping("/scenarios/describe")
    public Map<String, Object> describeScenario(@Valid @RequestBody DescribeRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        if (otp.hitRateLimit("vs_describe", String.valueOf(uid), DESCRIBE_LIMIT_PER_WINDOW)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Gọi trích xuất quá nhiều lần, thử lại sau ít phút");
        }
        return describe.describe(body.text());
    }

    @Operation(summary = "Xuất Scenario IR đang chỉnh thành .xosc để chạy thử")
    @PostMapping("/scenarios/xosc")
    public ResponseEntity<byte[]> exportScenarioXosc(@RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "xosc_export");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/xml; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"scenario.xosc\"")
                .body(runs.exportXosc(body).getBytes(StandardCharsets.UTF_8));
    }
}
