package com.vehicsim.service;

import com.vehicsim.dto.WorkspaceDtos.ProjectRef;
import com.vehicsim.dto.WorkspaceDtos.ReportItem;
import com.vehicsim.dto.WorkspaceDtos.UserRef;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.repository.WorkspaceReportRepository;
import com.vehicsim.repository.WorkspaceRepository;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Luật duyệt báo cáo (M8, M9): chỉ báo cáo SUBMITTED duyệt được và chỉ một lần; từ chối phải có nhận xét; người duyệt sau trong một cuộc
 * đua nhận lỗi; workspace người khác 404; workspace lưu trữ chỉ xem.
 */
class WorkspaceReportServiceTest {

    private static final long MANAGER = 5L;
    private static final long WS = 10L;
    private static final long REPORT = 50L;

    private WorkspaceRepository workspaceRepo;
    private WorkspaceReportRepository reports;
    private WorkspaceReportService service;
    private NotificationService notifications;

    @BeforeEach
    void setUp() {
        workspaceRepo = mock(WorkspaceRepository.class);
        reports = mock(WorkspaceReportRepository.class);
        notifications = mock(NotificationService.class);
        service = new WorkspaceReportService(new WorkspaceService(workspaceRepo, notifications), reports, notifications);
        when(workspaceRepo.find(WS)).thenReturn(workspace("ACTIVE"));
        when(reports.find(WS, REPORT)).thenReturn(report("SUBMITTED"));
        when(reports.decide(anyLong(), anyString(), anyLong(), any(), any())).thenReturn(true);
    }

    private static WorkspaceSummary workspace(String status) {
        return new WorkspaceSummary(WS, "AEB Pedestrian", null, status, new UserRef(MANAGER, "Quản Lý", "m@example.com"), 1, 1, 1,
                LocalDateTime.now());
    }

    private static ReportItem report(String status) {
        return new ReportItem(REPORT, new ProjectRef(2L, "VF9"), null, new UserRef(20L, "Kỹ Sư", "e@example.com"), "Tuần 43", "Đã chạy PX2",
                null, status, null, null, null, LocalDateTime.now());
    }

    @Test
    void approvesWithAnOptionalTrimmedNoteAndRecordsTheReviewer() {
        service.decide(MANAGER, "MANAGER", WS, REPORT, "APPROVED", "  tốt  ");
        verify(reports).decide(eq(REPORT), eq("APPROVED"), eq(MANAGER), eq("tốt"), any());

        service.decide(MANAGER, "MANAGER", WS, REPORT, "APPROVED", "   ");
        verify(reports).decide(eq(REPORT), eq("APPROVED"), eq(MANAGER), isNull(), any());
    }

    @Test
    void rejectingNeedsANote() {
        assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, REPORT, "REJECTED", " ")).hasMessageContaining("nhận xét");
        service.decide(MANAGER, "MANAGER", WS, REPORT, "REJECTED", "Thiếu số liệu ca an toàn");
        verify(reports).decide(eq(REPORT), eq("REJECTED"), eq(MANAGER), eq("Thiếu số liệu ca an toàn"), any());
        // Người nộp được báo kết quả kèm nhận xét.
        verify(notifications).notify(eq(20L), eq(MANAGER), eq(WS), eq("SYSTEM"), eq("Báo cáo “Tuần 43” bị từ chối"),
                contains("Thiếu số liệu ca an toàn"), eq("REPORT"), eq(REPORT));
    }

    @Test
    void unknownDecisionIsRefused() {
        assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, REPORT, "SUBMITTED", "x")).hasMessageContaining("Quyết định");
        verify(reports, never()).decide(anyLong(), anyString(), anyLong(), any(), any());
    }

    @Test
    void aDecidedReportIsFinal() {
        for (String status : new String[]{"APPROVED", "REJECTED"}) {
            when(reports.find(WS, REPORT)).thenReturn(report(status));
            assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, REPORT, "APPROVED", null)).hasMessageContaining("đã được duyệt");
        }
        verify(reports, never()).decide(anyLong(), anyString(), anyLong(), any(), any());
    }

    @Test
    void theSecondReviewerInARaceGetsAnErrorInsteadOfOverwriting() {
        when(reports.decide(anyLong(), anyString(), anyLong(), any(), any())).thenReturn(false);
        assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, REPORT, "APPROVED", null))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("người khác duyệt");
        verifyNoInteractions(notifications);
    }

    @Test
    void reportOutsideTheWorkspaceIsNotFound() {
        assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, 99L, "APPROVED", null)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void anotherManagersWorkspaceIsNotFoundAndArchivedIsReadOnly() {
        assertThatThrownBy(() -> service.list(6L, "MANAGER", WS, null, null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.decide(6L, "MANAGER", WS, REPORT, "APPROVED", null)).isInstanceOf(NotFoundException.class);

        when(workspaceRepo.find(WS)).thenReturn(workspace("ARCHIVED"));
        assertThatThrownBy(() -> service.decide(MANAGER, "MANAGER", WS, REPORT, "APPROVED", null)).hasMessageContaining("lưu trữ");
        service.list(MANAGER, "MANAGER", WS, null, null);
        verify(reports).list(WS, null, null);
    }

    @Test
    void listValidatesAndPassesFilters() {
        service.list(1L, "ADMIN", WS, "SUBMITTED", 2L);
        verify(reports).list(WS, "SUBMITTED", 2L);
        assertThatThrownBy(() -> service.list(MANAGER, "MANAGER", WS, "DRAFT", null)).hasMessageContaining("Trạng thái");
    }
}
