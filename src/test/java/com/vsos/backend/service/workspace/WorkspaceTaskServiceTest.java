package com.vsos.backend.service.workspace;

import com.vsos.backend.dto.workspace.WorkspaceDtos.ProjectRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UserRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.workspace.WorkspaceRepository;
import com.vsos.backend.repository.workspace.WorkspaceRepository.UserAccount;
import com.vsos.backend.repository.workspace.WorkspaceTaskRepository;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import com.vsos.backend.service.notification.NotificationService;

/**
 * Luật giao / sửa / xoá task (M6, M7): chỉ giao cho thành viên đang hoạt động; project phải thuộc workspace và còn ACTIVE; hạn mới không ở
 * quá khứ; DONE thì 100 %; task có báo cáo không xoá và không đổi project; giá trị giữ nguyên không bị kiểm lại; workspace người khác 404,
 * workspace lưu trữ chỉ xem.
 */
class WorkspaceTaskServiceTest {

    private static final long MANAGER = 5L;
    private static final long WS = 10L;
    private static final long ENGINEER = 20L;
    private static final long PROJECT = 30L;
    private static final long TASK = 40L;

    private WorkspaceService workspaces;
    private WorkspaceRepository members;
    private WorkspaceTaskRepository tasks;
    private WorkspaceTaskService service;
    private NotificationService notifications;

