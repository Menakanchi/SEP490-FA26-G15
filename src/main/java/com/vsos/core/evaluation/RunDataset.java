package com.vsos.core.evaluation;

import com.vsos.core.common.Py;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Chỉ số dẫn xuất của một run người đi bộ băng ngang, tính từ chính {@code result.json} (ADR-065). Tên khóa trùng tên cột {@code d_*} của
 * dataset phân tích lỗi AEB (23/11/2026) để đối chiếu từng cột; công thức theo sheet 12_FORMULAS của dataset đó (F02, F04–F10, F12–F17).
 *
 * <p>Đây là số dẫn xuất độc lập với cờ chấm của hệ thống ({@link Evaluation}): chúng không đổi kết quả chấm, không đổi định danh run và
 * không dùng để tối ưu. Giá trị không tính được (thiếu dữ liệu, điều kiện không áp dụng) là {@code null}, không thay bằng 0.</p>
 *
 * <p>Giả định chung: {@code ego_x} là vị trí MŨI xe; trục {@code y} của người đi bộ có tâm là làn ego; mốc thời gian của ground truth
 * trùng mốc của {@code frames}.</p>
 */
public final class RunDataset {

    public static final String FORMAT = "vehicsim.run-dataset/v1";
    private static final double GRAVITY = 9.81;
    /** Thời gian trễ cố định cộng vào độ trễ phanh khi tính quãng cần dừng (CT 31b). */
    private static final double BRAKE_LAG_S = 0.10;
    private static final double MAX_BUILDUP = 20.0;
    private static final double DECEL_WINDOW_S = 0.1;
    private static final int DIGITS = 4;

    private RunDataset() {
    }

    /** Kích thước xe và hành lang. {@code carla*} là kích thước CARLA thực đo; thiếu thì dùng kích thước xe của bundle. */
    public record Geometry(double vehicleWidthM, double vehicleLengthM, double corridorHalfWidthM, Double carlaLengthM, Double carlaWidthM) {
        double clearanceLength() {
            return carlaLengthM != null ? carlaLengthM : vehicleLengthM;
        }

        double clearanceWidth() {
            return carlaWidthM != null ? carlaWidthM : vehicleWidthM;
        }
    }

    /** Một dòng {@code ground_truth.csv} của ego hoặc người đi bộ. {@code speed} là tốc độ độ lớn (m/s), {@code yawDeg} quanh trục z. */
    public record GtRow(int frame, double t, double x, double y, double yawDeg, double speed) {
    }

    public record GroundTruth(List<GtRow> ego, List<GtRow> target) {
        public static final GroundTruth NONE = new GroundTruth(List.of(), List.of());

        boolean hasEgo() {
            return ego != null && ego.size() > 1;
        }
    }

