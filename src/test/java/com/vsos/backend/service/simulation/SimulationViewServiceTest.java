package com.vsos.backend.service.simulation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;

/** Gói .zip OpenSCENARIO của một họ kịch bản: mỗi run baseline một file, không đụng run của regression/tối ưu. */
class SimulationViewServiceTest {
    private Db db;
    private RunService runs;
    private SimulationViewService views;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        runs = mock(RunService.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", 1L)));
        views = spy(new SimulationViewService(db, mock(Queries.class), runs, projects));
    }

    @Test
    void zipHoldsOneXoscPerBaselineRunNamedLikeTheSingleDownload() throws Exception {
        when(db.first(anyString(), any(Object[].class))).thenReturn(new Row(Json.obj("id", 3L)));
        when(db.list(anyString(), any(Object[].class))).thenReturn(List.of(new Row(Json.obj("id", 41L)), new Row(Json.obj("id", 42L))));
        doReturn(Map.of("run", 41)).when(views).runVariantBundle(41L);
        doReturn(Map.of("run", 42)).when(views).runVariantBundle(42L);
        when(runs.exportXosc(Map.of("run", 41))).thenReturn("<xosc run=\"41\"/>");
        when(runs.exportXosc(Map.of("run", 42))).thenReturn("<xosc run=\"42\"/>");

        Map<String, String> files = new java.util.LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(views.familyXoscZip(3)))) {
            for (ZipEntry e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) {
                files.put(e.getName(), new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
        }

        assertThat(new ArrayList<>(files.keySet())).containsExactly("vehicsim-run-41.xosc", "vehicsim-run-42.xosc");
        assertThat(files.get("vehicsim-run-42.xosc")).isEqualTo("<xosc run=\"42\"/>");
        verify(db).list(argThat((String sql) -> sql.contains("scenario_id = ?") && sql.contains("regression_test_id IS NULL")
                && sql.contains("optimization_trial_id IS NULL") && sql.contains("ORDER BY id")), eq(1L), eq(3L));
    }

    @Test
    void familyOfAnotherProjectIsNotFound() {
        when(db.first(anyString(), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> views.familyXoscZip(3)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void familyWithoutRunsIsRejectedInsteadOfDownloadingAnEmptyZip() {
        when(db.first(anyString(), any(Object[].class))).thenReturn(new Row(Json.obj("id", 3L)));
        when(db.list(anyString(), any(Object[].class))).thenReturn(List.of());
        assertThatThrownBy(() -> views.familyXoscZip(3)).isInstanceOf(Vs.InvalidRequestException.class).hasMessageContaining("no runs");
    }
}
