package com.vsos.backend.controller.analysis;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.vsos.backend.common.Csv;
import com.vsos.backend.common.Json;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.analysis.AnalysisService;
import com.vsos.backend.service.analysis.AnalysisViewService;

/**
 * HTTP của phân tích lỗi {@code /api/v1/vehicsim} (FE-12): ca lỗi, chi tiết, phát lại, tập baseline đã lưu, bàn giao dữ liệu.
 * Đọc: mọi role đã đăng nhập; lưu tập dữ liệu cần ENGINEER, EXPERIENCER hoặc ADMIN (luật ở {@link VehicSimAccess}).
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Analysis", description = "Ca lỗi, chi tiết lỗi, phát lại, tập baseline")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class AnalysisController {

    private static final List<String> FAILURE_CLASSES = List.of("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS");
    private static final List<String> OUTCOMES = List.of("COLLISION", "NEAR_MISS", "FALSE_BRAKING");
    private static final List<String> CSV_COLUMNS = List.of("run_id", "variant", "family", "summary", "outcome", "failure_type", "failure_class",
            "root_cause", "impact_kmh", "min_ttc_s", "config", "created_at");

    private final AnalysisViewService views;
    private final AnalysisService analysis;
    private final VehicSimAccess access;

    private static void checkFailureFilters(String failureClass, String outcome, Integer days) {
        if (failureClass != null && !FAILURE_CLASSES.contains(failureClass)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "failure_class phải thuộc " + FAILURE_CLASSES);
        }
        if (outcome != null && !OUTCOMES.contains(outcome)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "outcome phải thuộc " + OUTCOMES);
        }
        if (days != null && (days < 1 || days > 3650)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "days phải trong khoảng 1–3650");
        }
    }

    @Operation(summary = "Ca lỗi: KPI, nhóm theo họ, danh sách phân trang")
    @GetMapping("/failures")
    public Map<String, Object> listFailures(
            @RequestParam(name = "scenario_id", required = false) Long scenarioId,
            @RequestParam(name = "failure_class", required = false) String failureClass,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String weather,
            @RequestParam(name = "aeb_version_id", required = false) Long aebVersionId,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "20") int pageSize) {
        checkFailureFilters(failureClass, outcome, days);
        if (page < 1 || pageSize < 1 || pageSize > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page phải ≥ 1 và page_size trong khoảng 1–100");
        }
        return views.failureList(scenarioId, failureClass, outcome, weather, aebVersionId, days, page, pageSize);
    }

    @Operation(summary = "Snapshot baseline của một họ kịch bản để bàn giao từ phân tích")
    @GetMapping("/analysis/dataset")
    public Map<String, Object> analysisDataset(@RequestParam(name = "scenario_id") long scenarioId,
                                               @RequestParam(name = "base_version_id", required = false) Long baseVersionId) {
        return views.analysisDataset(scenarioId, baseVersionId);
    }

    @GetMapping("/analysis/runs")
    public Map<String,Object> analysisRuns(
            @RequestParam(name="scenario_id",required=false) Long scenarioId,
            @RequestParam(name="variant_id",required=false) Long variantId,
            @RequestParam(name="aeb_version_id",required=false) Long baselineId,
            @RequestParam(name="vehicle_id",required=false) Long vehicleId,
            @RequestParam(required=false) String simulator, @RequestParam(required=false) String weather,
            @RequestParam(name="time_of_day",required=false) String timeOfDay,
            @RequestParam(required=false) String status,
            @RequestParam(name="failure_class",required=false) String failureClass,
            @RequestParam(defaultValue="1") int page,
            @RequestParam(name="page_size",defaultValue="30") int pageSize) {
        if (page < 1 || pageSize < 1 || pageSize > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid analysis pagination");
        return analysis.dashboard(new AnalysisService.Filters(scenarioId,variantId,baselineId,vehicleId,
                simulator,weather,timeOfDay,status,failureClass),page,pageSize);
    }

    @GetMapping("/analysis/runs/{runId}")
    public Map<String,Object> analysisInspection(@PathVariable long runId) { return analysis.inspection(runId); }

    public record AnalysisSelectionBody(
            @JsonProperty("scenario_id") @Positive long scenarioId,
            @JsonProperty("baseline_id") @Positive long baselineId,
            @JsonProperty("optimization_run_ids") @NotNull @Size(min=1,max=500) List<Long> optimization,
            @JsonProperty("validation_run_ids") @NotNull @Size(min=1,max=500) List<Long> validation,
            @JsonProperty("run_revisions") @NotNull @Size(max=1000) Map<String,String> revisions) {}

    @PostMapping("/analysis/selections")
    public Map<String,Object> saveAnalysisSelection(@AuthenticationPrincipal UserDetails user,
                                                    @Valid @RequestBody AnalysisSelectionBody body) {
        long uid = VehicSimAccess.requireEngineer(user); access.limitWrites(uid,"analysis_dataset");
        return analysis.freeze(new AnalysisService.Selection(body.scenarioId(),body.baselineId(),body.optimization(),body.validation(),body.revisions()),uid);
    }

    @GetMapping("/analysis/datasets/{datasetId}/handoff")
    public Map<String,Object> analysisHandoff(@PathVariable long datasetId) { return analysis.handoff(datasetId); }

    public record FreezeDatasetBody(
            @JsonProperty("scenario_id") @NotNull @Positive Long scenarioId,
            @JsonProperty("preview_token") @NotBlank @Size(min = 64, max = 64) String previewToken) {}

    @Operation(summary = "Lưu bất biến tập baseline đã xem, gồm cả ca an toàn và dữ liệu chưa chạy")
    @PostMapping("/analysis/datasets")
    public Map<String, Object> freezeDataset(@AuthenticationPrincipal UserDetails user,
                                             @Valid @RequestBody FreezeDatasetBody body) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "analysis_dataset");
        return views.freezeAnalysisDataset(body.scenarioId(), body.previewToken(), uid);
    }

    @Operation(summary = "Đọc tập baseline đã lưu theo ID")
    @GetMapping("/analysis/datasets/{datasetId}")
    public Map<String, Object> savedDataset(@PathVariable long datasetId) {
        return views.savedAnalysisDataset(datasetId);
    }

    @Operation(summary = "Xuất ca lỗi ra CSV")
    @GetMapping("/failures.csv")
    public ResponseEntity<byte[]> exportFailures(
            @RequestParam(name = "scenario_id", required = false) Long scenarioId,
            @RequestParam(name = "failure_class", required = false) String failureClass,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String weather,
            @RequestParam(name = "aeb_version_id", required = false) Long aebVersionId,
            @RequestParam(required = false) Integer days) {
        checkFailureFilters(failureClass, outcome, days);
        Map<String, Object> data = views.failureList(scenarioId, failureClass, outcome, weather, aebVersionId, days, 1, 100_000);
        StringBuilder csv = new StringBuilder(String.join(",", CSV_COLUMNS)).append("\r\n");
        for (Object o : Json.asList(data.get("items"))) {
            Map<String, Object> item = Json.asMap(o);
            csv.append(CSV_COLUMNS.stream().map(c -> Csv.cell(item.get(c))).collect(Collectors.joining(","))).append("\r\n");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"failure_cases.csv\"")
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Chi tiết một lần chạy: số đo, chuỗi nguyên nhân, telemetry, cảnh, ca tương tự")
    @GetMapping("/runs/{runId}")
    public Map<String, Object> getRun(@PathVariable long runId) {
        return views.failureDetail(runId);
    }

    @Operation(summary = "Dữ liệu phát lại một lần chạy")
    @GetMapping("/runs/{runId}/playback")
    public Map<String, Object> getPlayback(@PathVariable long runId) {
        return views.playback(runId);
    }
}
