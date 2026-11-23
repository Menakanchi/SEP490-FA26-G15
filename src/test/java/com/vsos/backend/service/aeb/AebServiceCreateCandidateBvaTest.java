package com.vsos.backend.service.aeb;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test sheet "CreateCandidate" of Report5.1_Unit-Test: one test per UTCID column of {@link AebService#createCandidate}
 * (FE-10 Add AEB Configuration), designed with Equivalence Partitioning and Boundary Value Analysis.
 *
 * <ul>
 *   <li>Each changed parameter must lie in [min_value, max_value] of {@code aeb_parameters} (seed of 01_schema.sql):
 *       TTC_THRESHOLD [0.50, 4.00] s, BRAKE_ACTIVATION_DELAY [0.00, 0.50] s, MAX_DECELERATION [3.00, 10.00] m/s2,
 *       BRAKE_BUILDUP_RATE [5.00, 20.00] m/s3. Boundaries min-0.01, min, max, max+0.01 (and min+0.01 / max-0.01).</li>
 *   <li>The parent version must belong to the project; unknown codes are rejected (sorted list); the merged set must differ
 *       from the parent in at least one value.</li>
 *   <li>label / notes / source are stripped; blank label becomes "v&lt;n&gt;", blank notes null, blank source MANUAL,
 *       source is upper-cased. version_no = MAX(version_no) + 1 (1 for the first version).</li>
 *   <li>UTCID33 and UTCID34 cover the defects DEF-AEB-01 (null value threw NullPointerException) and DEF-AEB-02 (NaN was stored); both are
 *       fixed since 23/11/2026 and the cases now expect InvalidRequestException.</li>
 * </ul>
 */
class AebServiceCreateCandidateBvaTest {

    private static final long PROJECT = 1L;
    private static final long OTHER_PROJECT = 2L;
    private static final long USER = 5L;
    private static final long PARENT = 10L;
    private static final long MISSING_PARENT = 99L;
    private static final long NEW_VERSION = 42L;

    private static final String TTC = "TTC_THRESHOLD";
    private static final String DELAY = "BRAKE_ACTIVATION_DELAY";
    private static final String DECEL = "MAX_DECELERATION";
    private static final String BUILDUP = "BRAKE_BUILDUP_RATE";

    private static final String MUST_DIFFER = "ứng viên phải khác version cha ít nhất một tham số";

    private Db db;
    private AebService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        Queries queries = mock(Queries.class);
        service = new AebService(db, queries);
        when(db.first(startsWith("SELECT * FROM aeb_versions"), eq(PARENT), eq(PROJECT)))
                .thenReturn(new Row(Json.obj("id", PARENT, "project_id", PROJECT, "version_no", 3L, "status", "BASELINE")));
        when(db.list("SELECT * FROM aeb_parameters")).thenReturn(List.of(
                param(1L, TTC, 0.50, 4.00, "s"),
                param(2L, DELAY, 0.00, 0.50, "s"),
                param(3L, DECEL, 3.00, 10.00, "m/s2"),
                param(4L, BUILDUP, 5.00, 20.00, "m/s3")));
        Map<String, Double> parentValues = new LinkedHashMap<>();
        parentValues.put(TTC, 1.5);
        parentValues.put(DELAY, 0.15);
        parentValues.put(DECEL, 8.0);
        parentValues.put(BUILDUP, 20.0);
        when(queries.aebValues(PARENT)).thenReturn(parentValues);
        when(db.scalar(startsWith("SELECT MAX(version_no)"), eq(PROJECT))).thenReturn(3L);
        when(db.insert(startsWith("INSERT INTO aeb_versions"), any(Object[].class))).thenReturn(NEW_VERSION);
    }

    // ------------------------------------------------------------------ normal

    @Test
    @DisplayName("UTCID01 N: one changed value inside the range creates candidate v4 with the other values copied")
    void utcid01() {
        assertThat(create(Map.of(TTC, 2.0), "TTC 2.0", "thử ngưỡng mới")).isEqualTo(NEW_VERSION);
        assertVersionRow(4L, "TTC 2.0", "MANUAL", "thử ngưỡng mới");
        assertValues(2.0, 0.15, 8.0, 20.0);
    }

    @Test
    @DisplayName("UTCID02 N: several changed values are all stored, untouched ones come from the parent")
    void utcid02() {
        create(Map.of(TTC, 1.2, DECEL, 9.0), "two params", null);
        assertValues(1.2, 0.15, 9.0, 20.0);
    }

    @Test
    @DisplayName("UTCID03 N: null label becomes v4 and null notes stay null")
    void utcid03() {
        create(Map.of(TTC, 2.0), null, null);
        assertVersionRow(4L, "v4", "MANUAL", null);
    }

    @Test
    @DisplayName("UTCID04 N: label and notes are stripped")
    void utcid04() {
        create(Map.of(TTC, 2.0), "  Ứng viên A  ", "  ghi chú  ");
        assertVersionRow(4L, "Ứng viên A", "MANUAL", "ghi chú");
    }

    @Test
    @DisplayName("UTCID05 N: blank label becomes v4 and blank notes become null")
    void utcid05() {
        create(Map.of(TTC, 2.0), "   ", "   ");
        assertVersionRow(4L, "v4", "MANUAL", null);
    }

    @Test
    @DisplayName("UTCID06 N: source is stripped and upper-cased")
    void utcid06() {
        service.createCandidate(PROJECT, USER, PARENT, Map.of(TTC, 2.0), "opt", null, "  optimization ");
        assertVersionRow(4L, "opt", "OPTIMIZATION", null);
    }

    @Test
    @DisplayName("UTCID07 N: blank source falls back to MANUAL")
    void utcid07() {
        service.createCandidate(PROJECT, USER, PARENT, Map.of(TTC, 2.0), "x", null, "   ");
        assertVersionRow(4L, "x", "MANUAL", null);
    }

    @Test
    @DisplayName("UTCID08 N: first version of the project (MAX(version_no) is null) gets version_no 1 and label v1")
    void utcid08() {
        when(db.scalar(startsWith("SELECT MAX(version_no)"), eq(PROJECT))).thenReturn(null);
        create(Map.of(TTC, 2.0), null, null);
        assertVersionRow(1L, "v1", "MANUAL", null);
    }

    // ------------------------------------------------------------------ boundary

    @Test
    @DisplayName("UTCID09 B: TTC_THRESHOLD = 0.50 (min) is accepted")
    void utcid09() {
        create(Map.of(TTC, 0.50), null, null);
        assertValues(0.50, 0.15, 8.0, 20.0);
    }

    @Test
    @DisplayName("UTCID10 B: TTC_THRESHOLD = 0.49 (min - 0.01) is rejected")
    void utcid10() {
        assertRejected(Map.of(TTC, 0.49), "TTC_THRESHOLD = 0.49 ngoài khoảng [0.5, 4.0] s");
    }

    @Test
    @DisplayName("UTCID11 B: TTC_THRESHOLD = 4.00 (max) is accepted")
    void utcid11() {
        create(Map.of(TTC, 4.00), null, null);
        assertValues(4.00, 0.15, 8.0, 20.0);
    }

    @Test
    @DisplayName("UTCID12 B: TTC_THRESHOLD = 4.01 (max + 0.01) is rejected")
    void utcid12() {
        assertRejected(Map.of(TTC, 4.01), "TTC_THRESHOLD = 4.01 ngoài khoảng [0.5, 4.0] s");
    }

    @Test
    @DisplayName("UTCID13 B: BRAKE_ACTIVATION_DELAY = 0.00 (min) is accepted")
    void utcid13() {
        create(Map.of(DELAY, 0.00), null, null);
        assertValues(1.5, 0.00, 8.0, 20.0);
    }

    @Test
    @DisplayName("UTCID14 B: BRAKE_ACTIVATION_DELAY = -0.01 (min - 0.01) is rejected")
    void utcid14() {
        assertRejected(Map.of(DELAY, -0.01), "BRAKE_ACTIVATION_DELAY = -0.01 ngoài khoảng [0.0, 0.5] s");
    }

    @Test
    @DisplayName("UTCID15 B: BRAKE_ACTIVATION_DELAY = 0.50 (max) is accepted")
    void utcid15() {
        create(Map.of(DELAY, 0.50), null, null);
        assertValues(1.5, 0.50, 8.0, 20.0);
    }

    @Test
    @DisplayName("UTCID16 B: BRAKE_ACTIVATION_DELAY = 0.51 (max + 0.01) is rejected")
    void utcid16() {
        assertRejected(Map.of(DELAY, 0.51), "BRAKE_ACTIVATION_DELAY = 0.51 ngoài khoảng [0.0, 0.5] s");
    }

    @Test
    @DisplayName("UTCID17 B: MAX_DECELERATION = 3.00 (min) is accepted")
    void utcid17() {
        create(Map.of(DECEL, 3.00), null, null);
        assertValues(1.5, 0.15, 3.00, 20.0);
    }

    @Test
    @DisplayName("UTCID18 B: MAX_DECELERATION = 2.99 (min - 0.01) is rejected")
    void utcid18() {
        assertRejected(Map.of(DECEL, 2.99), "MAX_DECELERATION = 2.99 ngoài khoảng [3.0, 10.0] m/s2");
    }

    @Test
    @DisplayName("UTCID19 B: MAX_DECELERATION = 10.00 (max) is accepted")
    void utcid19() {
        create(Map.of(DECEL, 10.00), null, null);
        assertValues(1.5, 0.15, 10.00, 20.0);
    }

    @Test
    @DisplayName("UTCID20 B: MAX_DECELERATION = 10.01 (max + 0.01) is rejected")
    void utcid20() {
        assertRejected(Map.of(DECEL, 10.01), "MAX_DECELERATION = 10.01 ngoài khoảng [3.0, 10.0] m/s2");
    }

    @Test
    @DisplayName("UTCID21 B: BRAKE_BUILDUP_RATE = 5.00 (min) is accepted")
    void utcid21() {
        create(Map.of(BUILDUP, 5.00), null, null);
        assertValues(1.5, 0.15, 8.0, 5.00);
    }

    @Test
    @DisplayName("UTCID22 B: BRAKE_BUILDUP_RATE = 4.99 (min - 0.01) is rejected")
    void utcid22() {
        assertRejected(Map.of(BUILDUP, 4.99), "BRAKE_BUILDUP_RATE = 4.99 ngoài khoảng [5.0, 20.0] m/s3");
    }

    @Test
    @DisplayName("UTCID23 B: BRAKE_BUILDUP_RATE = 20.01 (max + 0.01) is rejected")
    void utcid23() {
        assertRejected(Map.of(BUILDUP, 20.01), "BRAKE_BUILDUP_RATE = 20.01 ngoài khoảng [5.0, 20.0] m/s3");
    }

    @Test
    @DisplayName("UTCID24 B: BRAKE_BUILDUP_RATE = 19.99 (max - 0.01) is accepted")
    void utcid24() {
        create(Map.of(BUILDUP, 19.99), null, null);
        assertValues(1.5, 0.15, 8.0, 19.99);
    }

    // ------------------------------------------------------------------ abnormal

    @Test
    @DisplayName("UTCID25 A: parent version that does not exist is NotFound")
    void utcid25() {
        assertThatThrownBy(() -> service.createCandidate(PROJECT, USER, MISSING_PARENT, Map.of(TTC, 2.0), null, null))
                .isInstanceOf(NotFoundException.class).hasMessage("parent AEB version");
        assertNothingWritten();
    }

    @Test
    @DisplayName("UTCID26 A: parent version of another project is NotFound (no cross-project candidate)")
    void utcid26() {
        assertThatThrownBy(() -> service.createCandidate(OTHER_PROJECT, USER, PARENT, Map.of(TTC, 2.0), null, null))
                .isInstanceOf(NotFoundException.class).hasMessage("parent AEB version");
        assertNothingWritten();
    }

    @Test
    @DisplayName("UTCID27 A: unknown parameter code is rejected")
    void utcid27() {
        assertRejected(Map.of("JERK_LIMIT", 10.0), "tham số không tồn tại: [JERK_LIMIT]");
    }

    @Test
    @DisplayName("UTCID28 A: several unknown codes are listed sorted, even next to a valid value")
    void utcid28() {
        Map<String, Double> values = new LinkedHashMap<>();
        values.put("ZETA", 1.0);
        values.put(TTC, 2.0);
        values.put("ALPHA", 1.0);
        assertRejected(values, "tham số không tồn tại: [ALPHA, ZETA]");
    }

    @Test
    @DisplayName("UTCID29 A: value equal to the parent's is rejected (candidate must differ)")
    void utcid29() {
        assertRejected(Map.of(TTC, 1.5), MUST_DIFFER);
    }

    @Test
    @DisplayName("UTCID30 A: BRAKE_BUILDUP_RATE = 20.00 (max, equal to the parent) passes the range check but is rejected as unchanged")
    void utcid30() {
        assertRejected(Map.of(BUILDUP, 20.00), MUST_DIFFER);
    }

    @Test
    @DisplayName("UTCID31 A: empty values map is rejected as unchanged")
    void utcid31() {
        assertRejected(Map.of(), MUST_DIFFER);
    }

    @Test
    @DisplayName("UTCID32 A: one valid and one out-of-range value reject the whole candidate")
    void utcid32() {
        Map<String, Double> values = new LinkedHashMap<>();
        values.put(TTC, 2.0);
        values.put(DELAY, 0.6);
        assertRejected(values, "BRAKE_ACTIVATION_DELAY = 0.6 ngoài khoảng [0.0, 0.5] s");
    }

    @Test
    @DisplayName("UTCID33 A: null value is rejected with InvalidRequestException (DEF-AEB-01 fixed)")
    void utcid33() {
        Map<String, Double> values = new HashMap<>();
        values.put(TTC, null);
        assertRejected(values, "TTC_THRESHOLD thiếu giá trị");
    }

    @Test
    @DisplayName("UTCID34 A: NaN is rejected with InvalidRequestException and nothing is stored (DEF-AEB-02 fixed)")
    void utcid34() {
        assertRejected(Map.of(TTC, Double.NaN), "TTC_THRESHOLD = NaN không phải là số");
    }

    @Test
    @DisplayName("UTCID35 A: +Infinity is rejected by the range check")
    void utcid35() {
        assertRejected(Map.of(DECEL, Double.POSITIVE_INFINITY), "MAX_DECELERATION = Infinity ngoài khoảng [3.0, 10.0] m/s2");
    }

    // ------------------------------------------------------------------ helpers

    private long create(Map<String, Double> values, String label, String notes) {
        return service.createCandidate(PROJECT, USER, PARENT, values, label, notes);
    }

    private void assertRejected(Map<String, Double> values, String message) {
        assertThatThrownBy(() -> create(values, null, null)).isInstanceOf(InvalidRequestException.class).hasMessage(message);
        assertNothingWritten();
    }

    private void assertNothingWritten() {
        verify(db, never()).insert(anyString(), any(Object[].class));
        verify(db, never()).batchInsert(anyString(), anyList());
    }

    /** INSERT INTO aeb_versions (project_id, version_no, label, source, status, parent_version_id, notes, created_by_user_id, created_date). */
    private void assertVersionRow(long versionNo, String label, String source, String notes) {
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(db).insert(startsWith("INSERT INTO aeb_versions"), args.capture());
        Object[] row = args.getValue();
        assertThat(row[0]).isEqualTo(PROJECT);
        assertThat(row[1]).isEqualTo(versionNo);
        assertThat(row[2]).isEqualTo(label);
        assertThat(row[3]).isEqualTo(source);
        assertThat(row[4]).isEqualTo("CANDIDATE");
        assertThat(row[5]).isEqualTo(PARENT);
        assertThat(row[6]).isEqualTo(notes);
        assertThat(row[7]).isEqualTo(USER);
    }

    /** Values stored for the new version, by parameter id 1..4 (TTC, delay, max decel, build-up). */
    @SuppressWarnings("unchecked")
    private void assertValues(double ttc, double delay, double decel, double buildup) {
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(db).batchInsert(startsWith("INSERT INTO aeb_parameter_values"), rows.capture());
        Map<Long, Double> stored = new HashMap<>();
        for (Object[] r : rows.getValue()) {
            assertThat(r[0]).isEqualTo(NEW_VERSION);
            stored.put((Long) r[1], (Double) r[2]);
        }
        assertThat(stored).hasSize(4);
        assertThat(stored.get(1L)).isEqualTo(ttc);
        assertThat(stored.get(2L)).isEqualTo(delay);
        assertThat(stored.get(3L)).isEqualTo(decel);
        assertThat(stored.get(4L)).isEqualTo(buildup);
    }

    private static Row param(long id, String code, double min, double max, String unit) {
        return new Row(Json.obj("id", id, "code", code, "min_value", min, "max_value", max, "unit", unit));
    }
}
