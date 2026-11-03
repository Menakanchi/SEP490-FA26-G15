package com.vsos.backend.security;

import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
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
 * Mỗi người đúng một role hệ thống: tạo / chạy / candidate cần ENGINEER, EXPERIENCER hoặc ADMIN; REVIEWER được chạy regression trong
 * workspace của mình và là role duy nhất Accept / Reject (ADR-049); MANAGER chỉ đọc. Project của request do {@link ProjectAccess} chọn:
 * EXPERIENCER làm việc trong project cá nhân đang mở ({@link ProjectScope}), REVIEWER trong project thuộc workspace mình là thành viên;
 * role khác tạm thời vẫn chạy trên một project chung, chưa lọc theo workspace (TD-30).
 */
@Component
public class VehicSimAccess {

    private static final Set<String> WRITE_ROLES = Set.of("ADMIN", "ENGINEER", "EXPERIENCER");
    private static final Set<String> DECIDE_ROLES = Set.of("REVIEWER");
    private static final Set<String> WORKSPACE_ROLES = Set.of("MANAGER", "ENGINEER", "REVIEWER");

    private final OtpService otp;
    private final VehicSimProperties props;
    private final ProjectAccess projects;

    public VehicSimAccess(OtpService otp, VehicSimProperties props, ProjectAccess projects) {
        this.otp = otp;
        this.props = props;
        this.projects = projects;
    }

    public static long requireAdmin(UserDetails user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chưa đăng nhập");
        if (!"ADMIN".equals(roleOf(user))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ ADMIN được quản trị hệ thống");
        return userId(user);
    }

    /** Quản lý workspace (thành viên, giao / sửa / xoá task, duyệt báo cáo): chỉ MANAGER; "đúng workspace mình quản lý" kiểm ở service. */
    public static long requireMemberManager(UserDetails user) {
        if (!"MANAGER".equals(roleOf(user))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ Quản lý workspace được thực hiện thao tác này");
        return userId(user);
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

    /** ADR-049: Reviewer được chạy regression để kiểm tra; không mở các quyền ghi kỹ thuật khác. */
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

    public static long requireExperiencer(UserDetails user) {
        if (!"EXPERIENCER".equals(roleOf(user))) {
            throw new ProjectException(ProjectError.EXPERIENCER_ONLY);
        }
        return userId(user);
    }

    /**
     * Khu workspace (xem workspace / thành viên, task, báo cáo, chat): MANAGER, ENGINEER, REVIEWER; role khác 403. Từng bản ghi kiểm ở
     * service: thành viên / Manager của workspace; task, báo cáo của người khác chỉ người được giao / người nộp và Manager nhận được xem.
     * Thao tác quản lý (thêm / bớt thành viên, giao / sửa / xoá task, duyệt báo cáo) dùng {@link #requireMemberManager}. Trả id người dùng.
     */
    public static long requireWorkspaceRole(UserDetails user) {
        if (!WORKSPACE_ROLES.contains(roleOf(user))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ Quản lý, Kỹ sư hoặc Người duyệt của workspace được dùng chức năng này");
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
