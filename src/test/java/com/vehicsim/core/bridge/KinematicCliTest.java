package com.vehicsim.core.bridge;

import static org.assertj.core.api.Assertions.assertThat;

import com.vehicsim.core.AebParams;
import com.vehicsim.core.Bundle;
import com.vehicsim.core.CrossingCase;
import com.vehicsim.core.MiniJson;
import com.vehicsim.core.SimulationOutcome;
import com.vehicsim.core.Simulator;
import com.vehicsim.core.VehicleSpec;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@code BridgeMain kinematic <bundle>} chạy lại đúng lần chạy mà backend làm với cùng bundle (luật 9: bundle tải ra tái lập được), và từ chối đầu vào xấu
 * bằng mã 2 mà không để lại kết quả (ADR-042; chuyển từ {@code test_sim_contract.py}).
 */
class KinematicCliTest {

    private static final CrossingCase CASE = new CrossingCase(60.0, 25.0, 3.0, false, "RAIN", "NIGHT", null);
    private static final AebParams PARAMS = new AebParams(1.8, 0.1, 8.0, 20.0);

    private final ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    private final ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    private int run(String... args) {
        return KinematicCli.run(args, new PrintStream(stdout, true, StandardCharsets.UTF_8), new PrintStream(stderr, true, StandardCharsets.UTF_8));
    }

    @Test
    void writesTheSameResultAsTheBackendAndSummarisesIt(@TempDir Path dir) throws IOException {
        Bundle.RunSpec spec = new Bundle.RunSpec(CASE, PARAMS, VehicleSpec.DEFAULT, 48_123L, "v1.1", "VF8", Map.of("x", 1L), Map.of());
        Path bundle = dir.resolve("run.json");
        Files.writeString(bundle, MiniJson.write(Bundle.makeBundle(spec)), StandardCharsets.UTF_8);

        assertThat(run(bundle.toString(), "--out", dir.resolve("out").toString())).isZero();

        Map<String, Object> doc = MiniJson.parseObject(Files.readString(dir.resolve("out/result.json"), StandardCharsets.UTF_8));
        Bundle.ResultDoc result = Bundle.readResult(doc);
        // backend Java lưu thẳng khối chấm điểm này, không chấm lại
        assertThat(((Map<?, ?>) doc.get("evaluation")).keySet().stream().map(String::valueOf).toList()).contains("outcome", "verdict", "headline", "aeb_result", "failure", "chain");
        assertThat(result.simulator()).isEqualTo("vehicsim-kinematic-1.0");
        assertThat(result.artifacts()).isEmpty();
        assertThat(doc.get("engine")).isEqualTo(Bundle.ENGINE);
        SimulationOutcome expected = Simulator.simulate(CASE, PARAMS, 48_123L, VehicleSpec.DEFAULT);
        assertThat(MiniJson.write(result.outcome().asDict())).isEqualTo(MiniJson.write(expected.asDict()));
        String summary = stdout.toString(StandardCharsets.UTF_8);
        assertThat(summary).contains("Bộ mô phỏng : vehicsim-kinematic-1.0").contains("60 km/h, kích hoạt 25 m, người đi bộ 3 m/s, RAIN/NIGHT, seed 48123")
                .contains("AEB         : v1.1 · TTC 1.8 s").contains("Đã ghi      :");
    }

    @Test
    void aebAndSeedOverridesApply(@TempDir Path dir) throws IOException {
        Path bundle = dir.resolve("ir.json");
        Files.writeString(bundle, "{\"ego_speed_kmh\": 50, \"trigger_distance_m\": 20, \"pedestrian_speed_mps\": 4}", StandardCharsets.UTF_8);
        Path aeb = dir.resolve("aeb.json");
        Files.writeString(aeb, "{\"TTC_THRESHOLD\": 2.5}", StandardCharsets.UTF_8);
        assertThat(run(bundle.toString(), "--aeb", aeb.toString(), "--seed", "99", "--out", dir.resolve("o").toString())).isZero();
        Map<String, Object> doc = MiniJson.parseObject(Files.readString(dir.resolve("o/result.json"), StandardCharsets.UTF_8));
        assertThat(((Number) doc.get("seed")).longValue()).isEqualTo(99L);
        assertThat(((Map<?, ?>) ((Map<?, ?>) doc.get("outcome")).get("params")).get("ttc_threshold")).isEqualTo(2.5);
    }

    @Test
    void rejectsBadInputWithExitCodeTwoAndWritesNothing(@TempDir Path dir) throws IOException {
        Path bundle = dir.resolve("bad.json");
        Files.writeString(bundle, "{\"ego_speed_kmh\": 300}", StandardCharsets.UTF_8);
        assertThat(run(bundle.toString())).isEqualTo(BridgeMain.EXIT_BAD_INPUT);
        assertThat(stderr.toString(StandardCharsets.UTF_8)).contains("ego_speed_kmh");
        assertThat(dir.resolve("bad/result.json")).doesNotExist();

        assertThat(run(dir.resolve("missing.json").toString())).isEqualTo(BridgeMain.EXIT_BAD_INPUT);
        assertThat(run()).isEqualTo(BridgeMain.EXIT_BAD_INPUT);
        assertThat(run(bundle.toString(), "--seed", "abc")).isEqualTo(BridgeMain.EXIT_BAD_INPUT);
    }
}
