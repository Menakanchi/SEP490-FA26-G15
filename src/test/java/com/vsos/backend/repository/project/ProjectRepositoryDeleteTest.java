package com.vsos.backend.repository.project;

import com.vsos.backend.repository.common.Db;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import com.vsos.backend.repository.common.Row;
import java.util.Map;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProjectRepositoryDeleteTest {
    @Test
    void deletesFailureAnalysisChildrenBeforeParentsWithinTheSelectedProject() {
        Db db = mock(Db.class);
        when(db.first("SELECT id, name, workspace_id, created_by_user_id FROM projects WHERE id = ? FOR UPDATE", 42L))
                .thenReturn(new Row(Map.of("id", 42L, "name", "Demo", "created_by_user_id", 7L)));
        new ProjectRepository(db).delete(42L, 7L, "Demo", "storage");
        InOrder order = inOrder(db);
        order.verify(db).update("DELETE FROM fa_json_handoffs WHERE project_id = ?", 42L);
        order.verify(db).update("DELETE FROM fa_json_reports WHERE project_id = ?", 42L);
        order.verify(db).update("DELETE FROM fa_json_executions WHERE project_id = ?", 42L);
        order.verify(db).update("DELETE FROM fa_json_sources WHERE project_id = ?", 42L);
        order.verify(db).update("DELETE FROM projects WHERE id = ?", 42L);
    }
}