    /** {@code d_*} của một run. {@code result} là {@code result.json} đã đọc; {@code gt} có thể rỗng (khi đó các cột từ ground truth là null). */
    public static Map<String, Object> derived(Map<String, Object> result, Geometry geometry, GroundTruth gt) {
        Map<String, Object> outcome = map(result.get("outcome"));
        Map<String, Object> metrics = map(outcome.get("metrics"));
        Map<String, Object> params = map(outcome.get("params"));
        Map<String, Object> caseDoc = map(outcome.get("case"));
        Map<String, Object> carla = map(caseDoc.get("carla"));
        List<Map<String, Object>> frames = list(outcome.get("frames"));
        List<Map<String, Object>> events = list(outcome.get("events"));
        Double crossingX = num(outcome.get("crossing_x"));

        double halfWidth = geometry.corridorHalfWidthM();
        double bodyHalf = geometry.vehicleWidthM() / 2.0;
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("d_corridor_half_width_m", r(halfWidth));

        // --- Người đi bộ và hành lang (từ ped_y) ---
        Double corridorEnter = null;
        Double corridorExit = null;
        Double strictEnter = null;
        Double strictExit = null;
        for (Map<String, Object> f : frames) {
            Double t = num(f.get("t"));
            Double y = num(f.get("ped_y"));
            if (t == null || y == null) {
                continue;
            }
            if (Math.abs(y) <= halfWidth) {
                corridorEnter = corridorEnter == null ? t : corridorEnter;
                corridorExit = t;
            }
            if (Math.abs(y) <= bodyHalf) {
                strictEnter = strictEnter == null ? t : strictEnter;
                strictExit = t;
            }
        }
        d.put("d_ped_corridor_enter_t", r(corridorEnter));
        d.put("d_ped_corridor_exit_t", r(corridorExit));
        d.put("d_ped_strict_overlap_enter_t", r(strictEnter));
        d.put("d_ped_strict_overlap_exit_t", r(strictExit));
        d.put("d_ped_ever_in_corridor", corridorEnter != null);

        // --- Xe qua vạch băng ngang (ego_x là mũi xe) ---
        Double front = null;
        Double rear = null;
        if (crossingX != null) {
            for (Map<String, Object> f : frames) {
                Double t = num(f.get("t"));
                Double x = num(f.get("ego_x"));
                if (t == null || x == null) {
                    continue;
                }
                if (front == null && x >= crossingX) {
                    front = t;
                }
                if (rear == null && x - geometry.vehicleLengthM() >= crossingX) {
                    rear = t;
                }
            }
        }
        d.put("d_veh_front_at_crossing_t", r(front));
        d.put("d_veh_rear_clear_crossing_t", r(rear));
        d.put("d_veh_reached_crossing", front != null);
        d.put("d_pet_s", r(pet(corridorEnter, corridorExit, front, rear)));

        // --- Nếu không phanh (F15, F16) ---
        Double x0 = frames.isEmpty() ? null : num(frames.get(0).get("ego_x"));
        Double v0 = num(metrics.get("ego_initial_speed_mps"));
        Double windowStart = null;
        Double windowEnd = null;
        Boolean conflict = null;
        Boolean fullyObserved = null;
        if (crossingX != null && x0 != null && v0 != null && v0 > 0 && !frames.isEmpty()) {
            windowStart = (crossingX - x0) / v0;
            windowEnd = (crossingX - x0 + geometry.vehicleLengthM()) / v0;
            conflict = conflictWithoutBraking(frames, windowStart, windowEnd, halfWidth);
            Double last = num(frames.get(frames.size() - 1).get("t"));
            fullyObserved = last != null && last >= windowEnd;
        }
        d.put("d_noBrake_vehicle_crossing_window_t", windowStart == null ? null : List.of(r(windowStart), r(windowEnd)));
        d.put("d_noBrake_conflict_by_gt", conflict);
        d.put("d_noBrake_conflict_window_observed_fully", fullyObserved);

        // --- Tại thời điểm quyết định / phát hiện ---
        double tau = orZero(num(params.get("brake_activation_delay")));
        double buildup = orZero(num(params.get("brake_buildup_rate")));
        Double maxDecel = num(params.get("max_deceleration"));
        Double availableMetric = num(metrics.get("decel_available_mps2"));
        Double available = availableMetric == null || maxDecel == null ? null : Math.min(availableMetric, maxDecel);
        Double roadFriction = num(caseDoc.get("road_friction"));
        Double tDecision = num(metrics.get("aeb_decision_t"));
        Double tDetect = num(metrics.get("first_detection_t"));

        Map<String, Object> atDecision = frameNear(frames, tDecision);
        Double vDecision = atDecision == null ? null : num(atDecision.get("ego_v"));
        Double dDecision = atDecision == null || crossingX == null ? null : minus(crossingX, num(atDecision.get("ego_x")));
        Double pedAtDecision = atDecision == null ? null : num(atDecision.get("ped_y"));
        d.put("d_ped_in_corridor_at_decision", pedAtDecision == null ? null : Math.abs(pedAtDecision) <= halfWidth);
        d.put("d_v_at_decision_mps", r(vDecision));
        d.put("d_dist_to_crossing_at_decision_m", r(dDecision));
        d.put("d_required_decel_ideal_mps2", r(idealDecel(vDecision, dDecision)));
        d.put("d_available_decel_mps2", r(available));
        d.put("d_friction_limit_decel_mps2", r(roadFriction == null ? null : roadFriction * GRAVITY));
        Double requiredDistance = vDecision == null || available == null ? null : brakingDistance(vDecision, tau, buildup, available);
        d.put("d_required_braking_distance_m", r(requiredDistance));
        Double marginModel = dDecision == null || requiredDistance == null ? null : dDecision - requiredDistance;
        d.put("d_stopping_margin_model_m", r(marginModel));
        Double marginObserved = stoppedGap(events);
        d.put("d_stopping_margin_observed_m", r(marginObserved));
        d.put("d_margin_model_error_m", r(marginObserved == null || marginModel == null ? null : marginObserved - marginModel));

        Map<String, Object> atDetection = frameNear(frames, tDetect);
        Double dDetection = atDetection == null || crossingX == null ? null : minus(crossingX, num(atDetection.get("ego_x")));
        Double vDetection = atDetection == null ? null : num(atDetection.get("ego_v"));
        d.put("d_dist_to_crossing_at_detection_m", r(dDetection));
        d.put("d_required_decel_ideal_at_detection_mps2", r(idealDecel(vDetection, dDetection)));

        Double requiredAtV0 = v0 == null || available == null ? null : brakingDistance(v0, tau, buildup, available);
        d.put("d_required_braking_distance_at_v0_m", r(requiredAtV0));
        Double latest = null;
        if (crossingX != null && requiredAtV0 != null) {
            for (Map<String, Object> f : frames) {
                Double t = num(f.get("t"));
                Double x = num(f.get("ego_x"));
                if (t != null && x != null && x >= crossingX - requiredAtV0) {
                    latest = t;
                    break;
                }
            }
        }
        d.put("d_latest_feasible_decision_t", r(latest));
        d.put("d_actual_minus_latest_feasible_decision_s", r(tDecision == null || latest == null ? null : tDecision - latest));
        d.put("d_detection_minus_latest_feasible_s", r(tDetect == null || latest == null ? null : tDetect - latest));

        // --- Phanh theo ground truth (F12, F13) ---
        Double brakeOnset = num(metrics.get("brake_onset_t"));
        Double peak = gt.hasEgo() ? peakDecel(gt.ego()) : null;
        Double meanOnsetToEnd = gt.hasEgo() && brakeOnset != null ? meanDecelFrom(gt.ego(), brakeOnset) : null;
        d.put("d_gt_peak_decel_0p1s_mps2", r(peak));
        Double fullBrake = num(carla.get("full_brake_decel"));
        Double cap = maxDecel == null ? null : minOf(maxDecel, roadFriction == null ? null : roadFriction * GRAVITY, fullBrake);
        d.put("d_decel_cap_commanded_mps2", r(cap));
        d.put("d_decel_tracking_error_peak_mps2", r(cap == null || peak == null || brakeOnset == null ? null : cap - peak));
        d.put("d_gt_mean_decel_onset_to_end_mps2", r(meanOnsetToEnd));

        // --- Khoảng hở hình học nhỏ nhất (F14) ---
        double[] clearance = gt.hasEgo() && gt.target() != null && !gt.target().isEmpty() ? minClearance(gt, geometry) : null;
        d.put("d_min_geometric_clearance_m", clearance == null ? null : r(clearance[0]));
        d.put("d_min_geometric_clearance_t", clearance == null ? null : r(clearance[1]));
        return d;
    }

