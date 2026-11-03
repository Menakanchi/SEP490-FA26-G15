package com.vsos.backend.security;

import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.service.auth.OtpService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Set;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.service.system.SystemViewService;

/**
 * Kiểm quyền và hạn mức dùng chung cho mọi controller {@code /api/v1/vehicsim/*} (các controller của {@code com.vsos.backend} và {@code RegressionController}):
 * một chỗ duy nhất giữ luật role (ADR-035), để tách route ra controller khác không sinh ra bản luật thứ hai.
 * <p>
 * Mỗi người đúng một role hệ thống: tạo / chạy / candidate / regression cần ENGINEER, EXPERIENCER hoặc ADMIN; Accept / Reject chỉ
 * REVIEWER; MANAGER chỉ đọc. EXPERIENCER làm việc trong project cá nhân đang mở ({@link ProjectScope}); role khác tạm thời
 * vẫn chạy trên một project chung, chưa lọc theo workspace (TD-30).
 */
@Component
public class VehicSimAccess {

    private static final Set<String> WRITE_ROLES = Set.of("ADMIN", "ENGINEER", "EXPERIENCER");
    private static final Set<String> DECIDE_ROLES = Set.of("REVIEWER");
    private static final Set<String> WORKSPACE_ADMIN_ROLES = Set.of("MANAGER", "ADMIN");

    private final OtpService otp;
    private final VehicSimProperties props;
    private final SystemViewService views;

    public VehicSimAccess(OtpService otp, VehicSimProperties props, SystemViewService views) {
        this.otp = otp;
        this.props = props;
        this.views = views;
    }

    public static long requireAdmin(UserDetails user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chưa đăng nhập");
        if (!"ADMIN".equals(roleOf(user))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ ADMIN được quản trị hệ thống");
        return userId(user);
    }

    public static long requireMemberManager(UserDetails user) {
        if (!"MANAGER".equals(roleOf(user))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ MANAGER quản lý thành viên workspace");
        return userId(user);
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

    public static long requireExperiencer(UserDetails user) {
        if (!"EXPERIENCER".equals(roleOf(user))) {
            throw new ProjectException(ProjectError.EXPERIENCER_ONLY);
        }
        return userId(user);
    }

    /**
     * Đọc workspace / task / report: MANAGER hoặc ADMIN; ghi thành viên dùng requireMemberManager.
     * "Đúng workspace của mình" kiểm ở {@code WorkspaceService}. Trả id người dùng.
     */
    public static long requireWorkspaceManager(UserDetails user) {
        if (!WORKSPACE_ADMIN_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cần quyền MANAGER hoặc ADMIN để quản lý workspace");
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