    @BeforeEach
    void setUp() {
        members = mock(WorkspaceRepository.class);
        tasks = mock(WorkspaceTaskRepository.class);
        notifications = mock(NotificationService.class);
        workspaces = new WorkspaceService(members, notifications);
        service = new WorkspaceTaskService(workspaces, members, tasks, notifications);
        when(members.find(WS)).thenReturn(workspace("ACTIVE"));
        when(members.isMember(WS, ENGINEER)).thenReturn(true);
        when(members.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", true));
        when(tasks.projectStatusInWorkspace(WS, PROJECT)).thenReturn("ACTIVE");
        when(tasks.insert(anyLong(), any(), anyString(), any(), anyString(), anyString(), anyInt(), any(), anyLong(), any())).thenReturn(TASK);
    }

    private static WorkspaceSummary workspace(String status) {
        return new WorkspaceSummary(WS, "AEB Pedestrian", null, status, new UserRef(MANAGER, "Quản Lý", "m@example.com"), 1, 1, 0,
                LocalDateTime.now());
    }

    private static TaskRequest req(String status, Integer progress, Long assignee, Long project, LocalDate due) {
        return new TaskRequest("Chạy lại họ PX2", "  ghi chú  ", "HIGH", status, progress, assignee, project, due);
    }

    private static TaskItem existing(Long assignee, Long project, LocalDate due, int reports) {
        return new TaskItem(TASK, "Cũ", null, "MEDIUM", "IN_PROGRESS", 40,
                assignee == null ? null : new UserRef(assignee, "Kỹ Sư", "e@example.com"),
                project == null ? null : new ProjectRef(project, "VF9"),
                new UserRef(MANAGER, "Quản Lý", "m@example.com"), due, false, reports, LocalDateTime.now(), LocalDateTime.now());
    }

    // ------------------------------------------------------------------ M6: giao task

    @Test
    void createsATaskWithDefaultsAndTrimmedText() {
        service.create(MANAGER, "MANAGER", WS, new TaskRequest("  Chạy lại họ PX2 ", "  ghi chú  ", null, null, null, ENGINEER, PROJECT,
                LocalDate.now().plusDays(3)));

        verify(tasks).insert(WS, PROJECT, "Chạy lại họ PX2", "ghi chú", "MEDIUM", "TODO", 0, ENGINEER, MANAGER, LocalDate.now().plusDays(3));
        verify(tasks).find(WS, TASK);
        String due = LocalDate.now().plusDays(3).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER), eq(WS), eq("TASK_ASSIGNED"), eq("Bạn được giao task: Chạy lại họ PX2"),
                eq("Workspace AEB Pedestrian · ưu tiên trung bình · hạn " + due + "."), eq("TASK"), eq(TASK));
    }

    @Test
    void reassigningNotifiesTheNewAssigneeOnlyWhenTheAssigneeChanges() {
        when(tasks.find(WS, TASK)).thenReturn(existing(null, null, null, 0));
        service.update(MANAGER, "MANAGER", WS, TASK, req("IN_PROGRESS", 50, ENGINEER, null, null));
        verify(notifications).notify(eq(ENGINEER), eq(MANAGER), eq(WS), eq("TASK_ASSIGNED"), anyString(), anyString(), eq("TASK"), eq(TASK));

        when(tasks.find(WS, TASK)).thenReturn(existing(ENGINEER, null, null, 0));
        service.update(MANAGER, "MANAGER", WS, TASK, req("REVIEW", 80, ENGINEER, null, null));
        service.update(MANAGER, "MANAGER", WS, TASK, req("REVIEW", 80, null, null, null));
        verify(notifications, times(1)).notify(anyLong(), anyLong(), any(), anyString(), anyString(), anyString(), any(), any());
    }

    @Test
    void taskWithoutAssigneeProjectOrDueDateIsAllowed() {
        service.create(MANAGER, "MANAGER", WS, req(null, null, null, null, null));
        verify(tasks).insert(eq(WS), isNull(), anyString(), anyString(), eq("HIGH"), eq("TODO"), eq(0), isNull(), eq(MANAGER), isNull());
        verifyNoInteractions(notifications);
    }

    @Test
    void doneMeansFullProgress() {
        service.create(MANAGER, "MANAGER", WS, req("DONE", 30, null, null, null));
        verify(tasks).insert(anyLong(), any(), anyString(), any(), anyString(), eq("DONE"), eq(100), any(), anyLong(), any());
    }

    @Test
    void onlyActiveWorkspaceMembersCanBeAssigned() {
        when(members.isMember(WS, 99L)).thenReturn(false);
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, 99L, null, null)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("thành viên");

        when(members.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", false));
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, ENGINEER, null, null))).hasMessageContaining("khoá");
        verify(tasks, never()).insert(anyLong(), any(), anyString(), any(), anyString(), anyString(), anyInt(), any(), anyLong(), any());
    }

    @Test
    void projectMustBelongToTheWorkspaceAndBeActive() {
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, null, 77L, null)))
                .hasMessageContaining("không thuộc workspace");
        when(tasks.projectStatusInWorkspace(WS, PROJECT)).thenReturn("ARCHIVED");
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, null, PROJECT, null))).hasMessageContaining("lưu trữ");
    }

    @Test
    void newDueDateCannotBeInThePastButTodayIsFine() {
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, null, null, LocalDate.now().minusDays(1))))
                .hasMessageContaining("quá khứ");
        service.create(MANAGER, "MANAGER", WS, req(null, null, null, null, LocalDate.now()));
    }

    @Test
    void unknownPriorityOrStatusIsRefused() {
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS,
                new TaskRequest("x", null, "CRITICAL", null, null, null, null, null))).hasMessageContaining("ưu tiên");
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req("BLOCKED", null, null, null, null)))
                .hasMessageContaining("Trạng thái");
        assertThatThrownBy(() -> service.list(MANAGER, "MANAGER", WS, "BLOCKED", null)).hasMessageContaining("Trạng thái");
    }

    @Test
    void anotherManagersWorkspaceIsNotFoundAndArchivedIsReadOnly() {
        assertThatThrownBy(() -> service.create(6L, "MANAGER", WS, req(null, null, null, null, null))).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.list(6L, "MANAGER", WS, null, null)).isInstanceOf(NotFoundException.class);

        when(members.find(WS)).thenReturn(workspace("ARCHIVED"));
        assertThatThrownBy(() -> service.create(MANAGER, "MANAGER", WS, req(null, null, null, null, null))).hasMessageContaining("lưu trữ");
        assertThatThrownBy(() -> service.delete(MANAGER, "MANAGER", WS, TASK)).hasMessageContaining("lưu trữ");
        service.list(MANAGER, "MANAGER", WS, null, null);
        verify(tasks).list(WS, null, null);
    }

    // ------------------------------------------------------------------ M7: sửa / xoá

    @Test
    void updatingKeepsUnchangedValuesEvenIfTheyNoLongerPassNewTaskRules() {
        // Task gắn project nay đã lưu trữ, hạn đã qua, người nhận nay bị khoá: sửa trường khác vẫn được.
        LocalDate past = LocalDate.now().minusDays(5);
        when(tasks.find(WS, TASK)).thenReturn(existing(ENGINEER, PROJECT, past, 0));
        when(tasks.projectStatusInWorkspace(WS, PROJECT)).thenReturn("ARCHIVED");
        when(members.findUser(ENGINEER)).thenReturn(new UserAccount(ENGINEER, "e@example.com", "ENGINEER", false));

        service.update(MANAGER, "MANAGER", WS, TASK, req("REVIEW", 80, ENGINEER, PROJECT, past));

        verify(tasks).update(WS, TASK, PROJECT, "Chạy lại họ PX2", "ghi chú", "HIGH", "REVIEW", 80, ENGINEER, past);
    }

    @Test
    void blankStatusAndProgressKeepTheCurrentValuesOnUpdate() {
        when(tasks.find(WS, TASK)).thenReturn(existing(null, null, null, 0));
        service.update(MANAGER, "MANAGER", WS, TASK, new TaskRequest("Cũ", null, null, null, null, null, null, null));
        verify(tasks).update(WS, TASK, null, "Cũ", null, "MEDIUM", "IN_PROGRESS", 40, null, null);
    }

    @Test
    void aTaskWithReportsCannotMoveProjectOrBeDeleted() {
        when(tasks.find(WS, TASK)).thenReturn(existing(null, PROJECT, null, 2));

        assertThatThrownBy(() -> service.update(MANAGER, "MANAGER", WS, TASK, req(null, null, null, null, null)))
                .hasMessageContaining("báo cáo");
        assertThatThrownBy(() -> service.delete(MANAGER, "MANAGER", WS, TASK)).hasMessageContaining("2 báo cáo");
        verify(tasks, never()).delete(anyLong(), anyLong());
        // Giữ project thì vẫn sửa được.
        service.update(MANAGER, "MANAGER", WS, TASK, req("DONE", null, null, PROJECT, null));
        verify(tasks).update(eq(WS), eq(TASK), eq(PROJECT), anyString(), any(), anyString(), eq("DONE"), eq(100), isNull(), isNull());
    }

    @Test
    void deletesATaskWithoutReports() {
        when(tasks.find(WS, TASK)).thenReturn(existing(null, null, null, 0));
        service.delete(MANAGER, "MANAGER", WS, TASK);
        verify(tasks).delete(WS, TASK);
    }

    @Test
    void missingTaskIsNotFound() {
        assertThatThrownBy(() -> service.update(MANAGER, "MANAGER", WS, TASK, req(null, null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.delete(MANAGER, "MANAGER", WS, TASK)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void listPassesFiltersThrough() {
        service.list(MANAGER, "MANAGER", WS, "TODO", 0L);
        verify(tasks).list(WS, "TODO", 0L);
        assertThat(service.list(1L, "ADMIN", WS, " ", ENGINEER)).isEmpty();
        verify(tasks).list(WS, null, ENGINEER);
    }
}
