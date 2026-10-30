package com.vsos.core.bridge;

import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.common.MiniJson;
import com.vsos.core.common.Py;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.Simulator;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Chạy MỘT biến thể bằng bộ mô phỏng động học từ dòng lệnh (ADR-042), thay cho {@code worker/kinematic_sim.py}:
 *
 * <pre>
 *   java -cp target/classes com.vsos.core.bridge.BridgeMain kinematic vehicsim-run-42.json [--aeb aeb.json] [--seed 7] [--out dir]
 * </pre>
 *
 * Không cần CARLA, GPU hay backend. Kết quả trùng từng khung với lần chạy trên web nếu cùng bundle (cùng biến thể + AEB + seed): đó là cách chạy lại bundle nội bộ
 * tải ra từ web (luật 9). Thoát 0 khi chạy xong — kể cả khi AEB FAIL (đó là kết quả kiểm thử); mã 2 khi đầu vào không đọc được.
 */
public final class KinematicCli {

    private KinematicCli() {
    }

    public static int run(String[] args, PrintStream out, PrintStream err) {
        Path bundlePath = null;
        Path aebPath = null;
        Path outDir = null;
        Long seed = null;
        try {
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--aeb" -> aebPath = Path.of(next(args, ++i, "--aeb"));
                    case "--out" -> outDir = Path.of(next(args, ++i, "--out"));
                    case "--seed" -> seed = Long.parseLong(next(args, ++i, "--seed"));
                    case "--fast" -> { /* tương thích hợp đồng worker: bộ động học luôn chạy nhanh nhất có thể */ }
                    default -> {
                        if (args[i].startsWith("--") || bundlePath != null) {
                            throw new IllegalArgumentException("tham số không hợp lệ: " + args[i]);
                        }
                        bundlePath = Path.of(args[i]);
                    }
                }
            }
            if (bundlePath == null) {
                throw new IllegalArgumentException("thiếu file bundle JSON");
            }
        } catch (IllegalArgumentException e) {
            err.println("Không đọc được đầu vào: " + e.getMessage());
            return BridgeMain.EXIT_BAD_INPUT;
        }

        Bundle.RunSpec spec;
        try {
            Object doc = MiniJson.parse(Files.readString(bundlePath, StandardCharsets.UTF_8));
            Map<String, Object> aeb = aebPath == null ? null : MiniJson.parseObject(Files.readString(aebPath, StandardCharsets.UTF_8));
            spec = Bundle.readSpec(doc, aeb, seed);
        } catch (IOException | IllegalArgumentException e) { // BundleError và lỗi JSON đều là IllegalArgumentException
            err.println("Không đọc được đầu vào: " + e.getMessage());
            return BridgeMain.EXIT_BAD_INPUT;
        }

        SimulationOutcome outcome = Simulator.simulate(spec.caseSpec(), spec.params(), spec.seed(), spec.vehicle());
        Evaluation.Result ev = Evaluation.evaluate(outcome, spec.params());
        Map<String, Object> result = Bundle.resultDocument(spec, outcome, Bundle.KINEMATIC_SIMULATOR, null, ev.toDocument());
        result.put("engine", Bundle.ENGINE);
        Path dir = outDir != null ? outDir : stripSuffix(bundlePath);
        Path target = dir.resolve("result.json");
        try {
            Files.createDirectories(dir);
            Files.writeString(target, MiniJson.write(result), StandardCharsets.UTF_8);
        } catch (IOException e) {
            err.println("Không ghi được kết quả: " + e.getMessage());
            return 3;
        }

        Map<String, Object> m = outcome.metrics();
        var c = spec.caseSpec();
        out.println("Bộ mô phỏng : " + Bundle.KINEMATIC_SIMULATOR);
        out.println("Biến thể    : " + Py.g(c.egoSpeedKmh()) + " km/h, kích hoạt " + Py.g(c.triggerDistanceM()) + " m, người đi bộ " + Py.g(c.pedestrianSpeedMps())
                + " m/s" + (c.stopsAtCurb() ? " (dừng ở lề)" : "") + ", " + c.weather() + "/" + c.timeOfDay() + ", seed " + spec.seed());
        out.println("AEB         : " + (Bundle.truthy(spec.aebLabel()) ? spec.aebLabel() : "(không tên)") + " · TTC " + Py.g(spec.params().ttcThreshold()) + " s");
        out.println("Kết quả     : " + ev.verdict() + " · " + ev.outcome() + " · kết thúc " + outcome.endReason() + " sau " + Py.g(outcome.durationS()) + " s");
        if (Boolean.TRUE.equals(m.get("collision"))) {
            out.println("Va chạm     : " + Py.fixed(((Number) m.get("impact_speed_mps")).doubleValue() * 3.6, 1) + " km/h");
        } else {
            out.println("Khoảng cách nhỏ nhất: " + (m.get("min_distance_m") == null ? "None" : Py.reprFloat(((Number) m.get("min_distance_m")).doubleValue())) + " m");
        }
        if (!ev.headline().isEmpty()) {
            out.println("Nhận định   : " + ev.headline());
        }
        out.println("Đã ghi      : " + target);
        return 0;
    }

    private static String next(String[] args, int index, String flag) {
        if (index >= args.length) {
            throw new IllegalArgumentException(flag + " cần một giá trị");
        }
        return args[index];
    }

    private static Path stripSuffix(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return file.resolveSibling(dot > 0 ? name.substring(0, dot) : name);
    }
}
