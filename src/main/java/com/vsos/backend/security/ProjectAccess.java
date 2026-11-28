package com.vsos.backend.security;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.repository.common.Row;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Project của HTTP request: resolve một lần, dùng chung cho kiểm quyền và đọc dữ liệu. Không dùng trong job nền.
 * Reviewer và Kỹ sư chọn bằng header {@link ProjectScope#HEADER} trong các workspace mình là thành viên ({@link ReviewerScope}, ADR-064);
 * role khác theo {@link ProjectScope} (EXPERIENCER: project cá nhân đang mở; ADMIN/MANAGER: project chung, TD-30).
 */
@Component
@RequestScope
public class ProjectAccess {

    public static final String PROJECT_HEADER = ProjectScope.HEADER;
    private final HttpServletRequest request;
    private final ProjectScope scope;
    private final ReviewerScope reviewerScope;
    private boolean resolved;
    private Row project;

    public ProjectAccess(HttpServletRequest request, ProjectScope scope, ReviewerScope reviewerScope) {
        this.request = request;
        this.scope = scope;
        this.reviewerScope = reviewerScope;
    }

    private CustomUserDetails user() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof CustomUserDetails user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Cần đăng nhập để chọn project");
        }
        return user;
    }

    /** ADR-064: REVIEWER và ENGINEER làm việc trong project của workspace mình là thành viên, không còn một project chung. */
    private boolean reviewer() {
        return isWorkspaceScoped(VehicSimAccess.roleOf(user()));
    }

    private static boolean isWorkspaceScoped(String role) {
        return "REVIEWER".equals(role) || "ENGINEER".equals(role);
    }

    private Row reviewerProject() {
        if (!resolved) {
            String header = request.getHeader(PROJECT_HEADER);
            Long selected = null;
            if (header != null) {
                try {
                    selected = Long.parseLong(header);
                    if (selected <= 0) throw new NumberFormatException();
                } catch (NumberFormatException e) {
                    throw new InvalidRequestException("Mã project không hợp lệ");
                }
            }
            project = reviewerScope.project(VehicSimAccess.userId(user()), selected);
            resolved = true;
        }
        return project;
    }

    public boolean hasProject() {
        return reviewer() ? reviewerProject() != null : scope.find().isPresent();
    }

    public Row currentProject() {
        Row selected = reviewer() ? reviewerProject() : scope.current();
        if (selected == null) throw new NotFoundException("project trong workspace của bạn — hãy kiểm tra workspace và chọn hoặc tạo project phù hợp");
        String method = request.getMethod();
        if (("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method))
                && ("ARCHIVED".equals(selected.str("status")) || "ARCHIVED".equals(selected.str("workspace_status")))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project hoặc workspace đã lưu trữ, chỉ có thể xem dữ liệu");
        }
        return selected;
    }

    /**
     * Không thao tác bằng project mặc định có thể đã đổi kể từ lúc client tải màn.
     *
     * @param action việc đang làm, ghép vào câu báo lỗi (vd. "tạo kiểm thử hồi quy", "quyết định")
     */
    public long explicitProjectId(String action) {
        if (request.getHeader(PROJECT_HEADER) == null) {
            throw new InvalidRequestException("Cần chọn project trước khi " + action + "; hãy tải lại trang");
        }
        return currentProject().lng("id");
    }

    public List<Row> reviewerProjects() {
        var user = user();
        return isWorkspaceScoped(VehicSimAccess.roleOf(user)) ? reviewerScope.projects(VehicSimAccess.userId(user)) : List.of();
    }
}
