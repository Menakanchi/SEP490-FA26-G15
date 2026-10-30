package com.vsos.backend.controller.simulation;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.service.simulation.SimulationViewService;
import com.vsos.backend.service.simulation.TelemetryMetricsService;

/**
 * HTTP của lần chạy mô phỏng {@code /api/v1/vehicsim}: chạy / hủy theo họ, bundle và .xosc của run, CARLA, telemetry.
 * Mọi route cần đăng nhập; chạy / hủy / nộp kết quả cần ENGINEER, EXPERIENCER hoặc ADMIN (luật ở {@link VehicSimAccess}).
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Simulation", description = "Chạy baseline, CARLA, bundle, telemetry")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class SimulationController {

    private final SimulationViewService views;
    private final RunService runs;
    private final TelemetryMetricsService telemetryService;
    private final VehicSimAccess access;

    public record RunFamilyRequest(@JsonProperty("aeb_version_id") Long aebVersionId) {
    }

    @Operation(summary = "Chạy mọi biến thể của họ bằng một AEB version (mặc định: baseline)")
    @PostMapping("/families/{scenarioId}/run")
    public ResponseEntity<Map<String, Object>> runFamily(@PathVariable long scenarioId, @RequestBody(required = false) RunFamilyRequest body,
                                                         @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "run");
        List<Long> ids = runs.runFamily(access.projectId(), scenarioId, uid, body == null ? null : body.aebVersionId());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Json.obj("queued_runs", ids.size()));
    }

    /** File JSON chạy lại đúng run này ngoài web: ``java -cp target/classes com.vsos.core.bridge.BridgeMain kinematic <file>`` (ADR-042). */
    @Operation(summary = "Tải bundle JSON để chạy lại run này bằng worker")
    @GetMapping("/runs/{runId}/bundle")
    public ResponseEntity<Map<String, Object>> getRunBundle(@PathVariable long runId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vehicsim-run-" + runId + ".json\"")
                .body(views.runVariantBundle(runId));
    }

    @Operation(summary = "Xuất biến thể/AEB/xe/seed của run thành OpenSCENARIO 1.0")
    @GetMapping("/runs/{runId}/xosc")
    public ResponseEntity<byte[]> getRunXosc(@PathVariable long runId) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/xml; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vehicsim-run-" + runId + ".xosc\"")
                .body(runs.exportXosc(views.runVariantBundle(runId)).getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Chạy lại đúng biến thể/AEB/xe/seed trên CARLA qua ScenarioRunner")
    @PostMapping("/runs/{runId}/carla")
    public ResponseEntity<Map<String, Object>> runOnCarla(@PathVariable long runId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "carla_run");
        long id = runs.runOnCarla(access.projectId(), runId, uid);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Json.obj("run_id", id));
    }

    @Operation(summary = "Hủy run đang chờ hoặc đang chạy (không áp dụng cho run của regression/tối ưu)")
    @PostMapping("/runs/{runId}/cancel")
    public ResponseEntity<Map<String, Object>> cancelRun(@PathVariable long runId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "run_cancel");
        String status = runs.cancelRun(access.projectId(), runId, uid);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Json.obj("run_id", runId, "status", status));
    }

    @Operation(summary = "Hủy mọi run đang chờ/đang chạy của một họ kịch bản (bỏ qua run của regression/tối ưu)")
    @PostMapping("/families/{scenarioId}/cancel")
    public ResponseEntity<Map<String, Object>> cancelFamilyRuns(@PathVariable long scenarioId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "run_cancel");
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(runs.cancelFamilyRuns(access.projectId(), scenarioId, uid));
    }

    @Operation(summary = "Trạng thái CARLA local và ScenarioRunner")
    @GetMapping("/carla/status")
    public Map<String, Object> carlaStatus() {
        return runs.carlaStatus();
    }

    @Operation(summary = "Các lượt chạy CARLA gần nhất của project")
    @GetMapping("/carla/runs")
    public List<Map<String, Object>> carlaRuns() {
        return runs.carlaRuns(access.projectId());
    }

    @Operation(summary = "Số đo sensor và danh sách ảnh RGB đã ghi của run CARLA")
    @GetMapping("/runs/{runId}/carla-data")
    public Map<String, Object> carlaData(@PathVariable long runId) throws IOException {
        return runs.carlaData(access.projectId(), runId, telemetryService);
    }

    @Operation(summary = "Tải frames.csv, collisions.json hoặc ảnh RGB của run CARLA")
    @GetMapping("/runs/{runId}/carla-files/{name}")
    public ResponseEntity<byte[]> carlaFile(@PathVariable long runId, @PathVariable String name) throws IOException {
        var file = runs.carlaFile(access.projectId(), runId, name);
        String mime = name.endsWith(".png") ? "image/png" : name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json";
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime)).body(Files.readAllBytes(file));
    }

    @Operation(summary = "Nộp result.json của run CARLA chạy ngoài backend (chỉ run CARLA đang PENDING/FAILED, regression chưa chốt)")
    @PostMapping("/runs/{runId}/carla-result")
    public Map<String, Object> submitCarlaResult(@PathVariable long runId, @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "carla_result");
        return runs.submitCarlaResult(access.projectId(), runId, uid, body);
    }

    /**
     * @param csv            nội dung ``frames.csv`` của ``worker/sensor_recorder.py`` (tối đa 5 MB)
     * @param collisions     nội dung ``collisions.json`` (bỏ trống = không va chạm)
     * @param decelAvailable giảm tốc khả dụng (m/s²) cho phần quãng phanh còn lại; mặc định 8 = MAX_DECELERATION mặc định
     */
    public record TelemetryRequest(
            @NotBlank @Size(max = 5_000_000) String csv,
            @Size(max = 1000) List<Map<String, Object>> collisions,
            @JsonProperty("decel_available") @Positive @DecimalMax("15.0") Double decelAvailable) {
    }

    @Operation(summary = "Số đo telemetry CARLA và 3 mục tiêu MOBO (RMS jerk, vận tốc va chạm, quãng phanh — ADR-040)")
    @PostMapping("/telemetry/evaluate")
    public TelemetryMetricsService.TelemetrySummary evaluateTelemetry(@Valid @RequestBody TelemetryRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "telemetry_eval");
        List<TelemetryMetricsService.TelemetryFrame> frames = telemetryService.parseCsvFrames(body.csv());
        return telemetryService.summarise(frames, telemetryService.parseCollisions(body.collisions()),
                body.decelAvailable() == null ? 8.0 : body.decelAvailable());
    }
}
