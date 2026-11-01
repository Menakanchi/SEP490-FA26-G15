package com.vsos.backend.security;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import org.springframework.stereotype.Component;

import java.util.List;

/** UC-62/UC-63: lọc project của Reviewer bằng membership; không đọc HTTP, security context hay dữ liệu xe. */
@Component
public class ReviewerScope {

    private static final String PROJECTS = """
            SELECT p.*, w.name AS workspace_name, w.status AS workspace_status
              FROM projects p
              JOIN workspaces w ON w.id = p.workspace_id
              JOIN workspace_members m ON m.workspace_id = p.workspace_id
             WHERE m.user_id = ?
            """;
    private static final String PROJECT_ORDER = " ORDER BY (p.status = 'ACTIVE' AND w.status = 'ACTIVE') DESC, p.id";

    private final Db db;

    public ReviewerScope(Db db) {
        this.db = db;
    }

    /** null = không có project trong phạm vi; không fallback sang project của người khác. */
    public Row project(long userId, Long projectId) {
        return projectId == null
                ? db.first(PROJECTS + PROJECT_ORDER + " LIMIT 1", userId)
                : db.first(PROJECTS + " AND p.id = ?", userId, projectId);
    }

    /** Bao gồm project/workspace lưu trữ để đọc lịch sử. */
    public List<Row> projects(long userId) {
        return db.list(PROJECTS + PROJECT_ORDER, userId);
    }
}
