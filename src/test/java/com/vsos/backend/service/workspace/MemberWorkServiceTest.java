package com.vsos.backend.service.workspace;

import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyProject;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ProjectRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportSubmitRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskProgressRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UserRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.workspace.WorkspaceReportRepository;
import com.vsos.backend.repository.workspace.WorkspaceRepository;
import com.vsos.backend.repository.workspace.WorkspaceTaskRepository;
import com.vsos.backend.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật việc của thành viên (UC-21, UC-66): chỉ sửa task đang giao cho mình, không tự đặt DONE, task đã DONE thì thôi; chỉ nộp báo cáo vào
 * project của workspace mình là thành viên, task gắn kèm phải của mình và cùng project; đính kèm chỉ http(s); Manager được báo.
 */
class MemberWorkServiceTest {

    private static final long ME = 20L;
    private static final long MANAGER = 5L;
    private static final long WS = 10L;
    private static final long TASK = 30L;
    private static final long PROJECT = 2L;

    private WorkspaceRepository workspaces;
    private WorkspaceTaskRepository tasks;
    private WorkspaceReportRepository reports;
    private NotificationService notifications;
    private MemberWorkService service;

    @BeforeEach
    void setUp() {
        workspaces = mock(WorkspaceRepository.class);
        tasks = mock(WorkspaceTaskRepository.class);
        reports = mock(WorkspaceReportRepository.class);
        notifications = mock(NotificationService.class);
        service = new MemberWorkService(workspaces, tasks, reports, notifications);
        when(workspaces.find(WS)).thenReturn(workspace("ACTIVE"));
        when(workspaces.isMember(WS, ME)).thenReturn(true);
        when(workspaces.memberProjects(ME)).thenReturn(List.of(new MyProject(PROJECT, "VF9", new WorkspaceRef(WS, "AEB", "ACTIVE"))));
        when(tasks.workspaceOf(TASK)).thenReturn(WS);
        when(tasks.projectStatusInWorkspace(WS, PROJECT)).thenReturn("ACTIVE");
        when(tasks.find(WS, TASK)).thenReturn(task(ME, "IN_PROGRESS", PROJECT));
        when(tasks.updateProgress(anyLong(), anyLong(), anyString(), anyInt())).thenReturn(true);
        when(reports.insert(anyLong(), any(), anyLong(), anyString(), anyString(), any())).thenReturn(50L);
        when(reports.find(WS, 50L)).thenReturn(new ReportItem(50L, new ProjectRef(PROJECT, "VF9"), null, new UserRef(ME, "Người Duyệt", "r@example.com"),
                "Tuần 44", "Đã chạy", null, "SUBMITTED", null, null, null, LocalDateTime.now()));
    }

    private static WorkspaceSummary workspace(String status) {
        return new WorkspaceSummary(WS, "AEB", null, status, new UserRef(MANAGER, "Quản Lý", "m@example.com"), 2, 1, 0, LocalDateTime.now());
    }

    private static TaskItem task(Long assignee, String status, Long projectId) {
        return new TaskItem(TASK, "Kiểm tra họ ban đêm", null, "HIGH", status, 40,
                assignee == null ? null : new UserRef(assignee, "Người Duyệt", "r@example.com"),
                projectId == null ? null : new ProjectRef(projectId, "VF9"), new UserRef(MANAGER, "Quản Lý", "m@example.com"),
                null, false, 0, LocalDateTime.now(), LocalDateTime.now());
    }

    private static ReportSubmitRequest report(Long projectId, Long taskId, String attachment) {
        return new ReportSubmitRequest(projectId, taskId, "  Tuần 44 ", " Đã chạy lại họ PX2 ", attachment);
    }

