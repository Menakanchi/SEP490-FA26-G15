package com.vsos.backend.service.project;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Transactional outbox: delete only committed jobs and retain them until local cleanup succeeds. */
@Slf4j
@Service
public class ProjectLocalCleanup {
    private static final String MARKER = ".vsos-storage-id";
    private final Db db;
    private final RunService runs;
    private final TransactionTemplate transaction;
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "vs-project-cleanup");
        thread.setDaemon(true);
        return thread;
    });

    public ProjectLocalCleanup(Db db, RunService runs, PlatformTransactionManager manager) {
        this.db = db;
        this.runs = runs;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Never create a marker here: a missing mount must not be mistaken for an empty data root. */
    public String storageIdForWrite() {
        try {
            return currentStorageId();
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private String currentStorageId() throws IOException {
        return readStorageId(runs.runDir(0).getParent().getParent().resolve(MARKER));
    }

    private static String readStorageId(Path marker) throws IOException {
        if (!Files.isRegularFile(marker, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Thiếu marker data root");
        String id = Files.readString(marker).strip();
        if (!UUID.fromString(id).toString().equals(id)) throw new IOException("Marker data root không hợp lệ");
        return id;
    }

    /** true means already cleaned or no longer queued; false leaves the job for retry. */
    public boolean clean(long runId, String storageId) {
        try {
            if (!storageId.equals(currentStorageId())) return false;
            return Boolean.TRUE.equals(transaction.execute(status -> {
                Row binding = db.first("SELECT storage_id FROM project_local_storage WHERE id = 1 FOR SHARE");
                if (binding == null || !storageId.equals(binding.str("storage_id"))) return false;
                Row task = db.first("SELECT run_id FROM project_local_cleanup WHERE run_id = ? AND storage_id = ? FOR UPDATE", runId, storageId);
                if (task == null) return true;
                // Lock the missing PK range too: a live/reintroduced run must never lose its files.
                if (db.first("SELECT id FROM simulation_runs WHERE id = ? FOR UPDATE", runId) != null) {
                    log.warn("Không dọn run {}: ID vẫn tồn tại trong database", runId);
                    return false;
                }
                try {
                    FileSystemUtils.deleteRecursively(runs.runDir(runId));
                    // A missing or replaced mount must not acknowledge work for another root.
                    if (!storageId.equals(currentStorageId())) return false;
                } catch (IOException | RuntimeException e) {
                    log.warn("Không dọn được thư mục run {}; sẽ thử lại", runId, e);
                    return false;
                }
                db.update("DELETE FROM project_local_cleanup WHERE run_id = ? AND storage_id = ?", runId, storageId);
                return true;
            }));
        } catch (IOException | RuntimeException e) {
            log.warn("Chưa xác nhận dọn run {}; sẽ thử lại", runId, e);
            return false;
        }
    }

    public void retryPending() {
        try {
            if (db.first("SELECT run_id FROM project_local_cleanup LIMIT 1") == null) return;
            String id = currentStorageId(); // Never create a new identity when looking for old jobs.
            Row binding = db.first("SELECT storage_id FROM project_local_storage WHERE id = 1");
            if (binding == null || !id.equals(binding.str("storage_id"))) {
                log.warn("Chưa thể thử lại dọn file project: marker không khớp binding database");
                return;
            }
            long after = 0;
            while (true) {
                List<Row> batch = db.list("SELECT run_id FROM project_local_cleanup WHERE storage_id = ? AND run_id > ? ORDER BY run_id LIMIT 100", id, after);
                if (batch.isEmpty()) return;
                for (Row row : batch) {
                    after = row.lng("run_id");
                    clean(after, id);
                }
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Chưa thể thử lại dọn file project: {}", e.getMessage());
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        executor.scheduleWithFixedDelay(this::retryPending, 0, 30, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void stop() {
        executor.shutdown();
    }
}
