package com.vsos.core.bridge;

import com.vsos.core.simulation.CarlaSession;
import com.vsos.core.common.MiniJson;
import com.vsos.core.aeb.RadarTracker;
import com.vsos.core.simulation.Simulator;
import com.vsos.core.xosc.Xosc;
import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cầu nối CARLA ↔ lõi Java (ADR-042), chạy bằng {@code java -cp target/classes com.vsos.core.bridge.BridgeMain <chế độ>}.
 *
 * <p>Chế độ {@code session}: giao thức {@value #PROTOCOL}, mỗi dòng stdin là một yêu cầu JSON, mỗi yêu cầu có đúng một dòng trả lời trên stdout (flush từng dòng).
 * Java thoát khi stdin đóng, nên tiến trình mồ côi không tồn tại kể cả khi ScenarioRunner bị giết cứng. stdout chỉ dành cho giao thức; mọi thứ khác ra stderr.</p>
 *
 * <ul>
 *   <li>{@code hello} → bắt tay: giao thức và phiên bản lõi.</li>
 *   <li>{@code open} {@code {xosc, out_dir, simulator_version, full_brake_decel?}} → profile thời gian, kích thước xe, vật lý xe cần ép, hằng số khung.</li>
 *   <li>{@code init} {@code {ego:{fwd,right}, walker:[x,y], front_offset, carla:{map,blueprint}}} → đặt gốc khung tọa độ.</li>
 *   <li>{@code step} {@code {t, ego:{loc,fwd,vel}, ped:{loc,vel}, walker_hit}} → {@code {skip, braking, decel_cmd, pedal, finished, result}}.</li>
 *   <li>{@code finish} {@code {reason}} → ghi {@code result.json} nếu chưa ghi. {@code quit} → thoát.</li>
 * </ul>
 *
 * <p>Chế độ {@code kinematic <bundle.json> [--aeb f] [--seed n] [--out dir]}: chạy lại một bundle bằng bộ động học (xem {@link KinematicCli}).</p>
 *
 * <p>Chế độ {@code info <file.xosc>}: in một dòng JSON {@code {suffix, step_s, perception_period_s}}; lỗi thì ghi stderr và thoát mã 2.</p>
 *
 * <p>Chế độ {@code export <ir-hoặc-bundle.json> <ra.xosc>}: xuất {@code .xosc} offline (cùng {@code XoscExport} của web); lỗi đầu vào thoát mã 2.</p>
 */
public final class BridgeMain {

    public static final String PROTOCOL = "vsos-bridge/1";
    public static final int EXIT_BAD_INPUT = 2;

    private BridgeMain() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length == 0) {
            System.err.println("cách dùng: BridgeMain session | info <file.xosc> | export <ir.json> <ra.xosc> | kinematic <bundle.json>");
            System.exit(EXIT_BAD_INPUT);
        }
        // stdout chỉ cho giao thức: chuyển mọi System.out vô tình sang stderr.
        PrintStream protocol = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
        System.setOut(System.err);
        switch (args[0]) {
            case "kinematic" -> {
                protocol.flush();
                System.exit(KinematicCli.run(java.util.Arrays.copyOfRange(args, 1, args.length), new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8), System.err));
            }
            case "session" -> session(new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)), protocol);
            case "info" -> {
                if (args.length < 2) {
                    System.err.println("thiếu file .xosc");
                    System.exit(EXIT_BAD_INPUT);
                }
                try {
                    Xosc.Profile p = Xosc.profile(Path.of(args[1]));
                    Xosc.read(Path.of(args[1])); // không nhận XML ngoài hợp đồng/thiếu metadata vào đường ghi kết quả
                    reply(protocol, map("suffix", p.suffix(), "step_s", p.stepS(), "perception_period_s", p.perceptionPeriodS()));
                } catch (Bundle.BundleError e) {
                    System.err.println(e.getMessage());
                    System.exit(EXIT_BAD_INPUT);
                }
            }
            case "export" -> {
                // Xuất .xosc offline từ Scenario IR hoặc bundle (không cần backend): dùng cho đo/kiểm trên CARLA nhiều ca.
                if (args.length < 3) {
                    System.err.println("cách dùng: BridgeMain export <ir-hoặc-bundle.json> <ra.xosc>");
                    System.exit(EXIT_BAD_INPUT);
                }
                try {
                    Bundle.RunSpec spec = Bundle.readSpec(MiniJson.parseObject(java.nio.file.Files.readString(Path.of(args[1]), StandardCharsets.UTF_8)));
                    java.nio.file.Files.writeString(Path.of(args[2]), com.vsos.core.xosc.XoscExport.export(spec), StandardCharsets.UTF_8);
                    reply(protocol, map("ok", true, "xosc", args[2]));
                } catch (IllegalArgumentException e) { // gồm Bundle.BundleError và JSON sai
                    System.err.println(e.getMessage());
                    System.exit(EXIT_BAD_INPUT);
                }
            }
            default -> {
                System.err.println("chế độ không hợp lệ: " + args[0]);
                System.exit(EXIT_BAD_INPUT);
            }
        }
    }

    private static void reply(PrintStream out, Map<String, Object> message) {
        out.print(MiniJson.write(message));
        out.print('\n');
        out.flush();
    }

    private static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            out.put((String) keyValues[i], keyValues[i + 1]);
        }
        return out;
    }

    private static void session(BufferedReader in, PrintStream out) throws IOException {
        CarlaSession session = null;
        for (String line; (line = in.readLine()) != null; ) {
            if (line.isBlank()) {
                continue;
            }
            Map<String, Object> reply;
            boolean quit = false;
            try {
                Map<String, Object> request = MiniJson.parseObject(line);
                String op = String.valueOf(request.get("op"));
                switch (op) {
                    case "hello" -> {
                        if (!PROTOCOL.equals(request.get("protocol"))) {
                            throw new IllegalArgumentException("giao thức " + request.get("protocol") + " không khớp " + PROTOCOL);
                        }
                        reply = map("ok", true, "protocol", PROTOCOL, "core", Bundle.ENGINE);
                    }
                    case "open" -> {
                        Object full = request.get("full_brake_decel");
                        session = CarlaSession.open(Path.of(str(request, "xosc")), Path.of(str(request, "out_dir")), str(request, "simulator_version"),
                                full instanceof Number n ? n.doubleValue() : null);
                        Xosc.Profile p = session.profile();
                        Map<String, Object> physics = session.spec().vehicleCarla().get("physics") instanceof Map<?, ?> m ? castMap(m) : Map.of();
                        reply = map("ok", true,
                                "profile", map("suffix", p.suffix(), "step_s", p.stepS(), "perception_period_s", p.perceptionPeriodS()),
                                "vehicle", map("length_m", session.spec().vehicle().lengthM(), "width_m", session.spec().vehicle().widthM()),
                                "physics", physics,
                                "radar", RadarTracker.sensorAttributes(),
                                "constants", map("pedestrian_start_y_m", Simulator.PEDESTRIAN_START_Y_M, "max_duration_s", Simulator.MAX_DURATION_S));
                    }
                    case "init" -> {
                        requireSession(session);
                        Map<String, Object> ego = castMap(request.get("ego"));
                        session.init(vec(ego.get("fwd")), vec(ego.get("right")), vec(request.get("walker")), num(request.get("front_offset")),
                                castMap(request.get("carla")));
                        reply = map("ok", true);
                    }
                    case "step" -> {
                        requireSession(session);
                        Map<String, Object> ego = castMap(request.get("ego"));
                        Map<String, Object> ped = castMap(request.get("ped"));
                        CarlaSession.Tick tick = session.step(num(request.get("t")), vec(ego.get("loc")), vec(ego.get("fwd")), vec(ego.get("vel")),
                                vec(ped.get("loc")), vec(ped.get("vel")), Boolean.TRUE.equals(request.get("walker_hit")), radar(request.get("radar")));
                        reply = map("ok", true, "skip", tick.skip(), "braking", tick.braking(), "decel_cmd", tick.decelCmd(), "pedal", tick.pedal(),
                                "finished", tick.finished(), "result", tick.finished() != null ? session.resultPath().toString() : null);
                    }
                    case "finish" -> {
                        requireSession(session);
                        session.finish(String.valueOf(request.getOrDefault("reason", "TIMEOUT")));
                        reply = map("ok", true, "finished", session.finished(), "result", session.resultPath() != null ? session.resultPath().toString() : null);
                    }
                    case "quit" -> {
                        reply = map("ok", true);
                        quit = true;
                    }
                    default -> throw new IllegalArgumentException("op không hợp lệ: " + op);
                }
            } catch (RuntimeException e) {
                reply = map("ok", false, "error", e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            reply(out, reply);
            if (quit) {
                return;
            }
        }
        // stdin đóng (Python/ScenarioRunner đã thoát hoặc bị giết cứng): thoát ngay, KHÔNG ghi result.json. Run bị ngắt giữa chừng không có điểm hợp lệ; kết quả
        // dở dang nằm lại trên đĩa có thể bị coi là hợp lệ.
        if (session != null && !session.finished()) {
            System.err.println("stdin đóng trước khi run kết thúc: không ghi result.json");
        }
    }

    private static void requireSession(CarlaSession session) {
        if (session == null) {
            throw new IllegalStateException("chưa open");
        }
    }

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) {
            throw new IllegalArgumentException("thiếu " + key);
        }
        return v.toString();
    }

    private static double num(Object v) {
        if (!(v instanceof Number n)) {
            throw new IllegalArgumentException("cần số, nhận " + v);
        }
        return n.doubleValue();
    }

    /** {@code radar}: danh sách {@code [depth, azimuth, altitude, velocity]} (ADR-043); thiếu khoá = adapter không gắn radar → {@code null}. */
    private static List<RadarTracker.Point> radar(Object v) {
        if (v == null) {
            return null;
        }
        if (!(v instanceof List<?> list)) {
            throw new IllegalArgumentException("radar phải là danh sách điểm, nhận " + v);
        }
        List<RadarTracker.Point> points = new java.util.ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof List<?> p) || p.size() != 4) {
                throw new IllegalArgumentException("điểm radar cần [depth, azimuth, altitude, velocity], nhận " + item);
            }
            points.add(new RadarTracker.Point(num(p.get(0)), num(p.get(1)), num(p.get(2)), num(p.get(3))));
        }
        return points;
    }

    private static double[] vec(Object v) {
        if (!(v instanceof List<?> list) || list.size() < 2) {
            throw new IllegalArgumentException("cần vector [x, y], nhận " + v);
        }
        return new double[] {num(list.get(0)), num(list.get(1))};
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object v) {
        if (!(v instanceof Map)) {
            throw new IllegalArgumentException("cần object, nhận " + v);
        }
        return (Map<String, Object>) v;
    }
}
