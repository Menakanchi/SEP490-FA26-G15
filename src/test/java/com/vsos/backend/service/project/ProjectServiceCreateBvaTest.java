package com.vsos.backend.service.project;

import com.vsos.backend.dto.project.ProjectDtos.ProjectItem;
import com.vsos.backend.dto.project.ProjectDtos.ProjectRequest;
import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test sheet "create" of docs/Report5.1_Unit-Test_VSOS.xlsx: one test per UTCID column, designed with
 * Equivalence Partitioning and Boundary Value Analysis (see sheet EP-BVA).
 *
 * <ul>
 *   <li>name, after strip(), in Unicode code points: valid 1..150 without an ISO control character and not used by the owner.
 *       Length boundaries 0, 1, 2, 149, 150, 151; control-character boundaries U+0000, U+001F | U+0020, U+007E | U+007F,
 *       U+009F | U+00A0.</li>
 *   <li>description, after strip(), in code points: null/blank is stored as null, 1..2000 is stored, more is rejected.
 *       Boundaries 0, 1, 1999, 2000, 2001.</li>
 *   <li>vehicleId: null takes the default vehicle, a supported id is kept, anything else is rejected.</li>
 *   <li>Checks run in the order name, description, vehicle; the first failure wins and nothing is inserted.</li>
 * </ul>
 */
class ProjectServiceCreateBvaTest {

    private static final long OWNER = 7L;
    private static final long PROJECT = 21L;
    private static final long DEFAULT_VEHICLE = 1L;
    private static final long OTHER_VEHICLE = 2L;
    private static final long UNKNOWN_VEHICLE = 99L;
    private static final String CAR = "🚗";

    private static final String NAME_REQUIRED = "Tên project không được để trống.";
    private static final String NAME_INVALID = "Tên project không được chứa ký tự điều khiển.";
    private static final String NAME_TOO_LONG_151 = "Tên project tối đa 150 ký tự (đang có 151).";
    private static final String DESCRIPTION_TOO_LONG_2001 = "Mô tả tối đa 2000 ký tự (đang có 2001).";

    private ProjectRepository projects;
    private ProjectService service;

    @BeforeEach
    void setUp() {
        projects = mock(ProjectRepository.class);
        RunService runs = mock(RunService.class);
        service = new ProjectService(projects, runs, mock(RegressionRepository.class));
        when(runs.configuredSimulator()).thenReturn("vehicsim-kinematic-1.0");
        when(projects.supportedVehicle(isNull())).thenReturn(DEFAULT_VEHICLE);
        when(projects.supportedVehicle(DEFAULT_VEHICLE)).thenReturn(DEFAULT_VEHICLE);
        when(projects.supportedVehicle(OTHER_VEHICLE)).thenReturn(OTHER_VEHICLE);
        when(projects.supportedVehicle(UNKNOWN_VEHICLE)).thenReturn(null); // a mocked Long would otherwise be 0
        when(projects.existingName(OWNER, "thử aeb", 0)).thenReturn("Thử AEB");
        when(projects.insert(anyString(), any(), anyLong(), anyLong(), any())).thenReturn(PROJECT);
        when(projects.find(PROJECT)).thenReturn(savedProject());
        when(projects.journeySummary(PROJECT)).thenReturn(emptyJourney());
    }

    // ------------------------------------------------------------------ name: presence

