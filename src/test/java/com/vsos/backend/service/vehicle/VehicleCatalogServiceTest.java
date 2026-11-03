package com.vsos.backend.service.vehicle;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;

class VehicleCatalogServiceTest {
    private Db db;
    private Queries queries;
    private VehicleCatalogService catalog;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        queries = mock(Queries.class);
        catalog = new VehicleCatalogService(db, queries);
        when(db.scalar(eq("SELECT carla_vehicle_model_id FROM projects WHERE id = ?"), any(Object[].class))).thenReturn(1L);
    }

    /** Một dòng carla_vehicle_models như JDBC trả: DECIMAL là BigDecimal, BOOLEAN là số. */
    private static Row vehicle(long id, String blueprint, String name, Double fullBrake, boolean supported) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", id);
        m.put("carla_blueprint_id", blueprint);
        m.put("display_name", name);
        m.put("length_m", new BigDecimal("4.792"));
        m.put("width_m", new BigDecimal("2.163"));
        m.put("height_m", new BigDecimal("1.488"));
        m.put("num_wheels", 4);
        m.put("mass_kg", new BigDecimal("1845.00"));
        m.put("max_brake_decel_mps2", new BigDecimal("9.50"));
        m.put("carla_full_brake_decel_mps2", fullBrake == null ? null : BigDecimal.valueOf(fullBrake));
        m.put("is_supported", supported ? 1 : 0);
        m.put("run_count", 0L);
        return new Row(m);
    }

    @Test
    void listPutsTheProjectVehicleFirstAndKeepsMissingMeasurementsEmpty() {
        Row truck = vehicle(5, "vehicle.carlamotors.european_hgv", "CarlaMotors European HGV", 1.77, false);
        Row etron = vehicle(1, "vehicle.audi.etron", "Audi e-tron", null, true);
        Row tesla = vehicle(2, "vehicle.tesla.model3", null, 3.56, true);
        when(db.list(startsWith("SELECT m.*"), any(Object[].class))).thenReturn(List.of(truck, etron, tesla));

        List<Map<String, Object>> out = catalog.list(1);

        assertThat(out).extracting(v -> v.get("id")).containsExactly(1L, 5L, 2L); // xe đang dùng lên đầu, còn lại giữ thứ tự
        assertThat(out.get(0)).containsEntry("in_use", true).containsEntry("carla_full_brake_decel_mps2", null); // chưa đo: null, không phải 0
        assertThat(out.get(1)).containsEntry("in_use", false).containsEntry("is_supported", false).containsEntry("mass_kg", 1845.0);
        assertThat(out.get(2)).containsEntry("name", "vehicle.tesla.model3"); // không có tên hiển thị thì dùng blueprint
    }

    @Test
    void detailSumsRunsPerSimulatorAndLeavesUnsetPhysicsEmpty() {
        when(queries.vehicleById(2)).thenReturn(vehicle(2, "vehicle.tesla.model3", "Tesla Model 3", 3.56, true));
        when(db.list(startsWith("SELECT * FROM sensors"), any(Object[].class))).thenReturn(List.of());
        Map<String, Object> carla = new HashMap<>(Map.of("simulator_type", "CARLA", "simulator_version", "carla-0.9.16-xosc4", "runs", 3L,
                "last_run_at", Timestamp.valueOf(LocalDateTime.of(2026, 10, 26, 9, 30))));
        Map<String, Object> kinematic = new HashMap<>(Map.of("simulator_type", "KINEMATIC", "simulator_version", "kinematic-v9", "runs", 12L));
        kinematic.put("last_run_at", null);
        when(db.list(startsWith("SELECT simulator_type"), any(Object[].class))).thenReturn(List.of(new Row(kinematic), new Row(carla)));

        Map<String, Object> out = catalog.detail(1, 2);

        assertThat(out).containsEntry("in_use", false).containsEntry("run_count", 15L);
        assertThat(out.get("sensors")).isEqualTo(List.of());
        @SuppressWarnings("unchecked") Map<String, Object> physics = (Map<String, Object>) out.get("physics");
        assertThat(physics).containsEntry("center_of_mass_m", null).containsEntry("max_speed_mps", null);
        @SuppressWarnings("unchecked") List<Map<String, Object>> usage = (List<Map<String, Object>>) out.get("usage");
        assertThat(usage).extracting(u -> u.get("last_run_at")).containsExactly(null, "2026-10-26T09:30:00");
    }

    @Test
    void unknownVehicleIsNotFound() {
        when(queries.vehicleById(99)).thenThrow(new Vs.NotFoundException("xe"));
        assertThatThrownBy(() -> catalog.detail(1, 99)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void runCountsAreScopedToTheCurrentProject() {
        when(db.list(anyString(), any(Object[].class))).thenReturn(List.of());
        catalog.list(7);
        org.mockito.Mockito.verify(db).list(startsWith("SELECT m.*, (SELECT COUNT(*) FROM simulation_runs r WHERE r.project_id = ?"), eq(7L));
    }
}
