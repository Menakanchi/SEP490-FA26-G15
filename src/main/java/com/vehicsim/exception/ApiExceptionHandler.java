package com.vehicsim.exception;

import com.vehicsim.vehicsim.Vs;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * Trả lỗi dạng {"detail": "<thông báo>"} — đúng chỗ frontend đọc (frontend/src/services/api.ts),
 * để người dùng thấy câu tiếng Việt thay vì "API 401: Unauthorized".
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatus(ResponseStatusException e) {
        HttpStatusCode status = e.getStatusCode();
        return ResponseEntity.status(status).body(Map.of("detail", e.getReason() != null ? e.getReason() : status.toString()));
    }

    /** Bản ghi không tồn tại (hoặc không thuộc project) — giữ câu như backend Python. */
    @ExceptionHandler(Vs.NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(Vs.NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Không tìm thấy: " + e.getMessage()));
    }

    /** Đúng kiểu nhưng sai nghiệp vụ. */
    @ExceptionHandler(Vs.InvalidRequestException.class)
    public ResponseEntity<Map<String, String>> handleInvalid(Vs.InvalidRequestException e) {
        return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(Map.of("detail", detail.isEmpty() ? "Dữ liệu không hợp lệ" : detail));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("detail", "Dữ liệu gửi lên không đúng định dạng"));
    }

    /** Redis sập thì OTP và giới hạn tần suất không chạy được — báo 503 thay vì 500. */
    @ExceptionHandler(RedisConnectionFailureException.class)
    public ResponseEntity<Map<String, String>> handleRedisDown(RedisConnectionFailureException e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("detail", "Dịch vụ xác thực tạm thời không khả dụng."));
    }
}
