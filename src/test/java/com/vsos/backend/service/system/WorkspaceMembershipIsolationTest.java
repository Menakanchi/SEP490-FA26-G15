package com.vsos.backend.service.system;

import com.vsos.backend.dto.auth.AdminRequests.UserRequest;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.repository.common.AdminRepository;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.LegacyAwarePasswordEncoder;
import com.vsos.backend.service.notification.NotificationService;
import com.vsos.backend.service.workspace.WorkspaceChatHub;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** System roles alone must never grant membership in another team's workspace (ADR-048/064). */
class WorkspaceMembershipIsolationTest {
    @ParameterizedTest
    @EnumSource(value = RoleCode.class, names = {"ENGINEER", "REVIEWER"})
    void creatingOrPromotingAnAccountDoesNotEnrollItInAnUnselectedWorkspace(RoleCode role) {
        var db = mock(Db.class);
        var passwords = mock(LegacyAwarePasswordEncoder.class);
        when(passwords.encode(anyString())).thenReturn("encoded-password");
        when(db.first(startsWith("SELECT u.id,u.email"), any(Object[].class))).thenReturn(new Row(Map.of(
                "id",2L,"email","user@example.com","role","EXPERIENCER","is_active",true)));
        when(db.insert(contains("INSERT INTO users"), any(Object[].class))).thenReturn(2L);
        var service = new AdminService(new AdminRepository(db), passwords, mock(NotificationService.class), mock(WorkspaceChatHub.class));

        service.createUser(1, new UserRequest("user@example.com","Nguyen",null,"An",role,true,"safe-password-42"));
        service.updateUser(1, 2, new UserRequest("user@example.com","Nguyen",null,"An",role,true,null));

        verify(db).insert(contains("INSERT INTO users"),any(Object[].class));
        verify(db).update(contains("UPDATE users SET"),any(Object[].class));
        verify(db,never()).update(contains("workspace_members"),any(Object[].class));
        verify(db,never()).insert(contains("workspace_members"),any(Object[].class));
        verify(db,never()).batchInsert(contains("workspace_members"),any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void bootstrappingANewOrExistingProjectDoesNotEnrollEveryEngineerAndReviewer(boolean existing) {
        var db = mock(Db.class);
        when(db.first("SELECT id FROM aeb_parameters LIMIT 1")).thenReturn(new Row(Map.of("id",1L)));
        when(db.first("SELECT id FROM carla_vehicle_models LIMIT 1")).thenReturn(new Row(Map.of("id",7L)));
        when(db.first("SELECT id, workspace_id FROM projects WHERE workspace_id IS NOT NULL ORDER BY id LIMIT 1"))
                .thenReturn(existing ? new Row(Map.of("id",41L,"workspace_id",3L)) : null);
        when(db.scalar(contains("SELECT id FROM carla_vehicle_models"),any(Object[].class))).thenReturn(7L);
        when(db.insert(contains("INSERT INTO workspaces"),any(Object[].class))).thenReturn(3L);
        when(db.insert(contains("INSERT INTO projects"),any(Object[].class))).thenReturn(41L);
        when(db.insert(contains("INSERT INTO aeb_versions"),any(Object[].class))).thenReturn(1L);
        when(db.list("SELECT * FROM aeb_parameters")).thenReturn(List.of(new Row(Map.of("id",1L,"code","TTC_THRESHOLD","default_value",1.5))));

        var result = new BootstrapService(db).ensureDefaultProject(1L);

        assertThat(result).containsEntry("project_id",41L).containsEntry("created",!existing);
        verify(db,never()).update(contains("workspace_members"),any(Object[].class));
        verify(db,never()).insert(contains("workspace_members"),any(Object[].class));
        verify(db,never()).batchInsert(contains("workspace_members"),any());
    }
}
