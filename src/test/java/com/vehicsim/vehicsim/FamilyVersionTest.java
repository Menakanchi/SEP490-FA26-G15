package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Sửa họ kịch bản = tạo bản gốc mới (task 4, Trung chốt 25/10/2026): không sửa đè bản cũ, bộ biến thể mới là con của bản gốc mới,
 * chặn khi họ còn run chưa xong hoặc không gian tham số không đổi.
 */
class FamilyVersionTest {

    private static final long PROJECT = 1L;
    private static final long SCENARIO = 8L;
    private static final String V1_SPACE = "{\"motif\":\"pedestrian_crossing\",\"parameter_space\":{\"ego_speed_kmh\":[40,60],"
            + "\"trigger_distance_m\":[20],\"pedestrian_speed_mps\":[1.5],\"stops_at_curb\":[false],\"weather\":[\"CLEAR\"],\"time_of_day\":[\"DAY\"]}}";

    private Db db;
    private FamilyService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        service = new FamilyService(db);
        when(db.first(startsWith("SELECT id, code FROM scenarios"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("id", SCENARIO, "code", "PX2")));
        when(db.scalar(startsWith("SELECT COUNT(*) FROM simulation_runs"), any(Object[].class))).thenReturn(0L);
        when(db.scalar(startsWith("SELECT MAX(id) FROM scenario_versions"), any(Object[].class))).thenReturn(7L);
        when(db.first(startsWith("SELECT scenario_ir_json FROM scenario_versions"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("scenario_ir_json", V1_SPACE)));
        when(db.scalar(startsWith("SELECT MAX(version_no)"), any(Object[].class))).thenReturn(3);
        when(db.insert(anyString(), any(Object[].class))).thenReturn(30L);
        when(db.list(startsWith("SELECT * FROM scenario_versions WHERE scenario_id = ? AND source != 'GENERATED'"), any(Object[].class)))
                .thenReturn(List.of(new Row(Json.obj("id", 7L)), new Row(Json.obj("id", 30L))));
    }

    private static FamilyService.FamilySpec spec(List<Double> speeds) {
        return new FamilyService.FamilySpec("x", "Mô tả mới", speeds, List.of(20.0), List.of(1.5), List.of(false), List.of("CLEAR"), List.of("DAY"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void newVersionAddsABaseAndAFreshVariantSetWithoutTouchingTheOldOne() {
        Map<String, Object> out = service.createVersion(PROJECT, SCENARIO, spec(List.of(40.0, 60.0, 80.0)), 5L);

        assertThat(out).containsEntry("scenario_id", SCENARIO).containsEntry("code", "PX2").containsEntry("base_version_id", 30L)
                .containsEntry("version", 2).containsEntry("variants", 3);
        // Bản gốc mới: version_no nối tiếp (3 + 1), source MANUAL.
        ArgumentCaptor<Object[]> baseArgs = ArgumentCaptor.forClass(Object[].class);
        verify(db).insert(startsWith("INSERT INTO scenario_versions (scenario_id, version_no, source, natural_language_input"), baseArgs.capture());
        assertThat(baseArgs.getValue()[0]).isEqualTo(SCENARIO);
        assertThat(baseArgs.getValue()[1]).isEqualTo(4);
        assertThat(baseArgs.getValue()[2]).isEqualTo("MANUAL");
        assertThat(baseArgs.getValue()[8]).as("map").isEqualTo("Town04");
        // Biến thể mới là con của bản gốc mới, version_no tiếp sau nó.
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(db).batchInsert(startsWith("INSERT INTO scenario_versions (scenario_id, version_no, source, parent_version_id"), rows.capture());
        assertThat(rows.getValue()).hasSize(3);
        assertThat(rows.getValue()).extracting(r -> r[1]).containsExactly(5, 6, 7);
        assertThat(rows.getValue()).extracting(r -> r[3]).containsOnly(30L);
        // Không có câu UPDATE / DELETE nào đụng vào scenario_versions cũ.
        verify(db, never()).update(startsWith("UPDATE scenario_versions"), any(Object[].class));
        verify(db, never()).update(startsWith("DELETE"), any(Object[].class));
    }

    @Test
    void familyWithUnfinishedRunsCannotBeEdited() {
        when(db.scalar(startsWith("SELECT COUNT(*) FROM simulation_runs"), any(Object[].class))).thenReturn(4L);
        assertThatThrownBy(() -> service.createVersion(PROJECT, SCENARIO, spec(List.of(40.0, 80.0)), 5L))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("PX2").hasMessageContaining("4 lượt chạy");
        verify(db, never()).batchInsert(anyString(), anyList());
    }

    @Test
    void unchangedParameterSpaceIsRefusedEvenWhenJsonReadsIntegers() {
        // V1_SPACE lưu 40 / 60 (số nguyên); spec gửi 40.0 / 60.0 — vẫn là cùng không gian.
        assertThatThrownBy(() -> service.createVersion(PROJECT, SCENARIO, spec(List.of(60.0, 40.0)), 5L))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("không đổi");
        verify(db, never()).batchInsert(anyString(), anyList());
    }

    @Test
    void invalidSpecAndUnknownFamilyAreRefusedBeforeWriting() {
        FamilyService.FamilySpec late = new FamilyService.FamilySpec("x", "", List.of(10.0), List.of(80.0), List.of(1.5), List.of(false),
                List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(() -> service.createVersion(PROJECT, SCENARIO, late, 5L)).hasMessageContaining("12 s");

        when(db.first(startsWith("SELECT id, code FROM scenarios"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> service.createVersion(PROJECT, SCENARIO, spec(List.of(40.0, 80.0)), 5L)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void sameSpaceComparesValuesNotNumberTypes() {
        assertThat(FamilyService.sameSpace(Map.of("a", List.of(40, 60)), Map.of("a", List.of(40.0, 60.0)))).isTrue();
        assertThat(FamilyService.sameSpace(Map.of("a", List.of(40, 60)), Map.of("a", List.of(40.0, 70.0)))).isFalse();
        assertThat(FamilyService.sameSpace(Map.of("w", List.of("CLEAR")), Map.of("w", List.of("RAIN")))).isFalse();
    }
}