    @Test
    void assigneeMovesTheTaskForwardAndManagerHearsWhenItIsReadyForReview() {
        service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 60));
        verify(tasks).updateProgress(TASK, ME, "IN_PROGRESS", 60);
        verify(notifications, never()).notify(anyLong(), anyLong(), any(), anyString(), anyString(), anyString(), any(), any());

        service.updateProgress(ME, TASK, new TaskProgressRequest("REVIEW", 100));
        verify(tasks).updateProgress(TASK, ME, "REVIEW", 100);
        verify(notifications).notify(eq(MANAGER), eq(ME), eq(WS), eq("SYSTEM"), anyString(), anyString(), eq("TASK"), eq(TASK));
    }

    @Test
    void doneIsLeftToTheManager() {
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("DONE", 100)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("Manager");
        when(tasks.find(WS, TASK)).thenReturn(task(ME, "DONE", PROJECT));
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("REVIEW", 100)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("xác nhận");
        verify(tasks, never()).updateProgress(anyLong(), anyLong(), anyString(), anyInt());
    }

    @Test
    void someoneElsesTaskLooksMissing() {
        when(tasks.find(WS, TASK)).thenReturn(task(99L, "TODO", PROJECT));
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).isInstanceOf(NotFoundException.class);
        when(tasks.find(WS, TASK)).thenReturn(task(null, "TODO", PROJECT));
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).isInstanceOf(NotFoundException.class);
        when(tasks.find(WS, TASK)).thenReturn(task(ME, "TODO", PROJECT));
        when(workspaces.isMember(WS, ME)).thenReturn(false);
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).isInstanceOf(NotFoundException.class);
        when(tasks.workspaceOf(TASK)).thenReturn(null);
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).isInstanceOf(NotFoundException.class);
    }

    @Test
    void archivedWorkspaceAndConcurrentManagerChangeAreRefused() {
        when(workspaces.find(WS)).thenReturn(workspace("ARCHIVED"));
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).hasMessageContaining("lưu trữ");
        when(workspaces.find(WS)).thenReturn(workspace("ACTIVE"));
        when(tasks.updateProgress(anyLong(), anyLong(), anyString(), anyInt())).thenReturn(false);
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 10))).hasMessageContaining("tải lại");
    }

    @Test
    void anArchivedProjectIsReadOnlyEvenWhenItsWorkspaceIsActive() {
        when(tasks.projectStatusInWorkspace(WS, PROJECT)).thenReturn("ARCHIVED");
        assertThatThrownBy(() -> service.updateProgress(ME, TASK, new TaskProgressRequest("IN_PROGRESS", 60)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("Project đã lưu trữ");
        verify(tasks, never()).updateProgress(anyLong(), anyLong(), anyString(), anyInt());
    }

    @Test
    void submitsATrimmedReportAndTellsTheManager() {
        ReportItem saved = service.submitReport(ME, report(PROJECT, TASK, " https://drive.example.com/r44 "));
        assertThat(saved.id()).isEqualTo(50L);
        verify(reports).insert(PROJECT, TASK, ME, "Tuần 44", "Đã chạy lại họ PX2", "https://drive.example.com/r44");
        verify(notifications).notify(eq(MANAGER), eq(ME), eq(WS), eq("REPORT_SUBMITTED"), anyString(), anyString(), eq("REPORT"), eq(50L));

        service.submitReport(ME, report(PROJECT, null, "  "));
        verify(reports).insert(eq(PROJECT), isNull(), eq(ME), eq("Tuần 44"), eq("Đã chạy lại họ PX2"), isNull());
    }

    @Test
    void reportNotificationHasAFallbackForNullOrBlankSubmitterName() {
        for (String name : new String[]{null, "   "}) {
            when(reports.find(WS, 50L)).thenReturn(new ReportItem(50L, new ProjectRef(PROJECT, "VF9"), null,
                    new UserRef(ME, name, "r@example.com"), "Tuần 44", "Đã chạy", null, "SUBMITTED", null, null, null, LocalDateTime.now()));
            service.submitReport(ME, report(PROJECT, null, null));
        }
        verify(notifications, org.mockito.Mockito.times(2)).notify(eq(MANAGER), eq(ME), eq(WS), eq("REPORT_SUBMITTED"), anyString(),
                eq("Người nộp nộp báo cáo cho project VF9."), eq("REPORT"), eq(50L));
    }

    @Test
    void reportGoesOnlyToMyProjectsAndMyTasks() {
        assertThatThrownBy(() -> service.submitReport(ME, report(77L, null, null))).hasMessageContaining("thành viên");
        when(tasks.find(WS, TASK)).thenReturn(task(99L, "IN_PROGRESS", PROJECT));
        assertThatThrownBy(() -> service.submitReport(ME, report(PROJECT, TASK, null))).hasMessageContaining("giao cho bạn");
        // FK ghép task_reports(task_id, project_id): task phải cùng project với báo cáo.
        when(tasks.find(WS, TASK)).thenReturn(task(ME, "IN_PROGRESS", null));
        assertThatThrownBy(() -> service.submitReport(ME, report(PROJECT, TASK, null))).hasMessageContaining("không thuộc project");
        verify(reports, never()).insert(anyLong(), any(), anyLong(), anyString(), anyString(), any());
    }

    @Test
    void attachmentMustBeAnHttpLink() {
        for (String bad : List.of("javascript:alert(1)", "file:///C:/x", "ftp://host/x", "không phải link")) {
            assertThatThrownBy(() -> service.submitReport(ME, report(PROJECT, null, bad))).as(bad).hasMessageContaining("http");
        }
        verify(reports, never()).insert(anyLong(), any(), anyLong(), anyString(), anyString(), any());
    }
}
