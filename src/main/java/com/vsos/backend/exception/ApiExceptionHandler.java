package com.vsos.backend.exception;

import com.vsos.backend.common.Vs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * Trả lỗi dạng {"detail": "<thông báo>"} — đúng chỗ frontend đọc (frontend/src/services/api.ts),
 * để người dùng thấy câu tiếng Việt thay vì "API 401: Unauthorized".
 * <p>
 * Kế thừa {@link ResponseEntityExceptionHandler} để lỗi chuẩn của Spring MVC (404 đường dẫn lạ, 405, 415…) giữ đúng mã
 * và cùng định dạng; lỗi bất ngờ còn lại trả 500 chung (chi tiết chỉ ghi log, không lộ ra ngoài).
 */
@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static ResponseEntity<Map<String, String>> detail(HttpStatusCode status, String message) {
        return ResponseEntity.status(status).body(Map.of("detail", message));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatus(ResponseStatusException e) {
        HttpStatusCode status = e.getStatusCode();
        return detail(status, e.getReason() != null ? e.getReason() : status.toString());
    }

    /** Bản ghi không tồn tại (hoặc không thuộc project) — giữ câu như backend Python. */
    @ExceptionHandler(Vs.NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(Vs.NotFoundException e) {
        return detail(HttpStatus.NOT_FOUND, "Không tìm thấy: " + e.getMessage());
    }

    /** Đúng kiểu nhưng sai nghiệp vụ. */
    @ExceptionHandler(Vs.InvalidRequestException.class)
    public ResponseEntity<Map<String, String>> handleInvalid(Vs.InvalidRequestException e) {
        return detail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /** Vi phạm UNIQUE / khoá ngoại lọt qua bước kiểm trước (vd. hai request tạo cùng một bản ghi cùng lúc). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleIntegrity(DataIntegrityViolationException e) {
        log.warn("Vi phạm ràng buộc dữ liệu: {}", e.getMostSpecificCause().getMessage());
        return detail(HttpStatus.CONFLICT, "Dữ liệu bị trùng hoặc vi phạm ràng buộc. Hãy tải lại trang rồi thử lại.");
    }

    /** Redis sập thì OTP và giới hạn tần suất không chạy được — báo 503 thay vì 500. */
    @ExceptionHandler(RedisConnectionFailureException.class)
    public ResponseEntity<Map<String, String>> handleRedisDown(RedisConnectionFailureException e) {
        return detail(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ xác thực tạm thời không khả dụng.");
    }

    /** Để lớp bảo mật của Spring trả 401 / 403 như cũ thay vì bị bắt nhầm thành 500. */
    @ExceptionHandler({AccessDeniedException.class, AuthenticationException.class})
    public void rethrowSecurity(RuntimeException e) {
        throw e;
    }

    /** Lỗi không lường trước: ghi log đầy đủ, người dùng chỉ thấy câu chung. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
        log.error("Lỗi không lường trước", e);
        return detail(HttpStatus.INTERNAL_SERVER_ERROR, "Lỗi hệ thống. Vui lòng thử lại sau.");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException e, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(Map.of("detail", message.isEmpty() ? "Dữ liệu không hợp lệ" : message));
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException e, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        return ResponseEntity.badRequest().body(Map.of("detail", "Dữ liệu gửi lên không đúng định dạng"));
    }

    /** Mọi lỗi chuẩn còn lại của Spring MVC (404, 405, 415…): giữ mã, đổi thân sang {"detail": …}. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception e, Object body, HttpHeaders headers, HttpStatusCode status,
                                                             WebRequest request) {
        String message = switch (status.value()) {
            case 400 -> "Yêu cầu không hợp lệ";
            case 404 -> "Không tìm thấy";
            case 405 -> "Phương thức HTTP không được hỗ trợ";
            case 415 -> "Kiểu dữ liệu không được hỗ trợ";
            default -> HttpStatus.valueOf(status.value()).getReasonPhrase();
        };
        return ResponseEntity.status(status).headers(headers).body(Map.of("detail", message));
    }
}
