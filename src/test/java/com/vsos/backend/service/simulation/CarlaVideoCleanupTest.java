package com.vsos.backend.service.simulation;

import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.analysis.FailureAnalysisService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CarlaVideoCleanupTest {
    @TempDir Path directory;
    private RunService runs;
    private CarlaVideoStorage storage;
    private TransactionTemplate tx;
    private Path video;

    @BeforeEach
    void setUp() throws Exception {
        var props = mock(VehicSimProperties.class);
        when(props.dataRoot()).thenReturn(directory.toString());
        tx = new TransactionTemplate(new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        });
        runs = new RunService(mock(Db.class), mock(Queries.class), props, mock(TaskExecutor.class),
                mock(ApplicationEventPublisher.class), tx, mock(FamilyService.class), mock(FailureAnalysisService.class));
        storage = mock(CarlaVideoStorage.class);
        runs.setVideoStorage(storage);
        video = directory.resolve("runs/42/video.mp4");
        Files.createDirectories(video.getParent());
        Files.write(video, new byte[]{1, 2, 3});
        Files.writeString(video.resolveSibling("result.json"), "keep");
    }

    @Test
    void uploadedVideoIsDeletedOnlyAfterCommitAndOtherArtifactsRemain() {
        String remote = "s3://private/runs/42/video.mp4";
        when(storage.matches(42, remote)).thenReturn(true);
        tx.executeWithoutResult(status -> {
            runs.removeUploadedVideoAfterCommit(42, Map.of("artifacts", Map.of("video", remote)));
            assertThat(video).exists();
        });
        assertThat(video).doesNotExist();
        assertThat(video.resolveSibling("result.json")).exists();
    }

    @Test
    void rollbackAndUnverifiedOrLocalLocationsKeepVideo() {
        String remote = "s3://private/runs/42/video.mp4";
        when(storage.matches(42, remote)).thenReturn(true);
        tx.executeWithoutResult(status -> {
            runs.removeUploadedVideoAfterCommit(42, Map.of("artifacts", Map.of("video", remote)));
            status.setRollbackOnly();
        });
        assertThat(video).exists();
        tx.executeWithoutResult(status -> runs.removeUploadedVideoAfterCommit(42, Map.of("artifacts", Map.of("video", video.toString()))));
        tx.executeWithoutResult(status -> runs.removeUploadedVideoAfterCommit(42, Map.of("artifacts", Map.of("video", "s3://other/runs/42/video.mp4"))));
        runs.removeUploadedVideoAfterCommit(42, Map.of("artifacts", Map.of("video", remote)));
        assertThat(video).exists();
    }
}
