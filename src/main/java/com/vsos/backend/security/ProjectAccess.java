package com.vsos.backend.security;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Project của HTTP request: resolve một lần, dùng chung cho kiểm quyền và đọc dữ liệu. Không dùng trong job nền. */
@Component
@RequestScope
public class ProjectAccess {

    public static final String PROJECT_HEADER = "X-VehicSim-Project";
    private final HttpServletRequest request;
    private final Queries queries;
    private final ReviewerScope reviewerScope;
    private boolean resolved;
    private Row project;

    public ProjectAccess(HttpServletRequest request, Queries queries, ReviewerScope reviewerScope) {
        this.request = request;
        this.queries = queries;
        this.reviewerScope = reviewerScope;
    }

    private CustomUserDetails user() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof CustomUserDetails user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Cần đăng nhập để chọn project");
        }
        return user;
    }

    private Row resolve() {
        if (!resolved) {
            var user = user();
            if ("REVIEWER".equals(VehicSimAccess.roleOf(user))) {
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
                project = reviewerScope.project(VehicSimAccess.userId(user), selected);
            } else {
                project = queries.defaultProject();
            }
            resolved = true;
        }
        return project;
    }

    public boolean hasProject() {
        return resolve() != null;
    }

    public Row currentProject() {
        Row selected = resolve();
        if (selected == null) throw new NotFoundException("project trong workspace của bạn — cần được Quản lý thêm vào workspace");
        return selected;
    }

    /** Không duyệt bằng project mặc định có thể đã đổi kể từ lúc client tải màn. */
    public long explicitProjectId() {
        if (request.getHeader(PROJECT_HEADER) == null) {
            throw new InvalidRequestException("Cần chọn project trước khi quyết định; hãy tải lại trang");
        }
        return currentProject().lng("id");
    }

    public List<Row> reviewerProjects() {
        var user = user();
        return "REVIEWER".equals(VehicSimAccess.roleOf(user)) ? reviewerScope.projects(VehicSimAccess.userId(user)) : List.of();
    }
}