    @Test
    @DisplayName("UTCID01 N: normal name, description and default vehicle create the project")
    void utcid01() {
        assertCreated(new ProjectRequest("AEB test", "Pedestrian crossing study", null), "AEB test", "Pedestrian crossing study", DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID02 A: null name is rejected with NAME_REQUIRED")
    void utcid02() {
        assertRejected(new ProjectRequest(null, null, null), ProjectError.NAME_REQUIRED, NAME_REQUIRED);
    }

    @Test
    @DisplayName("UTCID03 B: name of spaces only, 0 characters after strip (min - 1), is rejected with NAME_REQUIRED")
    void utcid03() {
        assertRejected(new ProjectRequest("   ", null, null), ProjectError.NAME_REQUIRED, NAME_REQUIRED);
    }

    @Test
    @DisplayName("UTCID04 A: a no-break space is not removed by strip, so a name that looks blank is accepted")
    void utcid04() {
        assertCreated(new ProjectRequest(" ", null, null), " ", null, DEFAULT_VEHICLE);
    }

    // ------------------------------------------------------------------ name: length

    @Test
    @DisplayName("UTCID05 B: name of 1 character (min) is accepted")
    void utcid05() {
        assertCreated(new ProjectRequest("A", null, null), "A", null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID06 B: name of 2 characters (min + 1) is accepted")
    void utcid06() {
        assertCreated(new ProjectRequest("AB", null, null), "AB", null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID07 B: name of 149 characters (max - 1) is accepted")
    void utcid07() {
        String name = "N".repeat(149);
        assertCreated(new ProjectRequest(name, null, null), name, null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID08 B: name of 150 characters (max) is accepted")
    void utcid08() {
        String name = "N".repeat(ProjectService.NAME_MAX);
        assertCreated(new ProjectRequest(name, null, null), name, null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID09 B: name of 151 characters (max + 1) is rejected with NAME_TOO_LONG")
    void utcid09() {
        assertRejected(new ProjectRequest("N".repeat(151), null, null), ProjectError.NAME_TOO_LONG, NAME_TOO_LONG_151);
    }

    @Test
    @DisplayName("UTCID10 B: 154 characters with 2 spaces on each side are 150 after strip and accepted")
    void utcid10() {
        String name = "N".repeat(ProjectService.NAME_MAX);
        assertCreated(new ProjectRequest("  " + name + "  ", null, null), name, null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID11 B: 150 emoji (300 UTF-16 units) count as 150 characters and are accepted")
    void utcid11() {
        String name = CAR.repeat(ProjectService.NAME_MAX);
        assertThat(name.length()).isEqualTo(300);
        assertCreated(new ProjectRequest(name, null, null), name, null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID12 A: 51 decomposed (NFD) letters 'ử' are 153 code points and are rejected with NAME_TOO_LONG")
    void utcid12() {
        String name = Normalizer.normalize("ử", Normalizer.Form.NFD).repeat(51);
        assertRejected(new ProjectRequest(name, null, null), ProjectError.NAME_TOO_LONG, "Tên project tối đa 150 ký tự (đang có 153).");
    }

    // ------------------------------------------------------------------ name: control characters (U+0000..U+001F, U+007F..U+009F)

    @Test
    @DisplayName("UTCID13 B: U+0000, first control character, is rejected with NAME_INVALID")
    void utcid13() {
        assertRejected(new ProjectRequest("a\u0000b", null, null), ProjectError.NAME_INVALID, NAME_INVALID);
    }

    @Test
    @DisplayName("UTCID14 B: U+001F, last C0 control character, is rejected with NAME_INVALID")
    void utcid14() {
        assertRejected(new ProjectRequest("a\u001Fb", null, null), ProjectError.NAME_INVALID, NAME_INVALID);
    }

    @Test
    @DisplayName("UTCID15 B: U+0020, first character after C0, is accepted")
    void utcid15() {
        assertCreated(new ProjectRequest("a b", null, null), "a b", null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID16 B: U+007E, last character before DEL, is accepted")
    void utcid16() {
        assertCreated(new ProjectRequest("a~b", null, null), "a~b", null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID17 B: U+007F (DEL), first C1 range character, is rejected with NAME_INVALID")
    void utcid17() {
        assertRejected(new ProjectRequest("a\u007Fb", null, null), ProjectError.NAME_INVALID, NAME_INVALID);
    }

    @Test
    @DisplayName("UTCID18 B: U+009F, last C1 control character, is rejected with NAME_INVALID")
    void utcid18() {
        assertRejected(new ProjectRequest("a\u009Fb", null, null), ProjectError.NAME_INVALID, NAME_INVALID);
    }

    @Test
    @DisplayName("UTCID19 B: U+00A0, first character after C1, is accepted")
    void utcid19() {
        assertCreated(new ProjectRequest("a b", null, null), "a b", null, DEFAULT_VEHICLE);
    }

    // ------------------------------------------------------------------ name: duplicate

    @Test
    @DisplayName("UTCID20 A: name already used by the same owner is rejected with NAME_DUPLICATE")
    void utcid20() {
        assertRejected(new ProjectRequest("thử aeb", null, null), ProjectError.NAME_DUPLICATE, "Bạn đã có project tên “Thử AEB”. Hãy chọn tên khác.");
    }

    @Test
    @DisplayName("UTCID21 N: the duplicate check and the insert both use the stripped name")
    void utcid21() {
        assertCreated(new ProjectRequest("  AEB test  ", null, null), "AEB test", null, DEFAULT_VEHICLE);
        verify(projects).existingName(OWNER, "AEB test", 0L);
    }

    // ------------------------------------------------------------------ description

    @Test
    @DisplayName("UTCID22 N: blank description is stored as null")
    void utcid22() {
        assertCreated(new ProjectRequest("AEB test", "   ", null), "AEB test", null, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID23 B: description of 1 character (min of the stored range) is stored")
    void utcid23() {
        assertCreated(new ProjectRequest("AEB test", "d", null), "AEB test", "d", DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID24 B: description of 1999 characters (max - 1) is stored")
    void utcid24() {
        String description = "d".repeat(1999);
        assertCreated(new ProjectRequest("AEB test", description, null), "AEB test", description, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID25 B: description of 2000 characters (max) is stored")
    void utcid25() {
        String description = "d".repeat(ProjectService.DESCRIPTION_MAX);
        assertCreated(new ProjectRequest("AEB test", description, null), "AEB test", description, DEFAULT_VEHICLE);
    }

    @Test
    @DisplayName("UTCID26 B: description of 2001 characters (max + 1) is rejected with DESCRIPTION_TOO_LONG")
    void utcid26() {
        assertRejected(new ProjectRequest("AEB test", "d".repeat(2001), null), ProjectError.DESCRIPTION_TOO_LONG, DESCRIPTION_TOO_LONG_2001);
    }

    @Test
    @DisplayName("UTCID27 A: newline and tab inside the description are allowed and kept")
    void utcid27() {
        assertCreated(new ProjectRequest("AEB test", "Line 1\nLine 2\tend", null), "AEB test", "Line 1\nLine 2\tend", DEFAULT_VEHICLE);
    }

    // ------------------------------------------------------------------ vehicle

    @Test
    @DisplayName("UTCID28 N: a supported vehicle id is kept")
    void utcid28() {
        assertCreated(new ProjectRequest("AEB test", null, OTHER_VEHICLE), "AEB test", null, OTHER_VEHICLE);
    }

    @Test
    @DisplayName("UTCID29 A: vehicle outside the supported catalog is rejected with VEHICLE_NOT_FOUND")
    void utcid29() {
        assertRejected(new ProjectRequest("AEB test", null, UNKNOWN_VEHICLE), ProjectError.VEHICLE_NOT_FOUND,
                "Xe #99 không có trong danh mục hoặc chưa được hỗ trợ.");
    }

    @Test
    @DisplayName("UTCID30 A: no vehicle sent while the catalog has no default vehicle is rejected with VEHICLE_NOT_FOUND")
    void utcid30() {
        when(projects.supportedVehicle(isNull())).thenReturn(null);

        assertRejected(new ProjectRequest("AEB test", null, null), ProjectError.VEHICLE_NOT_FOUND,
                "Xe #null không có trong danh mục hoặc chưa được hỗ trợ.");
    }

    // ------------------------------------------------------------------ order of the checks

    @Test
    @DisplayName("UTCID31 A: when name, description and vehicle are all invalid, only NAME_REQUIRED is reported")
    void utcid31() {
        assertRejected(new ProjectRequest(null, "d".repeat(2001), UNKNOWN_VEHICLE), ProjectError.NAME_REQUIRED, NAME_REQUIRED);
        verify(projects, never()).existingName(anyLong(), anyString(), anyLong());
        verify(projects, never()).supportedVehicle(any());
    }

    @Test
    @DisplayName("UTCID32 A: with a valid name, an invalid description is reported before an invalid vehicle")
    void utcid32() {
        assertRejected(new ProjectRequest("AEB test", "d".repeat(2001), UNKNOWN_VEHICLE), ProjectError.DESCRIPTION_TOO_LONG,
                DESCRIPTION_TOO_LONG_2001);
        verify(projects, never()).supportedVehicle(any());
    }

    // ------------------------------------------------------------------ helpers

    private void assertCreated(ProjectRequest request, String savedName, String savedDescription, long savedVehicle) {
        ProjectItem created = service.create(OWNER, request);

        assertThat(created.id()).isEqualTo(PROJECT);
        if (savedDescription == null) {
            verify(projects).insert(eq(savedName), isNull(), eq(OWNER), eq(savedVehicle), any());
        } else {
            verify(projects).insert(eq(savedName), eq(savedDescription), eq(OWNER), eq(savedVehicle), any());
        }
    }

    private void assertRejected(ProjectRequest request, ProjectError error, String message) {
        assertThatThrownBy(() -> service.create(OWNER, request)).isInstanceOfSatisfying(ProjectException.class, e -> {
            assertThat(e.getError()).isEqualTo(error);
            assertThat(e.getMessage()).isEqualTo(message);
        });
        verify(projects, never()).insert(anyString(), any(), anyLong(), anyLong(), any());
    }

    private static Row savedProject() {
        Map<String, Object> values = new HashMap<>(Map.of("id", PROJECT, "name", "AEB test", "status", "ACTIVE",
                "created_by_user_id", OWNER, "carla_vehicle_model_id", DEFAULT_VEHICLE, "vehicle_name", "Audi e-tron",
                "family_count", 0, "run_count", 0, "regression_count", 0, "running_work", 0));
        values.put("created_date", LocalDateTime.of(2026, 11, 11, 9, 0));
        values.put("updated_at", LocalDateTime.of(2026, 11, 11, 9, 0));
        return new Row(values);
    }

    private static Row emptyJourney() {
        Map<String, Object> values = new HashMap<>(Map.of("rounds", 1L, "candidates", 0L, "families", 0L, "datasets", 0L,
                "optimizations", 0L, "optimizations_running", 0L, "regressions_running", 0L, "regressions_completed", 0L));
        values.put("baseline_id", null);
        values.put("baseline_label", null);
        values.put("last_activity_at", LocalDateTime.of(2026, 11, 11, 9, 0));
        return new Row(values);
    }
}
