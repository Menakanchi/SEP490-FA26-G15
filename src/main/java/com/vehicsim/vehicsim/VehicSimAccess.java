package com.vehicsim.vehicsim;

import com.vehicsim.security.CustomUserDetails;
import com.vehicsim.service.OtpService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Set;

/**
 * Kiểm quyền và hạn mức dùng chung cho mọi controller {@code /api/v1/vehicsim/*} ({@link VehicSimController}, {@code RegressionController}):
 * một chỗ duy nhất giữ luật role (ADR-035), để tách route ra controller khác không sinh ra bản luật thứ hai.
 * <p>
 * Mỗi người đúng một role hệ thống: tạo / chạy / candidate / regression cần ENGINEER, EXPERIENCER hoặc ADMIN; Accept / Reject chỉ
 * REVIEWER; MANAGER chỉ đọc. Tạm thời (TD-30) app vẫn chạy trên một project, chưa lọc theo workspace.
 */
@Component
public class VehicSimAccess {

    private static final Set<String> WRITE_ROLES = Set.of("ADMIN", "ENGINEER", "EXPERIENCER");
    private static final Set<String> DECIDE_ROLES = Set.of("REVIEWER");

    private final OtpService otp;
    private final VehicSimProperties props;
    private final ViewsService views;

    public VehicSimAccess(OtpService otp, VehicSimProperties props, ViewsService views) {
        this.otp = otp;
        this.props = props;
        this.views = views;
    }

    public static long userId(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getId();
    }

    public static String roleOf(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getRole().getCode().name();
    }

    /** Thao tác ghi (tạo / chạy / candidate / regression): ADMIN, ENGINEER, EXPERIENCER; còn lại 403. Trả id người dùng. */
    public static long requireEngineer(UserDetails user) {
        if (!WRITE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cần quyền ENGINEER, EXPERIENCER hoặc ADMIN để thực hiện thao tác này");
        }
        return userId(user);
    }

    /** Chỉ Reviewer duyệt: Engineer không tự duyệt việc mình làm, EXP không có recommendation (ADR-035). Trả id người dùng. */
    public static long requireReviewer(UserDetails user) {
        if (!DECIDE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ REVIEWER được Accept / Reject recommendation");
        }
        return userId(user);
    }

    /**
     * Tạo họ / candidate / regression / chạy tốn tài nguyên (mỗi run là một tiến trình Python) và app mở đăng ký công khai
     * (mọi người tự đăng ký đều có quyền ghi vào project chung — TD-30): giới hạn số lần theo người dùng trong cửa sổ rate-limit.
     */
    public void limitWrites(long userId, String bucket) {
        if (otp.hitRateLimit("vs_" + bucket, String.valueOf(userId), props.writesPerWindow())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Thao tác quá nhiều lần, thử lại sau ít phút");
        }
    }

    /** Project hiện tại (MVP một project ACTIVE mặc định). */
    public long projectId() {
        return ((Number) ((Map<?, ?>) views.context().get("project")).get("id")).longValue();
    }
}
