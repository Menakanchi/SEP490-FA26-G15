package com.vsos.backend.security;

import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import com.vsos.backend.service.project.ProjectService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import java.util.Optional;

import static com.vsos.backend.exception.project.ProjectError.NO_PROJECT_OPEN;
import static com.vsos.backend.exception.project.ProjectError.PROJECT_ARCHIVED;
import static com.vsos.backend.exception.project.ProjectError.PROJECT_NOT_FOUND;

@Component
@RequestScope
@RequiredArgsConstructor
public class ProjectScope {

    public static final String HEADER = "X-VehicSim-Project";

    private final HttpServletRequest request;
    private final ProjectRepository projects;
    private Optional<Row> resolved;

    public Row current() {
        return find().orElseThrow(() -> experiencerId() == null
                ? new NotFoundException("project — ADMIN gọi POST /api/v1/vehicsim/bootstrap để tạo project mặc định")
                : new ProjectException(NO_PROJECT_OPEN));
    }

    public Optional<Row> find() {
        if (resolved == null) {
            resolved = Optional.ofNullable(resolve());
        }
        return resolved;
    }

    private Row resolve() {
        Long userId = experiencerId();
        if (userId == null) {
            return projects.firstActiveTeamProject();
        }
        String header = request.getHeader(HEADER);
        if (header == null || header.isBlank()) {
            return projects.latestActivePersonal(userId);
        }
        Row project = projects.row(parse(header.strip()));
        ProjectService.requireOwner(project, header.strip(), userId);
        if (!"ACTIVE".equals(project.str("status"))) {
            throw new ProjectException(PROJECT_ARCHIVED, project.str("name"));
        }
        return project;
    }

    private static long parse(String projectId) {
        try {
            return Long.parseLong(projectId);
        } catch (NumberFormatException e) {
            throw new ProjectException(PROJECT_NOT_FOUND, projectId);
        }
    }

    private static Long experiencerId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof CustomUserDetails user
                && user.getUser().getRole().getCode() == RoleCode.EXPERIENCER ? user.getUser().getId() : null;
    }
}
