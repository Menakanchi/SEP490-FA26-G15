package com.vsos.backend.controller.analysis;

import com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind;
import com.vsos.backend.repository.analysis.FailureAnalysisExplorerRepository;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.analysis.FailureAnalysisService;
import com.vsos.backend.service.analysis.FailureAnalysisDatabaseAdapter;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.core.failureanalysis.InputRejectedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.obj;

/**
 * Additive V3.1 routes. Raw JSON intake goes directly to the existing bounded adapter,
 * never Jackson binding or a legacy DB projection. All IDs resolve in the current project.
 */
@RestController
@RequestMapping("/api/v1/vehicsim/analysis/v3")
public class FailureAnalysisController {
    private final FailureAnalysisService service;
    private final VehicSimAccess access;
    private final FailureAnalysisDatabaseAdapter database;
    private FailureAnalysisExplorerRepository explorer;

    public FailureAnalysisController(FailureAnalysisService service, VehicSimAccess access, FailureAnalysisDatabaseAdapter database) {
        this.service = service;
        this.access = access;
        this.database = database;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public void setExplorer(FailureAnalysisExplorerRepository explorer) { this.explorer = explorer; }

    @GetMapping("/explorer/scenarios")
    public Map<String,Object> explorerScenarios(@AuthenticationPrincipal UserDetails user,
            @RequestParam(required=false) String q, @RequestParam(defaultValue="20") int limit,
            @RequestParam(defaultValue="0") int offset, @RequestParam(defaultValue="id_desc") String sort) {
        return explorer.scenarios(project(user),q,limit,offset,sort);
    }

    @GetMapping("/explorer/scenarios/{id}/runs")
    public Map<String,Object> explorerRuns(@AuthenticationPrincipal UserDetails user, @PathVariable long id,
            @RequestParam(required=false) String q, @RequestParam(name="variant_id",required=false) Long variant,
            @RequestParam(name="run_id",required=false) Long run, @RequestParam(name="aeb_mode",required=false) String mode,
            @RequestParam(required=false) String classification, @RequestParam(name="failure_type",required=false) String type,
            @RequestParam(name="root_cause",required=false) String cause, @RequestParam(name="physical_outcome",required=false) String physical,
            @RequestParam(defaultValue="20") int limit, @RequestParam(defaultValue="0") int offset,
            @RequestParam(defaultValue="id_desc") String sort, @RequestParam(required=false) String weather,
            @RequestParam(name="ego_speed_min",required=false) Double egoMin, @RequestParam(name="ego_speed_max",required=false) Double egoMax,
            @RequestParam(name="initial_distance_min",required=false) Double distanceMin,
            @RequestParam(name="initial_distance_max",required=false) Double distanceMax) {
        return explorer.runs(project(user),id,q,variant,run,mode,classification,type,cause,physical,limit,offset,sort,weather,egoMin,egoMax,distanceMin,distanceMax);
    }

    @GetMapping("/explorer/scenarios/{id}/variants")
    public Map<String,Object> explorerVariants(@AuthenticationPrincipal UserDetails user, @PathVariable long id,
            @RequestParam(required=false) String q, @RequestParam(name="without_runs",defaultValue="false") boolean withoutRuns,
            @RequestParam(defaultValue="20") int limit, @RequestParam(defaultValue="0") int offset,
            @RequestParam(defaultValue="id_desc") String sort) {
        return explorer.variants(project(user),id,q,withoutRuns,limit,offset,sort);
    }

    // ---- nguồn đọc thẳng từ DB (run / file gộp theo biến thể)

    @PostMapping("/contexts")
    public ResponseEntity<Map<String,Object>> createContext(@AuthenticationPrincipal UserDetails user,
            @RequestBody com.vsos.backend.service.analysis.FailureAnalysisHandoffService.Review body) throws IOException {
        long uid=writer(user);return ResponseEntity.status(HttpStatus.CREATED).body(service.createContext(project(user),uid,body));
    }
    @GetMapping("/contexts/{id}")
    public Map<String,Object> context(@AuthenticationPrincipal UserDetails user,@PathVariable String id) throws IOException {
        return service.context(project(user),id);
    }
    @PostMapping("/contexts/{id}/executions")
    public ResponseEntity<Map<String,Object>> executeContext(@AuthenticationPrincipal UserDetails user,@PathVariable String id,HttpServletRequest request) throws IOException {
        long uid=writer(user);emptyBody(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.executeContext(project(user),uid,id));
    }
    @GetMapping("/handoffs/{id}/campaign")
    public Map<String,Object> campaign(@AuthenticationPrincipal UserDetails user,@PathVariable String id,@RequestParam String digest) {
        return service.campaign(project(user),id,digest);
    }

    @GetMapping("/database/runs")
    public Map<String, Object> databaseRuns(@AuthenticationPrincipal UserDetails user,
                                            @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return database.list(project(user), false, limit, offset);
    }

    @GetMapping("/database/collections")
    public Map<String, Object> databaseCollections(@AuthenticationPrincipal UserDetails user,
                                                   @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return database.list(project(user), true, limit, offset);
    }

    @GetMapping("/database/runs/{id}")
    public Map<String, Object> databaseRun(@AuthenticationPrincipal UserDetails user, @PathVariable long id) throws IOException {
        return database.inspect(project(user), id, false);
    }

    @GetMapping("/database/collections/{id}")
    public Map<String, Object> databaseCollection(@AuthenticationPrincipal UserDetails user, @PathVariable long id) throws IOException {
        return database.inspect(project(user), id, true);
    }

    @PostMapping("/database/runs/{id}/executions")
    public ResponseEntity<Map<String, Object>> analyzeDatabaseRun(@AuthenticationPrincipal UserDetails user, @PathVariable long id,
                                                                  @RequestParam(name = "source_sha256", required = false) String expected,
                                                                  HttpServletRequest request) throws IOException {
        long uid = writer(user);
        long pid = project(user);
        emptyBody(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(database.analyze(pid, uid, id, false, expected));
    }

    @PostMapping("/database/collections/{id}/executions")
    public ResponseEntity<Map<String, Object>> analyzeDatabaseCollection(@AuthenticationPrincipal UserDetails user, @PathVariable long id,
                                                                         @RequestParam(name = "source_sha256", required = false) String expected,
                                                                         HttpServletRequest request) throws IOException {
        long uid = writer(user);
        long pid = project(user);
        emptyBody(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(database.analyze(pid, uid, id, true, expected));
    }

    private static void emptyBody(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > 0 || request.getInputStream().read() != -1) {
            throw new FailureAnalysisException(400, "ANALYSIS_BODY_NOT_ALLOWED");
        }
    }

    private long project(UserDetails user) {
        if (user == null) {
            throw new FailureAnalysisException(401, "AUTHENTICATION_REQUIRED");
        }
        return access.projectId();
    }

    private long writer(UserDetails user) {
        if (user == null) {
            throw new FailureAnalysisException(401, "AUTHENTICATION_REQUIRED");
        }
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "failure_analysis_json");
        return uid;
    }

    // ---- nguồn JSON tải lên, lượt phân tích, báo cáo và bàn giao

    @PostMapping(value = "/sources", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> ingest(@AuthenticationPrincipal UserDetails user, HttpServletRequest request,
                                                      @RequestHeader(name = "X-Source-SHA256", required = false) String expected) throws IOException {
        long uid = writer(user);
        long project = project(user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.ingest(project, uid, request.getInputStream(), request.getContentLengthLong(), expected));
    }

    @GetMapping("/sources")
    public Map<String, Object> sources(@AuthenticationPrincipal UserDetails user,
                                       @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return obj("items", service.list(Kind.SOURCE, project(user), null, limit, offset), "limit", limit, "offset", offset);
    }

    @GetMapping("/sources/{id}")
    public Map<String, Object> source(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return service.metadata(Kind.SOURCE, project(user), id);
    }

    @GetMapping("/sources/{id}/download")
    public ResponseEntity<byte[]> sourceDownload(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return download(Kind.SOURCE, project(user), id);
    }

    // No body accepted: prevents accidental client-supplied authority/baseline/partition fields.
    @PostMapping("/sources/{id}/executions")
    public ResponseEntity<Map<String, Object>> analyze(@AuthenticationPrincipal UserDetails user, @PathVariable String id,
                                                       @RequestParam(name = "context_id", required = false) String context,
                                                       HttpServletRequest request) throws IOException {
        writer(user);
        long project = project(user);
        emptyBody(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.analyze(project, id, context));
    }

    @GetMapping("/executions")
    public Map<String, Object> executions(@AuthenticationPrincipal UserDetails user,
                                          @RequestParam(name = "source_id", required = false) String source,
                                          @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return obj("items", service.list(Kind.EXECUTION, project(user), source, limit, offset), "limit", limit, "offset", offset);
    }

    @GetMapping("/executions/{id}")
    public Map<String, Object> execution(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return service.metadata(Kind.EXECUTION, project(user), id);
    }

    @GetMapping("/executions/{id}/reports")
    public Map<String, Object> reports(@AuthenticationPrincipal UserDetails user, @PathVariable String id,
                                       @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return obj("items", service.list(Kind.REPORT, project(user), id, limit, offset), "limit", limit, "offset", offset);
    }

    @GetMapping(value = "/reports/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> report(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(service.download(Kind.REPORT, project(user), id));
    }

    @GetMapping("/reports/{id}/download")
    public ResponseEntity<byte[]> reportDownload(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return download(Kind.REPORT, project(user), id);
    }

    @GetMapping("/handoffs/{id}")
    public Map<String, Object> handoff(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return service.metadata(Kind.HANDOFF, project(user), id);
    }

    @GetMapping("/handoffs/{id}/download")
    public ResponseEntity<byte[]> handoffDownload(@AuthenticationPrincipal UserDetails user, @PathVariable String id) {
        return download(Kind.HANDOFF, project(user), id);
    }

    private ResponseEntity<byte[]> download(Kind kind, long project, String id) {
        byte[] bytes = service.download(kind, project, id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + kind.name().toLowerCase(Locale.ROOT) + "-" + id + ".json\"")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(bytes);
    }

    // ---- lỗi
    // Lỗi riêng của Failure Analysis trả cùng dạng với ApiExceptionHandler: {"code", "detail"} ở cấp ngoài cùng (frontend đọc ở
    // services/api.ts), thêm "retryable". Lỗi chung (403/429 của VehicSimAccess, NotFoundException, InvalidRequestException...)
    // không bắt ở đây mà để ApiExceptionHandler trả đúng mã và câu tiếng Việt như mọi route khác.

    @ExceptionHandler(FailureAnalysisException.class)
    public ResponseEntity<Map<String, Object>> fault(FailureAnalysisException e) {
        return error(e.status, e.code);
    }

    @ExceptionHandler(InputRejectedException.class)
    public ResponseEntity<Map<String, Object>> input(InputRejectedException e) {
        return error(e.kind() == InputRejectedException.Kind.RESOURCE_LIMIT_EXCEEDED ? 413 : 422, e.reason());
    }

    @ExceptionHandler({DataAccessException.class, org.springframework.transaction.TransactionException.class})
    public ResponseEntity<Map<String, Object>> database(Exception e) {
        return error(503, "FA_STORAGE_UNAVAILABLE");
    }

    @ExceptionHandler(IOException.class)
    public ResponseEntity<Map<String, Object>> io(IOException e) {
        return error(503, "FA_SOURCE_IO_UNAVAILABLE");
    }

    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> argument(RuntimeException e) {
        return error(400, "FA_REQUEST_ARGUMENT_INVALID");
    }

    private static ResponseEntity<Map<String, Object>> error(int status, String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("detail", DETAIL.getOrDefault(status, "Phân tích lỗi gặp sự cố. Giữ nguyên dữ liệu và thử lại sau."));
        body.put("retryable", status == 429 || status == 503);
        return ResponseEntity.status(status).body(body);
    }

    private static final Map<Integer, String> DETAIL = Map.of(
            400, "Yêu cầu phân tích chưa hợp lệ. Kiểm tra liên kết hoặc tải lại dữ liệu.",
            401, "Phiên đăng nhập hết hạn. Đăng nhập lại để tiếp tục.",
            403, "Dự án hoặc workspace đang lưu trữ nên chỉ xem được, không phân tích thêm.",
            404, "Không tìm thấy dữ liệu phân tích trong dự án đang chọn.",
            409, "Dữ liệu đã thay đổi hoặc chưa sẵn sàng. Kiểm tra lại nguồn rồi thử lại.",
            413, "Dữ liệu vượt giới hạn tiếp nhận của phân tích lỗi.",
            422, "JSON hoặc bằng chứng đầu vào không hợp lệ.",
            429, "Đang có quá nhiều yêu cầu phân tích. Chờ một lát rồi thử lại.",
            503, "Kho dữ liệu phân tích chưa sẵn sàng. Thử lại sau.");
}