    /** Lý do một cột {@code d_*} là null, để người phân tích phân biệt "không áp dụng" với "thiếu dữ liệu". Chỉ liệt kê cột đang null. */
    public static Map<String, String> nullReasons(Map<String, Object> derived) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : derived.entrySet()) {
            if (e.getValue() == null) {
                out.put(e.getKey(), REASONS.getOrDefault(e.getKey(), "không tính được từ dữ liệu của run này"));
            }
        }
        return out;
    }

    private static final String NO_DECISION = "AEB không ra quyết định (aeb_decision_t = null) hoặc thiếu frame/crossing_x";
    private static final String NO_GT = "không có ground_truth.csv của ego (hoặc quá ngắn)";
    private static final Map<String, String> REASONS = Map.ofEntries(
            Map.entry("d_ped_corridor_enter_t", "người đi bộ không vào hành lang AEB trong run"),
            Map.entry("d_ped_corridor_exit_t", "người đi bộ không vào hành lang AEB trong run"),
            Map.entry("d_ped_strict_overlap_enter_t", "người đi bộ không chạm bề ngang thân xe trong run"),
            Map.entry("d_ped_strict_overlap_exit_t", "người đi bộ không chạm bề ngang thân xe trong run"),
            Map.entry("d_veh_front_at_crossing_t", "mũi xe chưa tới vạch băng ngang trước khi run kết thúc"),
            Map.entry("d_veh_rear_clear_crossing_t", "đuôi xe chưa qua vạch băng ngang trước khi run kết thúc"),
            Map.entry("d_pet_s", "cần cả khoảng người trong hành lang lẫn việc xe đã qua hẳn vạch"),
            Map.entry("d_noBrake_vehicle_crossing_window_t", "thiếu crossing_x, tốc độ đầu hoặc frames"),
            Map.entry("d_noBrake_conflict_by_gt", "thiếu crossing_x, tốc độ đầu hoặc frames"),
            Map.entry("d_noBrake_conflict_window_observed_fully", "thiếu crossing_x, tốc độ đầu hoặc frames"),
            Map.entry("d_ped_in_corridor_at_decision", NO_DECISION),
            Map.entry("d_v_at_decision_mps", NO_DECISION),
            Map.entry("d_dist_to_crossing_at_decision_m", NO_DECISION),
            Map.entry("d_required_decel_ideal_mps2", NO_DECISION + ", hoặc khoảng tới vạch không dương"),
            Map.entry("d_available_decel_mps2", "thiếu decel_available_mps2 hoặc max_deceleration"),
            Map.entry("d_friction_limit_decel_mps2", "thiếu road_friction"),
            Map.entry("d_required_braking_distance_m", NO_DECISION + ", hoặc thiếu giảm tốc khả dụng"),
            Map.entry("d_stopping_margin_model_m", NO_DECISION + ", hoặc thiếu giảm tốc khả dụng"),
            Map.entry("d_stopping_margin_observed_m", "xe không dừng trước khi run kết thúc (không có sự kiện stopped)"),
            Map.entry("d_margin_model_error_m", "cần cả biên dừng quan sát và biên dừng theo mô hình"),
            Map.entry("d_dist_to_crossing_at_detection_m", "radar chưa phát hiện (first_detection_t = null) hoặc thiếu crossing_x"),
            Map.entry("d_required_decel_ideal_at_detection_mps2", "radar chưa phát hiện hoặc khoảng tới vạch không dương"),
            Map.entry("d_required_braking_distance_at_v0_m", "thiếu tốc độ đầu hoặc giảm tốc khả dụng"),
            Map.entry("d_latest_feasible_decision_t", "xe không tới mốc muộn nhất trước khi run kết thúc, hoặc thiếu dữ liệu đầu vào"),
            Map.entry("d_actual_minus_latest_feasible_decision_s", "thiếu quyết định AEB hoặc mốc muộn nhất"),
            Map.entry("d_detection_minus_latest_feasible_s", "thiếu phát hiện hoặc mốc muộn nhất"),
            Map.entry("d_gt_peak_decel_0p1s_mps2", NO_GT),
            Map.entry("d_decel_cap_commanded_mps2", "thiếu max_deceleration"),
            Map.entry("d_decel_tracking_error_peak_mps2", "không phanh (brake_onset_t = null), thiếu giảm tốc đỉnh GT hoặc giới hạn lệnh"),
            Map.entry("d_gt_mean_decel_onset_to_end_mps2", "không phanh (brake_onset_t = null) hoặc " + NO_GT),
            Map.entry("d_min_geometric_clearance_m", "không có ground truth của cả ego và người đi bộ"),
            Map.entry("d_min_geometric_clearance_t", "không có ground truth của cả ego và người đi bộ"));

    /**
     * Quãng cần để dừng tính từ lúc quyết định (CT 31b / F04): trễ τ + 0,10 s ở tốc độ đều, pha tăng lực với tốc độ tăng J, rồi giảm tốc đều a.
     * J = min(buildup, 20). Nếu xe dừng ngay trong pha tăng lực thì quãng là phần của pha đó.
     */
    public static double brakingDistance(double v0, double tau, double buildup, double decel) {
        double jerk = Math.min(buildup > 0 ? buildup : MAX_BUILDUP, MAX_BUILDUP);
        double lead = v0 * (tau + BRAKE_LAG_S);
        if (decel <= 0 || jerk <= 0 || v0 <= 0) {
            return lead;
        }
        double rampT = decel / jerk;
        if (v0 <= decel * rampT / 2.0) {
            double stopT = Math.sqrt(2.0 * v0 / jerk);
            return lead + v0 * stopT - jerk * stopT * stopT * stopT / 6.0;
        }
        double vAfter = v0 - decel * rampT / 2.0;
        return lead + (v0 * rampT - jerk * rampT * rampT * rampT / 6.0) + vAfter * vAfter / (2.0 * decel);
    }

    /** PET (F17): t vào sau − t ra trước giữa khoảng chiếm vạch của xe và khoảng người ở trong hành lang; 0 nếu chồng lấn; null nếu xe chưa qua vạch. */
    static Double pet(Double pedEnter, Double pedExit, Double vehFront, Double vehRear) {
        if (pedEnter == null || pedExit == null || vehFront == null || vehRear == null) {
            return null;
        }
        if (pedEnter >= vehRear) {
            return pedEnter - vehRear;
        }
        if (vehFront >= pedExit) {
            return vehFront - pedExit;
        }
        return 0.0;
    }

    /** F16: có thời điểm trong cửa sổ xe chiếm vạch mà người nằm trong hành lang. Sau khi run kết thúc, ngoại suy tuyến tính theo ped_vy cuối. */
    static boolean conflictWithoutBraking(List<Map<String, Object>> frames, double from, double to, double halfWidth) {
        double lastT = Double.NaN;
        double lastY = Double.NaN;
        double lastVy = 0.0;
        for (Map<String, Object> f : frames) {
            Double t = num(f.get("t"));
            Double y = num(f.get("ped_y"));
            if (t == null || y == null) {
                continue;
            }
            if (!Double.isNaN(lastT) && segmentHits(lastT, lastY, t, y, from, to, halfWidth)) {
                return true;
            }
            lastT = t;
            lastY = y;
            Double vy = num(f.get("ped_vy"));
            lastVy = vy == null ? 0.0 : vy;
        }
        if (Double.isNaN(lastT)) {
            return false;
        }
        if (lastT >= from && lastT <= to && Math.abs(lastY) <= halfWidth) {
            return true;
        }
        if (to > lastT) {
            double start = Math.max(from, lastT);
            return segmentHits(start, lastY + lastVy * (start - lastT), to, lastY + lastVy * (to - lastT), from, to, halfWidth);
        }
        return false;
    }

    /** Đoạn thẳng y(t) từ (t0,y0) đến (t1,y1), cắt với cửa sổ [from,to], có điểm nào thuộc [-halfWidth, halfWidth] không. */
    private static boolean segmentHits(double t0, double y0, double t1, double y1, double from, double to, double halfWidth) {
        double lo = Math.max(t0, from);
        double hi = Math.min(t1, to);
        if (lo > hi) {
            return false;
        }
        double slope = t1 == t0 ? 0.0 : (y1 - y0) / (t1 - t0);
        double ya = y0 + slope * (lo - t0);
        double yb = y0 + slope * (hi - t0);
        return Math.min(ya, yb) <= halfWidth && Math.max(ya, yb) >= -halfWidth;
    }

    /** F12: max_i (v_i − v_j)/(t_j − t_i), j là dòng đầu tiên cách i ít nhất 0,1 s. Độc lập với lõi (chỉ dùng tốc độ ground truth). */
    static Double peakDecel(List<GtRow> ego) {
        Double best = null;
        int j = 0;
        for (int i = 0; i < ego.size(); i++) {
            j = Math.max(j, i + 1);
            while (j < ego.size() && ego.get(j).t() < ego.get(i).t() + DECEL_WINDOW_S - 1e-6) {
                j++;
            }
            if (j >= ego.size()) {
                break;
            }
            double a = (ego.get(i).speed() - ego.get(j).speed()) / (ego.get(j).t() - ego.get(i).t());
            best = best == null ? a : Math.max(best, a);
        }
        return best;
    }

    /** Giảm tốc trung bình từ dòng gần {@code onset} nhất tới dòng cuối của run. */
    static Double meanDecelFrom(List<GtRow> ego, double onset) {
        GtRow start = ego.get(0);
        for (GtRow row : ego) {
            if (Math.abs(row.t() - onset) < Math.abs(start.t() - onset)) {
                start = row;
            }
        }
        GtRow end = ego.get(ego.size() - 1);
        return end.t() > start.t() ? (start.speed() - end.speed()) / (end.t() - start.t()) : null;
    }

    /** F14: khoảng cách nhỏ nhất từ tâm người tới hình chữ nhật của xe theo ground truth. Trả về {giá trị, thời điểm}. */
    static double[] minClearance(GroundTruth gt, Geometry geometry) {
        Map<Integer, GtRow> pedByFrame = new HashMap<>();
        for (GtRow row : gt.target()) {
            pedByFrame.put(row.frame(), row);
        }
        double halfLength = geometry.clearanceLength() / 2.0;
        double halfWidth = geometry.clearanceWidth() / 2.0;
        double best = Double.POSITIVE_INFINITY;
        double bestT = Double.NaN;
        for (GtRow ego : gt.ego()) {
            GtRow ped = pedByFrame.get(ego.frame());
            if (ped == null) {
                continue;
            }
            double yaw = Math.toRadians(ego.yawDeg());
            double dx = ped.x() - ego.x();
            double dy = ped.y() - ego.y();
            double lon = dx * Math.cos(yaw) + dy * Math.sin(yaw);
            double lat = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
            double clear = Py.hypot(Math.max(0.0, Math.abs(lon) - halfLength), Math.max(0.0, Math.abs(lat) - halfWidth));
            if (clear < best) {
                best = clear;
                bestT = ego.t();
            }
        }
        return Double.isInfinite(best) ? null : new double[] {best, bestT};
    }

    /** F07: a = v²/(2D), chỉ khi D > 0. */
    private static Double idealDecel(Double v, Double distance) {
        return v == null || distance == null || distance <= 0 ? null : v * v / (2.0 * distance);
    }

    /** Khoảng cách mũi xe–người lúc xe dừng, từ sự kiện {@code stopped}. */
    private static Double stoppedGap(List<Map<String, Object>> events) {
        for (Map<String, Object> e : events) {
            if ("stopped".equals(e.get("kind"))) {
                return num(e.get("gap_m"));
            }
        }
        return null;
    }

    private static Map<String, Object> frameNear(List<Map<String, Object>> frames, Double t) {
        if (t == null || frames.isEmpty()) {
            return null;
        }
        Map<String, Object> best = null;
        double bestGap = Double.POSITIVE_INFINITY;
        for (Map<String, Object> f : frames) {
            Double ft = num(f.get("t"));
            if (ft != null && Math.abs(ft - t) < bestGap) {
                bestGap = Math.abs(ft - t);
                best = f;
            }
        }
        return best;
    }

    private static Double minOf(double first, Double second, Double third) {
        double m = first;
        if (second != null) {
            m = Math.min(m, second);
        }
        if (third != null) {
            m = Math.min(m, third);
        }
        return m;
    }

    private static Double minus(Double a, Double b) {
        return a == null || b == null ? null : a - b;
    }

    private static double orZero(Double v) {
        return v == null ? 0.0 : v;
    }

    private static Double r(Double v) {
        return v == null || v.isNaN() || v.isInfinite() ? null : Py.round(v, DIGITS);
    }

    private static Number r(double v) {
        return Py.round(v, DIGITS);
    }

    static Double num(Object value) {
        return value instanceof Number n && Double.isFinite(n.doubleValue()) ? n.doubleValue() : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>(items.size());
        for (Object item : items) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }
}
