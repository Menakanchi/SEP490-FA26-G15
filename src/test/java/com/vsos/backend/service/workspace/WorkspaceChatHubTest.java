package com.vsos.backend.service.workspace;

import com.vsos.backend.dto.workspace.WorkspaceDtos.ChatMessage;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UserRef;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Hub chat realtime: tin chỉ tới kênh của đúng workspace và chỉ sau khi commit; kênh đứt tự gỡ; mỗi tài khoản giới hạn số kênh;
 * bớt thành viên / khoá tài khoản đóng kênh của đúng người đó. Emitter giả ghi lại sự kiện thay cho kết nối HTTP thật.
 */
class WorkspaceChatHubTest {

    /** Emitter ghi lại từng sự kiện dạng text SSE thay vì ghi ra response. */
    static class Recording extends SseEmitter {
        final List<String> events = new CopyOnWriteArrayList<>();
        volatile boolean broken;
        volatile boolean completed;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            if (broken) {
                throw new IOException("client đã đóng tab");
            }
            StringBuilder text = new StringBuilder();
            builder.build().forEach(part -> text.append(part.getData()));
            events.add(text.toString());
        }

        @Override
        public void complete() {
            completed = true;
        }
    }

    private final List<Recording> created = new ArrayList<>();
    private WorkspaceChatHub hub;

    @BeforeEach
    void setUp() {
        hub = new WorkspaceChatHub(() -> {
            Recording r = new Recording();
            created.add(r);
            return r;
        }, false);
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static ChatMessage message(long id, long workspaceId) {
        return new ChatMessage(id, workspaceId, new UserRef(5L, "Quản Lý", "m@example.com"), "Chạy lại họ PX2", LocalDateTime.now(), null);
    }

    private Recording open(long workspaceId, long userId) {
        hub.subscribe(workspaceId, userId);
        return created.get(created.size() - 1);
    }

    @Test
    void aNewStreamGetsReadyAndOnlyMessagesOfItsOwnWorkspace() {
        Recording engineer = open(10L, 20L);
        Recording manager = open(10L, 5L);
        Recording outsider = open(11L, 30L);
        assertThat(engineer.events).singleElement().asString().contains("event:ready");

        hub.publish(message(7L, 10L));

        assertThat(engineer.events).hasSize(2).last().asString().contains("event:message").contains("id:7");
        assertThat(manager.events).hasSize(2);
        assertThat(outsider.events).hasSize(1);
    }

    @Test
    void messagesInsideATransactionAreSentOnlyAfterCommit() {
        Recording engineer = open(10L, 20L);
        TransactionSynchronizationManager.initSynchronization();

        hub.publish(message(8L, 10L));
        assertThat(engineer.events).hasSize(1);

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        assertThat(engineer.events).hasSize(2).last().asString().contains("id:8");
    }

    @Test
    void aBrokenStreamIsDroppedAndDoesNotBlockOthers() {
        Recording gone = open(10L, 20L);
        Recording alive = open(10L, 21L);
        gone.broken = true;

        hub.publish(message(9L, 10L));

        assertThat(gone.completed).isTrue();
        assertThat(alive.events).hasSize(2);
        assertThat(hub.openStreams(10L)).isEqualTo(1);
    }

    @Test
    void oneAccountCannotOpenUnlimitedStreams() {
        for (int i = 0; i < WorkspaceChatHub.MAX_STREAMS_PER_USER; i++) {
            open(10L + i % 2, 20L);
        }
        assertThatThrownBy(() -> hub.subscribe(10L, 20L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        open(10L, 21L);
    }

    @Test
    void removingAMemberOrLockingAnAccountClosesOnlyTheirStreams() {
        Recording removed = open(10L, 20L);
        Recording sameUserOtherWorkspace = open(11L, 20L);
        Recording colleague = open(10L, 21L);

        hub.disconnect(10L, 20L);
        assertThat(removed.completed).isTrue();
        assertThat(sameUserOtherWorkspace.completed).isFalse();
        assertThat(colleague.completed).isFalse();

        hub.publish(message(10L, 10L));
        assertThat(removed.events).hasSize(1);

        hub.disconnectUser(20L);
        assertThat(sameUserOtherWorkspace.completed).isTrue();
        assertThat(colleague.completed).isFalse();
    }

    @Test
    void heartbeatKeepsEveryStreamAlive() {
        Recording a = open(10L, 20L);
        Recording b = open(11L, 21L);
        hub.ping();
        assertThat(a.events).last().asString().contains(":ping");
        assertThat(b.events).last().asString().contains(":ping");
    }
}
