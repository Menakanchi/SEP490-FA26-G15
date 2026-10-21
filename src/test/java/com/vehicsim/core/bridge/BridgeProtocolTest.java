package com.vehicsim.core.bridge;

import static org.assertj.core.api.Assertions.assertThat;

import com.vehicsim.core.AebParams;
import com.vehicsim.core.Bundle;
import com.vehicsim.core.CrossingCase;
import com.vehicsim.core.MiniJson;
import com.vehicsim.core.VehicleSpec;
import com.vehicsim.core.XoscExport;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Cầu nối {@value BridgeMain#PROTOCOL} chạy như tiến trình thật ({@code java -cp target/classes}), đúng cách controller Python dùng nó (ADR-042): bắt tay, vòng đời
 * open/init/step, thế giới tổng hợp 100 Hz đi qua giao thức, lỗi giao thức không làm sập tiến trình, và thoát khi stdin đóng (chống tiến trình mồ côi).
 */
class BridgeProtocolTest {

    private Process process;
    private BufferedWriter to;
    private BufferedReader from;

    @AfterEach
    void stop() {
        if (process != null && process.isAlive()) {
            process.destroyForcibly();
        }
    }

    private void start(String... args) throws IOException {
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        List<String> command = new java.util.ArrayList<>(List.of(java, "-cp", Path.of("target/classes").toAbsolutePath().toString(),
                "com.vehicsim.core.bridge.BridgeMain"));
        command.addAll(List.of(args));
        process = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        to = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
        from = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
    }

    private Map<String, Object> call(Map<String, Object> request) throws IOException {
        to.write(MiniJson.write(request));
        to.write('\n');
        to.flush();
        String line = from.readLine();
        assertThat(line).as("thiếu dòng trả lời cho " + request.get("op")).isNotNull();
        return MiniJson.parseObject(line);
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static Path writeXosc(Path dir, CrossingCase c) throws IOException {
        Bundle.RunSpec spec = new Bundle.RunSpec(c, AebParams.DEFAULT, VehicleSpec.DEFAULT, 48846L, "v1.0", "VF8",
                map("run_id", 1L, "scenario_id", 2L, "scenario_version_id", 3L, "aeb_version_id", 4L, "carla_vehicle_model_id", 5L), Map.of());
        Path file = dir.resolve("scenario.xosc");
        Files.writeString(file, XoscExport.export(spec), StandardCharsets.UTF_8);
        return file;
    }

    @Test
    void handshakeRejectsAForeignProtocolAndAcceptsTheRightOne(@TempDir Path dir) throws IOException {
        start("session");
        assertThat(call(map("op", "hello", "protocol", "other/9"))).containsEntry("ok", false);
        Map<String, Object> hello = call(map("op", "hello", "protocol", BridgeMain.PROTOCOL));
        assertThat(hello).containsEntry("ok", true).containsEntry("protocol", BridgeMain.PROTOCOL).containsEntry("core", Bundle.ENGINE);
    }

    @Test
    void protocolErrorsAreAnsweredAndDoNotKillTheProcess(@TempDir Path dir) throws IOException {
        start("session");
        assertThat(call(map("op", "step"))).containsEntry("ok", false);
        to.write("not json\n");
        to.flush();
        assertThat(MiniJson.parseObject(from.readLine())).containsEntry("ok", false);
        assertThat(call(map("op", "bogus"))).containsEntry("ok", false);
        assertThat(call(map("op", "open", "xosc", dir.resolve("missing.xosc").toString(), "out_dir", dir.toString(), "simulator_version", "x")))
                .containsEntry("ok", false);
        assertThat(call(map("op", "hello", "protocol", BridgeMain.PROTOCOL))).containsEntry("ok", true);
        assertThat(process.isAlive()).isTrue();
    }

    @Test
    void aSyntheticCrossingRunsThroughTheProtocolAndWritesResultJson(@TempDir Path dir) throws IOException {
        CrossingCase c = new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null);
        Path xosc = writeXosc(dir, c);
        start("session");
        call(map("op", "hello", "protocol", BridgeMain.PROTOCOL));
        Path out = dir.resolve("out");
        Map<String, Object> open = call(map("op", "open", "xosc", xosc.toString(), "out_dir", out.toString(), "simulator_version", "carla-0.9.16-xosc3"));
        assertThat(open).containsEntry("ok", true);
        Map<String, Object> profile = castMap(open.get("profile"));
        assertThat(profile).containsEntry("suffix", "-xosc3").containsEntry("step_s", 0.01).containsEntry("perception_period_s", 0.05);
        assertThat(castMap(open.get("constants"))).containsEntry("pedestrian_start_y_m", -3.6).containsEntry("max_duration_s", 12.0);

        // Khung tọa độ trùng hệ thế giới: gốc (0,0), tiến +x, "phải" = +y => left = -y. Người đi bộ bắt đầu ở (0, 3.6)... gốc = (0, 3.6 + 1 * -3.6) = (0,0).
        assertThat(call(map("op", "init", "ego", map("fwd", List.of(1.0, 0.0), "right", List.of(0.0, 1.0)), "walker", List.of(0.0, 3.6), "front_offset", 0.0,
                "carla", map("map", "Town04", "blueprint", "vehicle.audi.etron")))).containsEntry("ok", true);

        double dt = 0.01;
        double v = c.egoSpeedKmh() / 3.6;
        double gap = c.crossingX();
        double pedLeft = -3.6;
        double pedVLeft = 0.0;
        boolean pedStarted = false;
        double pedal = 0.0;
        String finished = null;
        int ticks = 0;
        for (double t = 0.0; t < 14.0 && finished == null; t += dt, ticks++) {
            double time = Math.round(t * 1000.0) / 1000.0;
            if (!pedStarted && gap <= c.triggerDistanceM()) {
                pedStarted = true;
                pedVLeft = c.pedestrianSpeedMps();
            }
            if (pedStarted) {
                pedLeft += pedVLeft * dt;
            }
            Map<String, Object> reply = call(map("op", "step", "t", time,
                    "ego", map("loc", List.of(-gap, 0.0), "fwd", List.of(1.0, 0.0), "vel", List.of(v, 0.0)),
                    "ped", map("loc", List.of(0.0, -pedLeft), "vel", List.of(0.0, -pedVLeft)), "walker_hit", false));
            assertThat(reply).containsEntry("ok", true);
            if (Boolean.TRUE.equals(reply.get("skip"))) {
                continue;
            }
            pedal = ((Number) reply.get("pedal")).doubleValue();
            finished = (String) reply.get("finished");
            v = Math.max(0.0, v - pedal * 4.6 * dt);
            gap -= v * dt;
        }
        assertThat(finished).as("run phải kết thúc trong 14 s mô phỏng").isNotNull();
        assertThat(ticks).isGreaterThan(300);

        Path resultFile = out.resolve("result.json");
        assertThat(resultFile).exists();
        Map<String, Object> result = MiniJson.parseObject(Files.readString(resultFile, StandardCharsets.UTF_8));
        assertThat(result).containsEntry("format", Bundle.RESULT_FORMAT).containsEntry("simulator", "carla-0.9.16-xosc3").containsEntry("engine", Bundle.ENGINE)
                .containsKey("evaluation");
        assertThat(((Number) result.get("seed")).longValue()).isEqualTo(48846L);
        Map<String, Object> outcome = castMap(result.get("outcome"));
        assertThat(outcome.get("end_reason")).isEqualTo(finished);
        Map<String, Object> carla = castMap(castMap(outcome.get("case")).get("carla"));
        assertThat(carla).containsEntry("map", "Town04").containsEntry("runner", "ScenarioRunner").containsEntry("fixed_delta_seconds", 0.01)
                .containsEntry("perception_period_s", 0.05);
        Map<String, Object> measured = castMap(carla.get("measured_step_s"));
        assertThat(((Number) measured.get("min")).doubleValue()).isEqualTo(0.01);
        assertThat(((Number) measured.get("max")).doubleValue()).isEqualTo(0.01);
        assertThat(castMap(outcome.get("metrics")).get("aeb_decision_t")).as("ca có nguy cơ thì AEB phải quyết định phanh").isNotNull();
        assertThat(((List<?>) outcome.get("frames")).size()).isEqualTo(((Number) measured.get("frames")).intValue());

        // finish sau khi đã kết thúc không ghi đè.
        long before = Files.getLastModifiedTime(resultFile).toMillis();
        assertThat(call(map("op", "finish", "reason", "TIMEOUT"))).containsEntry("ok", true).containsEntry("finished", true);
        assertThat(Files.getLastModifiedTime(resultFile).toMillis()).isEqualTo(before);
    }

    @Test
    void theProcessExitsWhenStdinClosesAndWritesNoResult(@TempDir Path dir) throws IOException, InterruptedException {
        CrossingCase c = new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null);
        start("session");
        call(map("op", "hello", "protocol", BridgeMain.PROTOCOL));
        Path out = dir.resolve("out");
        call(map("op", "open", "xosc", writeXosc(dir, c).toString(), "out_dir", out.toString(), "simulator_version", "carla-0.9.16-xosc3"));
        call(map("op", "init", "ego", map("fwd", List.of(1.0, 0.0), "right", List.of(0.0, 1.0)), "walker", List.of(0.0, 3.6), "front_offset", 0.0,
                "carla", map("map", "Town04", "blueprint", "vehicle.audi.etron")));
        call(map("op", "step", "t", 0.0, "ego", map("loc", List.of(-c.crossingX(), 0.0), "fwd", List.of(1.0, 0.0), "vel", List.of(13.9, 0.0)),
                "ped", map("loc", List.of(0.0, 3.6), "vel", List.of(0.0, 0.0)), "walker_hit", false));
        to.close(); // như khi ScenarioRunner bị giết cứng: ống đóng
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).as("tiến trình Java phải thoát khi stdin đóng").isTrue();
        assertThat(process.exitValue()).isZero();
        assertThat(out.resolve("result.json")).as("run bị ngắt giữa chừng không có điểm hợp lệ: không được để lại result.json dở dang").doesNotExist();
    }

    @Test
    void infoModePrintsTheProfileOrFailsWithExitCodeTwo(@TempDir Path dir) throws IOException, InterruptedException {
        start("info", writeXosc(dir, new CrossingCase(50, 22, 3.0, false, "CLEAR", "DAY", null)).toString());
        Map<String, Object> info = MiniJson.parseObject(from.readLine());
        assertThat(info).containsEntry("suffix", "-xosc3").containsEntry("step_s", 0.01).containsEntry("perception_period_s", 0.05);
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).isZero();

        Path bad = dir.resolve("bad.xosc");
        Files.writeString(bad, "<OpenSCENARIO><ParameterDeclarations/></OpenSCENARIO>");
        start("info", bad.toString());
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).isEqualTo(BridgeMain.EXIT_BAD_INPUT);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        return (Map<String, Object>) o;
    }
}
