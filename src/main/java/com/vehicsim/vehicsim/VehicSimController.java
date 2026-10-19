package com.vehicsim.vehicsim;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vehicsim.config.OpenApiConfig;
import com.vehicsim.security.CustomUserDetails;
import com.vehicsim.service.OtpService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * HTTP cho vòng MVP VehicSim: {@code /api/v1/vehicsim/*} (port của ``vehicsim_routes.py``).
 * <p>
 * Mọi route cần đăng nhập. Mỗi người đúng một role hệ thống (ADR-035): tạo / chạy / candidate / regression cần ENGINEER,
 * EXPERIENCER hoặc ADMIN; Accept / Reject recommendation chỉ REVIEWER; MANAGER chỉ đọc. Tạm thời (TD-30) app vẫn chạy trên
 * một project, chưa lọc theo workspace. Nghiệp vụ nằm trong các service; lớp này chỉ nhận request và đổi lỗi thành mã HTTP.
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim", description = "Vòng AEB 6 bước: mô tả → biến thể → baseline → lỗi → candidate → regression → Reviewer quyết định")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class VehicSimController {

    private static final Set<String> WRITE_ROLES = Set.of("ADMIN", "ENGINEER", "EXPERIENCER");
    private static final Set<String> DECIDE_ROLES = Set.of("REVIEWER");
    /** Mỗi lượt mô tả tốn tiền LLM và app là public: giới hạn theo người dùng trong cửa sổ rate-limit (mặc định 15 phút). */
    private static final int DESCRIBE_LIMIT_PER_WINDOW = 30;

    private static final List<String> FAILURE_CLASSES = List.of("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS");
    private static final List<String> OUTCOMES = List.of("COLLISION", "NEAR_MISS", "FALSE_BRAKING");
    private static final List<String> CSV_COLUMNS = List.of("run_id", "variant", "family", "summary", "outcome", "failure_type", "failure_class",
            "root_cause", "impact_kmh", "min_ttc_s", "config", "created_at");

    private final ViewsService views;
    private final FamilyService families;
    private final RunService runs;
    private final AebService aeb;
    private final RegressionService regression;
    private final DescribeService describe;
    private final OtpService otp;
    private final BootstrapService bootstrap;
    private final VehicSimProperties props;
    private final TelemetryMetricsService telemetryService;

    // ------------------------------------------------------------------ quyền

    private static long userId(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getId();
    }

    private static String roleOf(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getRole().getCode().name();
    }

    private static long requireEngineer(UserDetails user) {
        if (!WRITE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cần quyền ENGINEER, EXPERIENCER hoặc ADMIN để thực hiện thao tác này");
        }
        return userId(user);
    }

    /** Chỉ Reviewer duyệt: Engineer không tự duyệt việc mình làm, EXP không có recommendation (ADR-035). */
    private static long requireReviewer(UserDetails user) {
        if (!DECIDE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ REVIEWER được Accept / Reject recommendation");
        }
        return userId(user);
    }

    /**
     * Tạo họ / candidate / regression / chạy tốn tài nguyên (mỗi run là một tiến trình Python) và app mở đăng ký công khai
     * (mọi người tự đăng ký đều có quyền ghi vào project chung — TD-30): giới hạn số lần theo người dùng trong cửa sổ rate-limit.
     */
    private void limitWrites(long userId, String bucket) {
        if (otp.hitRateLimit("vs_" + bucket, String.valueOf(userId), props.writesPerWindow())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Thao tác quá nhiều lần, thử lại sau ít phút");
        }
    }

    private long projectId() {
        return ((Number) ((Map<?, ?>) views.context().get("project")).get("id")).longValue();
    }

    @Operation(summary = "Khởi tạo dữ liệu mặc định (workspace, project, xe, baseline AEB v1.0)",
            description = "Chỉ ADMIN. Idempotent: đã có project thì không tạo thêm. Thay cho scripts/seed_vehicsim.py của backend Python.")
    @PostMapping("/bootstrap")
    public Map<String, Object> bootstrap(@AuthenticationPrincipal UserDetails user) {
        if (!"ADMIN".equals(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ ADMIN được khởi tạo dữ liệu mặc định");
        }
        return bootstrap.ensureDefaultProject(userId(user));
    }

    // ------------------------------------------------------------------ ngữ cảnh, họ kịch bản, AEB versions

    @Operation(summary = "Ngữ cảnh: workspace, project, xe, AEB versions, họ kịch bản, danh mục tham số")
    @GetMapping("/context")
    public Map<String, Object> context() {
        return views.context();
    }

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
        long uid = requireEngineer(user);
        limitWrites(uid, "family");
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
        long pid = projectId();
        Map<String, Object> created = families.createFamily(pid, spec, uid, origin);
        if (body.runBaseline() == null || body.runBaseline()) {
            created.put("queued_runs", runs.runFamily(pid, ((Number) created.get("scenario_id")).longValue(), uid, null).size());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    public record DescribeRequest(@NotBlank @Size(max = 2000) String text) {
    }

    @Operation(summary = "Bước 1: câu mô tả tiếng Việt → Scenario IR (chưa lưu gì)")
    @PostMapping("/scenarios/describe")
    public Map<String, Object> describeScenario(@Valid @RequestBody DescribeRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        if (otp.hitRateLimit("vs_describe", String.valueOf(uid), DESCRIBE_LIMIT_PER_WINDOW)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Gọi trích xuất quá nhiều lần, thử lại sau ít phút");
        }
        return describe.describe(body.text());
    }

    public record RunFamilyRequest(@JsonProperty("aeb_version_id") Long aebVersionId) {
    }

    @Operation(summary = "Chạy mọi biến thể của họ bằng một AEB version (mặc định: baseline)")
    @PostMapping("/families/{scenarioId}/run")
    public ResponseEntity<Map<String, Object>> runFamily(@PathVariable long scenarioId, @RequestBody(required = false) RunFamilyRequest body,
                                                         @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        limitWrites(uid, "run");
        List<Long> ids = runs.runFamily(projectId(), scenarioId, uid, body == null ? null : body.aebVersionId());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Json.obj("queued_runs", ids.size()));
    }

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
        long uid = requireEngineer(user);
        limitWrites(uid, "candidate");
        long id = aeb.createCandidate(projectId(), uid, body.parentVersionId(), body.values(), body.label(), body.notes());
        return ResponseEntity.status(HttpStatus.CREATED).body(Json.obj("id", id));
    }

    // ------------------------------------------------------------------ FE-12 · Failure cases, detail, playback

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
            csv.append(CSV_COLUMNS.stream().map(c -> csvCell(item.get(c))).collect(java.util.stream.Collectors.joining(","))).append("\r\n");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"failure_cases.csv\"")
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** Như ``csv.writer`` (QUOTE_MINIMAL): bao dấu nháy khi có dấu phẩy / nháy / xuống dòng; None -> rỗng; bool -> True/False. */
    static String csvCell(Object value) {
        if (value == null) {
            return "";
        }
        String s = value instanceof Boolean b ? (b ? "True" : "False") : String.valueOf(value);
        // CSV injection: ô chữ bắt đầu bằng = + - @ (hoặc tab / CR) bị Excel hiểu là công thức. Tên họ kịch bản do người dùng đặt.
        // Chỉ chuỗi mới bị chặn; số âm (vd. -0.5) là Number nên giữ nguyên.
        if (value instanceof String && !s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
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

    /** File JSON chạy lại đúng run này ngoài web: ``worker/run_variant.py`` (CARLA) hoặc ``kinematic_sim.py``. */
    @Operation(summary = "Tải bundle JSON để chạy lại run này bằng worker")
    @GetMapping("/runs/{runId}/bundle")
    public ResponseEntity<Map<String, Object>> getRunBundle(@PathVariable long runId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vehicsim-run-" + runId + ".json\"")
                .body(views.runVariantBundle(runId));
    }

    private static ResponseEntity<byte[]> xoscFile(String xml, String name) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/xml; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + ".xosc\"")
                .body(xml.getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Xuất biến thể/AEB/xe/seed của run thành OpenSCENARIO 1.0")
    @GetMapping("/runs/{runId}/xosc")
    public ResponseEntity<byte[]> getRunXosc(@PathVariable long runId) {
        return xoscFile(runs.exportXosc(views.runVariantBundle(runId)), "vehicsim-run-" + runId);
    }

    @Operation(summary = "Xuất Scenario IR đang chỉnh thành .xosc để chạy thử")
    @PostMapping("/scenarios/xosc")
    public ResponseEntity<byte[]> exportScenarioXosc(@RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        limitWrites(uid, "xosc_export");
        return xoscFile(runs.exportXosc(body), "scenario");
    }

    @Operation(summary = "Chạy lại đúng biến thể/AEB/xe/seed trên CARLA qua ScenarioRunner")
    @PostMapping("/runs/{runId}/carla")
    public ResponseEntity<Map<String, Object>> runOnCarla(@PathVariable long runId, @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        limitWrites(uid, "carla_run");
        long id = runs.runOnCarla(projectId(), runId, uid);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Json.obj("run_id", id));
    }

    @Operation(summary = "Trạng thái CARLA local và ScenarioRunner")
    @GetMapping("/carla/status")
    public Map<String, Object> carlaStatus() {
        return runs.carlaStatus();
    }

    @Operation(summary = "Các lượt chạy CARLA gần nhất của project")
    @GetMapping("/carla/runs")
    public List<Map<String, Object>> carlaRuns() {
        return runs.carlaRuns(projectId());
    }

    @Operation(summary = "Số đo sensor và danh sách ảnh RGB đã ghi của run CARLA")
    @GetMapping("/runs/{runId}/carla-data")
    public Map<String, Object> carlaData(@PathVariable long runId) throws IOException {
        return runs.carlaData(projectId(), runId, telemetryService);
    }

    @Operation(summary = "Tải frames.csv, collisions.json hoặc ảnh RGB của run CARLA")
    @GetMapping("/runs/{runId}/carla-files/{name}")
    public ResponseEntity<byte[]> carlaFile(@PathVariable long runId, @PathVariable String name) throws IOException {
        var file = runs.carlaFile(projectId(), runId, name);
        String mime = name.endsWith(".png") ? "image/png" : name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json";
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime)).body(Files.readAllBytes(file));
    }

    @Operation(summary = "Nộp result.json của run CARLA chạy ngoài backend (chỉ run CARLA đang PENDING/FAILED, regression chưa chốt)")
    @PostMapping("/runs/{runId}/carla-result")
    public Map<String, Object> submitCarlaResult(@PathVariable long runId, @RequestBody Map<String, Object> body, @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        limitWrites(uid, "carla_result");
        return runs.submitCarlaResult(projectId(), runId, uid, body);
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
        long uid = requireEngineer(user);
        limitWrites(uid, "telemetry_eval");
        List<TelemetryMetricsService.TelemetryFrame> frames = telemetryService.parseCsvFrames(body.csv());
        return telemetryService.summarise(frames, telemetryService.parseCollisions(body.collisions()),
                body.decelAvailable() == null ? 8.0 : body.decelAvailable());
    }

    // ------------------------------------------------------------------ FE-14 · Regression, recommendation, review

    public record RegressionRequest(
            @JsonProperty("candidate_version_id") @NotNull Long candidateVersionId,
            @JsonProperty("scenario_id") @NotNull Long scenarioId,
            @JsonProperty("include_old_critical") Boolean includeOldCritical,
            @JsonProperty("include_all_variants") Boolean includeAllVariants,
            Map<String, Map<String, Object>> criteria,
            @Size(max = 150) String name) {
    }

    @Operation(summary = "Danh sách regression test")
    @GetMapping("/regression")
    public Map<String, Object> listRegression(@RequestParam(name = "status", required = false) String status) {
        return views.regressionList(status);
    }

    @Operation(summary = "Số liệu khung Run summary trước khi tạo regression")
    @GetMapping("/regression/preview")
    public Map<String, Object> previewRegression(@RequestParam(name = "scenario_id") long scenarioId) {
        return regression.preview(projectId(), scenarioId);
    }

    @Operation(summary = "Tạo regression test: candidate vs baseline trên một họ kịch bản")
    @PostMapping("/regression")
    public ResponseEntity<Map<String, Object>> createRegression(@Valid @RequestBody RegressionRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = requireEngineer(user);
        limitWrites(uid, "regression");
        Map<String, Map<String, Object>> criteria = new LinkedHashMap<>();
        if (body.criteria() != null) {
            body.criteria().forEach((k, v) -> {
                Map<String, Object> cleaned = new LinkedHashMap<>(v);
                cleaned.values().removeIf(java.util.Objects::isNull); // như exclude_none
                criteria.put(k, cleaned);
            });
        }
        long id = regression.createTest(projectId(), uid, body.candidateVersionId(), body.scenarioId(),
                body.includeOldCritical() == null || body.includeOldCritical(), body.includeAllVariants() == null || body.includeAllVariants(),
                criteria, body.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(Json.obj("id", id, "code", RegressionService.testCode(id)));
    }

    @Operation(summary = "Chi tiết một regression test")
    @GetMapping("/regression/{testId}")
    public Map<String, Object> getRegression(@PathVariable long testId) {
        return views.regressionDetail(testId);
    }

    @Operation(summary = "Danh sách khuyến nghị kỹ thuật")
    @GetMapping("/recommendations")
    public List<Map<String, Object>> listRecommendations() {
        return views.recommendations();
    }

    @Operation(summary = "Chi tiết một khuyến nghị")
    @GetMapping("/recommendations/{testId}")
    public Map<String, Object> getRecommendation(@PathVariable long testId) {
        return views.recommendationDetail(testId);
    }

    public record DecisionRequest(
            @NotBlank String decision,
            @NotBlank @Size(max = 4000) String reason,
            @Size(max = 4000) String conditions,
            @NotNull Boolean confirmed) {
    }

    @Operation(summary = "Reviewer Accept / Reject / yêu cầu thêm test", description = "Chỉ role REVIEWER; người tạo khuyến nghị không tự duyệt.")
    @PostMapping("/recommendations/{testId}/decision")
    public Map<String, Object> decide(@PathVariable long testId, @Valid @RequestBody DecisionRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = requireReviewer(user);
        if (!Set.of("ACCEPT", "REJECT", "REQUEST_MORE_TESTS").contains(body.decision())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]");
        }
        regression.decide(projectId(), testId, uid, body.decision(), body.reason(), body.conditions(), body.confirmed());
        return views.recommendationDetail(testId);
    }
}
