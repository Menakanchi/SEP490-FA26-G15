package com.vsos.backend.security;

import com.vsos.backend.service.auth.OtpService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import com.vsos.backend.config.VehicSimProperties;

/**
 * Kiểm quyền và hạn mức dùng chung cho mọi controller {@code /api/v1/vehicsim/*} (các controller của {@code com.vsos.backend} và {@code RegressionController}):
 * một chỗ duy nhất giữ luật role (ADR-035), để tách route ra controller khác không sinh ra bản luật thứ hai.
 * <p>
 * Tạo kịch bản / baseline / candidate cần ENGINEER, EXPERIENCER hoặc ADMIN; REVIEWER được chạy regression trong workspace của mình
 * và Accept / Reject (ADR-048); MANAGER chỉ đọc phần kỹ thuật. Phạm vi các role khác còn theo TD-30.
 */
@Component
public class VehicSimAccess {

    private static final Set<String> WRITE_ROLES = Set.of("ADMIN", "ENGINEER", "EXPERIENCER");
    private static final Set<String> DECIDE_ROLES = Set.of("REVIEWER");
    private static final Set<String> WORKSPACE_ADMIN_ROLES = Set.of("MANAGER", "ADMIN");
    private static final Set<String> WORKSPACE_MEMBER_ROLES = Set.of("ENGINEER", "REVIEWER");

    private final OtpService otp;
    private final VehicSimProperties props;
    private final ProjectAccess projects;

    public VehicSimAccess(OtpService otp, VehicSimProperties props, ProjectAccess projects) {
        this.otp = otp;
        this.props = props;
        this.projects = projects;
    }

    public static long userId(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getId();
    }

    public static String roleOf(UserDetails user) {
        return ((CustomUserDetails) user).getUser().getRole().getCode().name();
    }

    /** Thao tác ghi kỹ thuật: ADMIN, ENGINEER, EXPERIENCER; quyền chạy regression kiểm riêng. Trả id người dùng. */
    public static long requireEngineer(UserDetails user) {
        if (!WRITE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cần quyền ENGINEER, EXPERIENCER hoặc ADMIN để thực hiện thao tác này");
        }
        return userId(user);
    }

    /** ADR-048: Reviewer được chạy regression để kiểm tra; không mở các quyền ghi kỹ thuật khác. */
    public static long requireRegressionRunner(UserDetails user) {
        return "REVIEWER".equals(roleOf(user)) ? userId(user) : requireEngineer(user);
    }

    /** Chỉ Reviewer duyệt: Engineer không tự duyệt việc mình làm, EXP không có recommendation (ADR-035). Trả id người dùng. */
    public static long requireReviewer(UserDetails user) {
        if (!DECIDE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ REVIEWER được Accept / Reject recommendation");
        }
        return userId(user);
    }

    /**
     * Quản lý workspace (xem thành viên, thêm / bớt ENGINEER, REVIEWER): MANAGER hoặc ADMIN; còn lại 403 (ADR-035, ADR-038).
     * "Đúng workspace của mình" kiểm ở {@code WorkspaceService}. Trả id người dùng.
     */
    public static long requireWorkspaceManager(UserDetails user) {
        if (!WORKSPACE_ADMIN_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cần quyền MANAGER hoặc ADMIN để quản lý workspace");
        }
        return userId(user);
    }

    /**
     * Việc của thành viên workspace (task được giao, nộp báo cáo — UC-21, UC-64, UC-66): ENGINEER hoặc REVIEWER; còn lại 403.
     * "Đúng workspace mình là thành viên" kiểm ở {@code MemberWorkService}. Trả id người dùng.
     */
    public static long requireWorkspaceMember(UserDetails user) {
        if (!WORKSPACE_MEMBER_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ ENGINEER hoặc REVIEWER có task và báo cáo công việc");
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
        return projects.currentProject().lng("id");
    }
}
