package com.vsos.backend.service.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.simulation.CrossingCase;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.Simulator;
import com.vsos.core.simulation.VehicleSpec;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import com.vsos.backend.common.Json;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.scenario.FamilyService;

/**
 * Bộ động học chạy trong tiến trình qua lõi Java (ADR-042): cùng bundle → cùng kết quả như gọi thẳng lõi, mang khóa {@code engine}, và vẫn qua
 * {@code checkResult} (seed, id nguồn, simulator phải khớp run). Logic thật, {@link Db} giả.
 */
class KinematicInProcessTest {

    private static final long RUN = 42L;
    private static final long SEED = 48846L;

    private RunService service;
    private Row run;
    private Map<String, Object> source;

    @BeforeEach
    void setUp() {
        PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new RunService(mock(Db.class), mock(Queries.class), mock(VehicSimProperties.class), mock(TaskExecutor.class),
                mock(ApplicationEventPublisher.class), new TransactionTemplate(transactions), mock(FamilyService.class));
        source = new LinkedHashMap<>(Map.of("run_id", RUN, "scenario_id", 7L, "scenario_version_id", 8L, "aeb_version_id", 9L, "carla_vehicle_model_id", 10L));
        run = new Row(new HashMap<>(Map.of("id", RUN, "simulator_version", RunService.KINEMATIC_SIMULATOR, "random_seed", SEED, "scenario_id", 7L,
                "scenario_version_id", 8L, "aeb_version_id", 9L, "carla_vehicle_model_id", 10L)));
    }

    private Map<String, Object> bundle(CrossingCase c, AebParams params) {
        return Bundle.makeBundle(new Bundle.RunSpec(c, params, VehicleSpec.DEFAULT, SEED, "v1.0", "VF8", source, Map.of()));
    }

    @Test
    void producesTheSameResultAsCallingTheCoreAndCarriesTheEngineVersion() {
        CrossingCase c = new CrossingCase(50, 22, 3.0, false, "RAIN", "NIGHT", null);
        Map<String, Object> result = service.runKinematic(run, bundle(c, AebParams.DEFAULT));

        SimulationOutcome expected = Simulator.simulate(c, AebParams.DEFAULT, SEED);
        assertThat(result).containsEntry("simulator", RunService.KINEMATIC_SIMULATOR).containsEntry("engine", Bundle.ENGINE).containsKey("evaluation");
        Map<String, Object> outcome = Json.asMap(result.get("outcome"));
        assertThat(outcome).containsEntry("end_reason", expected.endReason());
        assertThat(Json.asList(outcome.get("frames"))).hasSize(expected.frames().size());
        assertThat(Json.asMap(result.get("evaluation"))).containsEntry("verdict", Evaluation.evaluate(expected, AebParams.DEFAULT).verdict());
        assertThat(((Number) result.get("seed")).longValue()).isEqualTo(SEED);
    }

    @Test
    void rejectsABundleTheCoreCannotRead() {
        Map<String, Object> bad = bundle(new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null), AebParams.DEFAULT);
        Json.asMap(bad.get("variant")).put("weather", "SNOW");
        assertThatThrownBy(() -> service.runKinematic(run, bad)).isInstanceOf(RunService.SimulatorException.class)
                .hasMessageContaining("Không đọc được đầu vào").hasMessageContaining("weather");
    }

    @Test
    void aResultWhoseSeedOrSourceDoesNotMatchTheRunIsRefused() {
        Map<String, Object> other = bundle(new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null), AebParams.DEFAULT);
        other.put("seed", SEED + 1);
        assertThatThrownBy(() -> service.runKinematic(run, other)).isInstanceOf(RunService.SimulatorException.class).hasMessageContaining("seed");
        source.put("run_id", RUN + 1);
        assertThatThrownBy(() -> service.runKinematic(run, bundle(new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null), AebParams.DEFAULT)))
                .isInstanceOf(RunService.SimulatorException.class).hasMessageContaining("run_id");
    }

    @Test
    void everyFixtureOutcomeMatchesWhatTheServiceStores() {
        for (double speed : List.of(30.0, 70.0)) {
            CrossingCase c = new CrossingCase(speed, 12, 4.0, true, "CLEAR", "DAY", null);
            Map<String, Object> result = service.runKinematic(run, bundle(c, new AebParams(2.5, 0.05, 6.0, 12.0)));
            SimulationOutcome expected = Simulator.simulate(c, new AebParams(2.5, 0.05, 6.0, 12.0), SEED);
            assertThat(Json.asMap(Json.asMap(result.get("outcome")).get("metrics"))).containsEntry("collision", expected.metrics().get("collision"));
        }
    }
}
