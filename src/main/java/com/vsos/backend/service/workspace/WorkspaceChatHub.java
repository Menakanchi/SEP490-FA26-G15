package com.vsos.backend.service.workspace;

import com.vsos.backend.dto.workspace.WorkspaceDtos.ChatMessage;
import jakarta.annotation.PreDestroy;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import java.util.function.Supplier;

/**
 * Chat workspace realtime (FE-03) qua Server-Sent Events: mỗi tab đang mở kênh giữ một {@link SseEmitter}; tin vừa lưu được đẩy
 * tới mọi kênh của cùng workspace <b>sau khi transaction commit</b> (rollback thì không ai thấy tin).
 * <p>
 * Quyền không kiểm ở đây: {@link WorkspaceService#openChatStream} chỉ gọi {@link #subscribe} sau khi kiểm Manager / thành viên.
 * Kênh tự đóng sau {@link #STREAM_TTL_MS} để client nối lại — mỗi lần nối lại là một lần kiểm token và membership mới; bớt thành
 * viên, đổi Manager hay khoá tài khoản thì đóng kênh ngay ({@link #disconnect}, {@link #disconnectUser}).
 * <p>
 * Giới hạn: hub nằm trong bộ nhớ một tiến trình backend. Chạy nhiều instance phải chuyển sang pub/sub (vd. Redis) — chưa làm.
 */
@Component
public class WorkspaceChatHub {

    /** Thời gian sống tối đa của một kênh trước khi client phải nối lại (kiểm lại quyền). */
    static final long STREAM_TTL_MS = 10 * 60_000L;
    /** Comment giữ kết nối để proxy không cắt và phát hiện kết nối chết. */
    static final long HEARTBEAT_SECONDS = 25;
    /** Số kênh mở cùng lúc tối đa của một tài khoản (mọi workspace, mọi tab). */
    static final int MAX_STREAMS_PER_USER = 5;

    private record Stream(long workspaceId, long userId, SseEmitter emitter) {
    }

    private final Set<Stream> streams = ConcurrentHashMap.newKeySet();
    private final Supplier<SseEmitter> emitters;
    private final ScheduledExecutorService heartbeat;

    public WorkspaceChatHub() {
        this(() -> new SseEmitter(STREAM_TTL_MS), true);
    }

    /** Cho test: tự tạo emitter và tắt heartbeat nền. */
    WorkspaceChatHub(Supplier<SseEmitter> emitters, boolean runHeartbeat) {
        this.emitters = emitters;
        if (runHeartbeat) {
            this.heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "workspace-chat-heartbeat");
                t.setDaemon(true);
                return t;
            });
            heartbeat.scheduleAtFixedRate(this::ping, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
        } else {
            this.heartbeat = null;
        }
    }

    /** Mở kênh cho người đã được kiểm quyền; gửi ngay sự kiện {@code ready} để client biết đã nối và bắt kịp tin bị lỡ. */
    public SseEmitter subscribe(long workspaceId, long userId) {
        Stream stream;
        synchronized (this) {
            if (streams.stream().filter(s -> s.userId() == userId).count() >= MAX_STREAMS_PER_USER) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Đang mở quá nhiều kênh chat, đóng bớt tab rồi thử lại");
            }
            stream = new Stream(workspaceId, userId, emitters.get());
            streams.add(stream);
        }
        Stream s = stream;
        s.emitter().onCompletion(() -> streams.remove(s));
        s.emitter().onTimeout(() -> close(s));
        s.emitter().onError(e -> streams.remove(s));
        send(s, SseEmitter.event().name("ready").data("ok"));
        return s.emitter();
    }

    /** Đẩy tin tới mọi kênh của workspace sau khi transaction hiện tại commit (không có transaction thì đẩy ngay). */
    public void publish(ChatMessage message) {
        afterCommit(() -> each(s -> s.workspaceId() == message.workspaceId(), s -> send(s, SseEmitter.event()
                .id(String.valueOf(message.id()))
                .name("message")
                .data(message, MediaType.APPLICATION_JSON))));
    }

    /** Đóng kênh của một người trong một workspace (bị bớt khỏi workspace, không còn là Manager). */
    public void disconnect(long workspaceId, long userId) {
        afterCommit(() -> each(s -> s.workspaceId() == workspaceId && s.userId() == userId, this::close));
    }

    /** Đóng mọi kênh của một tài khoản (bị khoá, đổi role). */
    public void disconnectUser(long userId) {
        afterCommit(() -> each(s -> s.userId() == userId, this::close));
    }

    /** Số kênh đang mở của workspace (để test / quan sát). */
    int openStreams(long workspaceId) {
        return (int) streams.stream().filter(s -> s.workspaceId() == workspaceId).count();
    }

    void ping() {
        each(s -> true, s -> send(s, SseEmitter.event().comment("ping")));
    }

    @PreDestroy
    void shutdown() {
        if (heartbeat != null) {
            heartbeat.shutdownNow();
        }
        each(s -> true, this::close);
    }

    private void each(Predicate<Stream> match, java.util.function.Consumer<Stream> action) {
        // Chụp danh sách trước: action có thể gỡ kênh khỏi tập.
        List<Stream> targets = streams.stream().filter(match).toList();
        targets.forEach(action);
    }

    /** Gửi một sự kiện; kênh đã đứt (tab đóng, mạng rớt) thì gỡ và đóng. Builder không dùng lại được giữa các kênh. */
    private void send(Stream s, SseEventBuilder event) {
        try {
            s.emitter().send(event);
        } catch (Exception e) {
            close(s);
        }
    }

    private void close(Stream s) {
        streams.remove(s);
        try {
            s.emitter().complete();
        } catch (Exception ignored) {
            // Kênh đã đóng phía client.
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
