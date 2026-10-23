package com.vehicsim.service;

import com.vehicsim.repository.NotificationRepository;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Thông báo (M10): không tự báo cho người làm; tiêu đề dài bị cắt vừa cột; chỉ đọc / đánh dấu được thông báo của mình; giới hạn số dòng. */
class NotificationServiceTest {

    private NotificationRepository repo;
    private NotificationService service;

    @BeforeEach
    void setUp() {
        repo = mock(NotificationRepository.class);
        service = new NotificationService(repo);
    }

    @Test
    void writesForTheRecipientButNeverForTheActorThemselves() {
        service.notify(20L, 5L, 10L, "TASK_ASSIGNED", "Bạn được giao task", "nội dung", "TASK", 7L);
        verify(repo).insert(20L, 10L, "TASK_ASSIGNED", "Bạn được giao task", "nội dung", "TASK", 7L);

        service.notify(5L, 5L, 10L, "TASK_ASSIGNED", "x", "y", "TASK", 7L);
        verify(repo, never()).insert(eq(5L), any(), anyString(), anyString(), anyString(), any(), any());
    }

    @Test
    void longTitlesAreCutToTheColumnSize() {
        service.notify(20L, 5L, null, "SYSTEM", "x".repeat(400), "y", null, null);
        verify(repo).insert(eq(20L), any(), eq("SYSTEM"), argThat(t -> t.length() == 255 && t.endsWith("…")), eq("y"), any(), any());
    }

    @Test
    void listReturnsItemsWithTheTotalUnreadCountAndBoundsTheLimit() {
        when(repo.list(20L, true, 20)).thenReturn(List.of());
        when(repo.unreadCount(20L)).thenReturn(3);

        assertThat(service.list(20L, true, null).unreadCount()).isEqualTo(3);
        verify(repo).list(20L, true, NotificationService.DEFAULT_LIMIT);
        assertThatThrownBy(() -> service.list(20L, false, 0)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.list(20L, false, 101)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void markingSomeoneElsesNotificationIsNotFound() {
        when(repo.markRead(20L, 99L)).thenReturn(false);
        assertThatThrownBy(() -> service.markRead(20L, 99L)).isInstanceOf(NotFoundException.class);

        when(repo.markRead(20L, 1L)).thenReturn(true);
        when(repo.unreadCount(20L)).thenReturn(2);
        assertThat(service.markRead(20L, 1L)).isEqualTo(2);
    }

    @Test
    void markAllReadReturnsTheRemainingUnreadCount() {
        when(repo.unreadCount(anyLong())).thenReturn(0);
        assertThat(service.markAllRead(20L)).isZero();
        verify(repo).markAllRead(20L);
    }
}
