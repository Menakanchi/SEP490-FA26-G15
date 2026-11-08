package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Vs.InvalidRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.service.common.LlmService;

/**
 * Bước 1 của vòng MVP: câu mô tả tiếng Việt → LLM → Scenario IR (FE-06).
 * <ul>
 *   <li>{@link #isTooVagueToGenerate} chặn câu rác trước khi tốn một lượt LLM;</li>
 *   <li>LLM hỏng thì lùi về trích xuất bằng luật ({@link #ruleBased}) — không bao giờ bịa số;</li>
 *   <li>IR sai thì cho LLM sửa tối đa {@value #MAX_REPAIRS} lần; mọi giá trị không có trong câu được liệt kê rõ là *giả định*.</li>
 * </ul>
 * Nhận diện category Euro NCAP (ADR-050): người đi bộ băng ngang và xe phía trước CCRs/CCRm/CCRb dựng được họ kịch bản; nhóm còn lại
 * (CPLA, TURNING, CUT_IN) được gọi đúng tên nhưng báo "chưa hỗ trợ" thay vì "không phải người đi bộ".
 */
@Slf4j
@Service
public class DescribeService {

    static final String MOTIF = "pedestrian_crossing";
    static final String LEAD_MOTIF = FamilyService.LEAD_MOTIF;
    static final List<String> CATEGORIES = ScenarioRules.CATEGORIES;
    /** Tên tiếng Việt của category cho thông báo. */
    static final Map<String, String> CATEGORY_LABELS = Json.obj(
            "CP_CROSSING", "người đi bộ băng ngang", "CCRS", "xe phía trước đứng yên", "CCRM", "xe phía trước chạy chậm hơn",
            "CCRB", "xe phía trước phanh gấp", "CPLA", "người đi bộ đi dọc cùng chiều", "TURNING", "xe rẽ cắt hướng", "CUT_IN", "xe cắt vào làn")
            .entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, e -> String.valueOf(e.getValue()), (a, b) -> a,
                    LinkedHashMap::new));
    static final int MAX_REPAIRS = 3;
    static final String TOO_VAGUE_MESSAGE = "Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.";

    private static final Map<String, double[]> BOUNDS = FamilyService.IR_BOUNDS;
    /** Giá trị giả định khi câu không nói tới (IR phải đủ trường để chạy được). */
    private static final Map<String, Object> DEFAULTS = Json.obj(
            "ego_speed_kmh", 50.0, "trigger_distance_m", 30.0, "pedestrian_speed_mps", 1.5,
            "stops_at_curb", false, "weather", "CLEAR", "time_of_day", "DAY");
    /** key -> {nhãn, đơn vị}, theo thứ tự hiển thị. */
    private static final Map<String, String[]> FIELD_META = new LinkedHashMap<>();

    /** Trường của nhóm xe phía trước (ADR-050), theo thứ tự hiển thị. */
    private static final Map<String, String[]> LEAD_FIELD_META = new LinkedHashMap<>();
    private static final Map<String, double[]> LEAD_BOUNDS = com.vsos.core.bridge.Bundle.LEAD_BOUNDS;

    static {
        LEAD_FIELD_META.put("ego_speed_kmh", new String[]{"Tốc độ xe ego", "km/h"});
        LEAD_FIELD_META.put("target_speed_kmh", new String[]{"Tốc độ xe phía trước", "km/h"});
        LEAD_FIELD_META.put("initial_distance_m", new String[]{"Khoảng cách ban đầu", "m"});
        LEAD_FIELD_META.put("target_decel_mps2", new String[]{"Gia tốc phanh xe phía trước", "m/s²"});
        LEAD_FIELD_META.put("lateral_overlap_pct", new String[]{"Độ chồng lấn ngang", "%"});
        LEAD_FIELD_META.put("weather", new String[]{"Thời tiết", ""});
        LEAD_FIELD_META.put("time_of_day", new String[]{"Thời điểm", ""});
    }

    /** Giá trị giả định của nhóm xe phía trước khi câu không nói tới (theo khoảng thử Euro NCAP, làm tròn). */
    static Map<String, Object> leadDefaults(String category) {
        return Json.obj("ego_speed_kmh", 50.0,
                "target_speed_kmh", "CCRM".equals(category) ? 20.0 : "CCRB".equals(category) ? 50.0 : 0.0,
                "initial_distance_m", "CCRB".equals(category) ? 12.0 : 40.0,
                "target_decel_mps2", "CCRB".equals(category) ? -6.0 : null,
                "lateral_overlap_pct", 100.0, "weather", "CLEAR", "time_of_day", "DAY");
    }

    static {
        FIELD_META.put("ego_speed_kmh", new String[]{"Tốc độ xe ego", "km/h"});
        FIELD_META.put("trigger_distance_m", new String[]{"Khoảng cách kích hoạt", "m"});
        FIELD_META.put("pedestrian_speed_mps", new String[]{"Tốc độ người đi bộ", "m/s"});
        FIELD_META.put("stops_at_curb", new String[]{"Người đi bộ dừng ở lề", ""});
        FIELD_META.put("weather", new String[]{"Thời tiết", ""});
        FIELD_META.put("time_of_day", new String[]{"Thời điểm", ""});
    }

    static final String SYSTEM_PROMPT = """
            Bạn trích xuất Scenario IR cho VehicSim — nền tảng kiểm thử hệ thống phanh khẩn cấp (AEB).
            Trước hết xác định category Euro NCAP của tình huống (trường category):
            - CP_CROSSING: người đi bộ băng ngang hoặc đứng ở mép đường phía trước xe (kiểu CPNA).
            - CCRS: xe phía trước cùng làn đang đứng yên / đỗ / chết máy.
            - CCRM: xe phía trước cùng làn chạy chậm hơn xe ego.
            - CCRB: xe phía trước cùng làn đang chạy thì phanh gấp.
            - CPLA: người đi bộ đi dọc đường cùng chiều xe. TURNING: xe rẽ cắt ngang hướng đi. CUT_IN: xe khác cắt / chen vào làn.
            Người đi bộ dùng các trường trigger_distance_m, pedestrian_speed_mps, stops_at_curb.
            Xe phía trước dùng target_speed_kmh (km/h; CCRS = 0), initial_distance_m (khoảng cách ban đầu, chỉ lấy khi có con số),
            target_decel_mps2 (CCRB, số âm, m/s²), lateral_overlap_pct (100 = thẳng hàng, 50 = lệch nửa xe, ≤ 0 = xe ở làn bên).

            Quy tắc:
            1. Chỉ điền giá trị mà câu mô tả NÓI RÕ hoặc suy ra trực tiếp từ từ ngữ. Không bịa. Trường nào câu không nhắc thì để null.
            2. Đơn vị: tốc độ xe ego theo km/h; tốc độ người đi bộ theo m/s; khoảng cách theo mét. Đổi đơn vị nếu câu dùng đơn vị khác.
            3. Suy luận định tính được phép, nhưng phải ghi tên trường vào inferred_fields:
               đi bộ/đi chậm ≈ 1.4 m/s, đi nhanh ≈ 2.0 m/s, chạy/lao ra ≈ 3.0 m/s.
               Khoảng cách chỉ lấy khi câu có con số; không suy từ chữ như "đột ngột", "sát đầu xe".
            4. weather: trời quang/nắng → CLEAR, nhiều mây/âm u → CLOUDY, mưa/mưa nhỏ → RAIN, mưa to/mưa lớn/giông → HEAVY_RAIN, sương mù → FOG.
               time_of_day: ban ngày → DAY, chạng vạng/hoàng hôn/sáng sớm → DUSK, ban đêm/buổi tối → NIGHT.
            5. stops_at_curb: người đi bộ dừng lại ở mép đường/lề, đứng chờ, không bước vào làn → true; băng qua/sang đường/lao ra → false.
            6. is_pedestrian_crossing = true khi và chỉ khi category = CP_CROSSING. Người đi bộ đứng hoặc dừng ở mép đường, không sang
               đường, VẪN là CP_CROSSING (stops_at_curb=true) — đây là ca bắt buộc để đo phanh oan.
            7. Chi tiết không biểu diễn được (xe đỗ che khuất, nhiều người, đường cong...) ghi ngắn vào notes.

            Ví dụ: "Xe VF8 chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra từ lề phải khi xe còn cách 25 m"
            → is_pedestrian_crossing=true, ego_speed_kmh=60, trigger_distance_m=25, pedestrian_speed_mps=3.0, stops_at_curb=false,
              weather=RAIN, time_of_day=NIGHT, inferred_fields=["pedestrian_speed_mps"].
            Ví dụ: "Người đi bộ đứng ở mép đường rồi dừng lại, không sang đường; xe chạy 40 km/h"
            → is_pedestrian_crossing=true, ego_speed_kmh=40, stops_at_curb=true, các trường còn lại null.
            Ví dụ: "Xe chạy 60 km/h, xe tải phía trước đang chạy 40 km/h thì phanh gấp 6 m/s², cách 20 m, trời mưa"
            → category=CCRB, is_pedestrian_crossing=false, ego_speed_kmh=60, target_speed_kmh=40, target_decel_mps2=-6, initial_distance_m=20,
              weather=RAIN, các trường còn lại null.""";

    private final LlmService llm;

    public DescribeService(LlmService llm) {
        this.llm = llm;
    }

    /** Câu rác: quá ngắn, quá ít từ, hoặc chỉ là một con số — chặn trước khi gọi LLM. */
    static boolean isTooVagueToGenerate(String prompt) {
        String text = prompt.strip();
        return text.length() < 10 || text.split("\\s+").length < 3 || text.chars().allMatch(Character::isDigit);
    }

    /** JSON Schema của đầu ra có cấu trúc mà LLM phải trả (``DescribedScenario``). */
    static Map<String, Object> schema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("is_pedestrian_crossing", Json.obj("type", "boolean", "description",
                "True nếu có xe ego và người đi bộ băng ngang hoặc đứng ở mép đường phía trước — kể cả khi người đi bộ dừng lại ở lề, "
                        + "không sang đường (đó là biến thể stops_at_curb=true của cùng motif)."));
        props.put("category", Json.obj("enum", CATEGORIES, "description", "Category Euro NCAP của tình huống."));
        props.put("title", Json.obj("type", List.of("string", "null"), "description", "Tên ngắn gọn tiếng Việt cho kịch bản, tối đa 80 ký tự."));
        props.put("ego_speed_kmh", Json.obj("type", List.of("number", "null"), "description", "Tốc độ xe ego, km/h."));
        props.put("trigger_distance_m", Json.obj("type", List.of("number", "null"), "description",
                "Khoảng cách từ xe ego tới điểm băng qua lúc người đi bộ bắt đầu đi, mét."));
        props.put("pedestrian_speed_mps", Json.obj("type", List.of("number", "null"), "description", "Tốc độ người đi bộ, m/s."));
        props.put("stops_at_curb", Json.obj("type", List.of("boolean", "null"), "description",
                "True nếu người đi bộ dừng lại ở mép đường/lề, không đi vào làn xe."));
        props.put("target_speed_kmh", Json.obj("type", List.of("number", "null"), "description", "Tốc độ xe phía trước, km/h (CCRS = 0)."));
        props.put("initial_distance_m", Json.obj("type", List.of("number", "null"), "description",
                "Khoảng cách ban đầu từ mũi xe ego tới đuôi xe phía trước, mét."));
        props.put("target_decel_mps2", Json.obj("type", List.of("number", "null"), "description", "CCRB: gia tốc phanh của xe phía trước, số âm, m/s²."));
        props.put("lateral_overlap_pct", Json.obj("type", List.of("number", "null"), "description",
                "Độ chồng lấn ngang với xe ego, % (100 thẳng hàng, ≤ 0 xe ở làn bên)."));
        List<Object> weathers = new ArrayList<>(FamilyService.WEATHERS);
        weathers.add(null);
        List<Object> times = new ArrayList<>(FamilyService.TIMES);
        times.add(null);
        props.put("weather", Json.obj("enum", weathers));
        props.put("time_of_day", Json.obj("enum", times));
        props.put("inferred_fields", Json.obj("type", "array", "items", Json.obj("type", "string"), "description",
                "Tên các trường suy ra từ từ ngữ định tính (vd. 'chạy' → tốc độ), không có con số trong câu."));
        props.put("notes", Json.obj("type", List.of("string", "null"), "description",
                "Chi tiết trong câu mà IR của MVP không biểu diễn được (xe khác, đường cong...)."));
        return Json.obj("type", "object", "properties", props, "required", List.of("category", "is_pedestrian_crossing"));
    }

    // ------------------------------------------------------------------ kiểm tra IR

    /** Chuẩn hoá + kiểm kiểu một đối tượng IR do LLM trả (như ``DescribedScenario.model_validate``). Lỗi vào {@code issues}. */
    static Map<String, Object> validate(Map<String, Object> raw, List<String> issues) {
        Map<String, Object> ir = new LinkedHashMap<>();
        Object crossing = raw.get("is_pedestrian_crossing");
        Object category = raw.get("category");
        if (category != null && !CATEGORIES.contains(String.valueOf(category))) {
            issues.add("category: Input should be " + CATEGORIES);
            category = null;
        }
        if (category == null && crossing instanceof Boolean b) {
            category = b ? ScenarioRules.CP_CROSSING : null; // IR kiểu cũ chỉ có cờ người đi bộ
        }
        if (category == null && !(crossing instanceof Boolean)) {
            issues.add("is_pedestrian_crossing: Field required");
        } else if (category == null) {
            issues.add("category: Field required");
        }
        ir.put("category", category == null ? null : String.valueOf(category));
        ir.put("is_pedestrian_crossing", ScenarioRules.CP_CROSSING.equals(ir.get("category")) || Boolean.TRUE.equals(crossing) && category == null);
        ir.put("title", raw.get("title") == null ? null : String.valueOf(raw.get("title")));
        for (String key : List.of("ego_speed_kmh", "trigger_distance_m", "pedestrian_speed_mps", "target_speed_kmh", "initial_distance_m",
                "target_decel_mps2", "lateral_overlap_pct")) {
            Object v = raw.get(key);
            if (v != null && !(v instanceof Number)) {
                issues.add(key + ": Input should be a valid number");
                v = null;
            }
            ir.put(key, v == null ? null : ((Number) v).doubleValue());
        }
        Object stops = raw.get("stops_at_curb");
        if (stops != null && !(stops instanceof Boolean)) {
            issues.add("stops_at_curb: Input should be a valid boolean");
            stops = null;
        }
        ir.put("stops_at_curb", stops);
        Object weather = raw.get("weather");
        if (weather != null && !FamilyService.WEATHERS.contains(String.valueOf(weather))) {
            issues.add("weather: Input should be " + FamilyService.WEATHERS);
            weather = null;
        }
        ir.put("weather", weather);
        Object tod = raw.get("time_of_day");
        if (tod != null && !FamilyService.TIMES.contains(String.valueOf(tod))) {
            issues.add("time_of_day: Input should be " + FamilyService.TIMES);
            tod = null;
        }
        ir.put("time_of_day", tod);
        List<Object> inferred = raw.get("inferred_fields") instanceof List ? Json.asList(raw.get("inferred_fields")) : List.of();
        ir.put("inferred_fields", new ArrayList<>(inferred.stream().map(String::valueOf).toList()));
        ir.put("notes", raw.get("notes") == null ? null : String.valueOf(raw.get("notes")));
        return ir;
    }

    /** Lỗi khiến IR không dựng được họ kịch bản (rỗng = hợp lệ). */
    static List<String> check(Map<String, Object> ir) {
        List<String> issues = new ArrayList<>();
        boolean lead = isLead(ir);
        Map<String, double[]> bounds = lead ? LEAD_BOUNDS : BOUNDS;
        Map<String, String[]> metas = lead ? LEAD_FIELD_META : FIELD_META;
        for (Map.Entry<String, double[]> b : bounds.entrySet()) {
            Double value = (Double) ir.get(b.getKey());
            if (value != null && (value < b.getValue()[0] || value > b.getValue()[1])) {
                String[] meta = metas.get(b.getKey());
                issues.add((meta[0] + " = " + FamilyService.g(value) + " " + meta[1] + " nằm ngoài khoảng [" + FamilyService.g(b.getValue()[0]) + ", "
                        + FamilyService.g(b.getValue()[1]) + "] " + meta[1]).strip());
            }
        }
        List<String> unknown = Json.asList(ir.get("inferred_fields")).stream().map(String::valueOf)
                .filter(f -> !FIELD_META.containsKey(f) && !LEAD_FIELD_META.containsKey(f)).toList();
        if (!unknown.isEmpty()) {
            issues.add("inferred_fields có tên trường không tồn tại: " + unknown);
        }
        return issues;
    }

    static boolean isLead(Map<String, Object> ir) {
        return ir.get("category") != null && com.vsos.core.simulation.LeadVehicleCase.CATEGORIES.contains(String.valueOf(ir.get("category")));
    }

    // ------------------------------------------------------------------ đường lui bằng luật

    /** Category theo từ khoá (văn bản đã bỏ dấu). Người đi bộ băng ngang ưu tiên như trước; {@code null} = không nhận ra. */
    static String ruleCategory(String t) {
        boolean pedestrian = has("nguoi\\s+di\\s+bo|nguoi\\s+qua\\s+duong|bo\\s+hanh|khach\\s+bo\\s+hanh", t);
        if (pedestrian) {
            return has("di\\s+doc|cung\\s+chieu|di\\s+ven\\s+duong|di\\s+men\\s+duong", t) && !has("bang\\s+qua|sang\\s+duong|qua\\s+duong", t)
                    ? "CPLA" : ScenarioRules.CP_CROSSING;
        }
        if (has("cat\\s+(vao\\s+)?lan|chen\\s+(vao\\s+)?lan|tat\\s+dau|lan\\s+sang\\s+lan|danh\\s+lai\\s+vao", t)) {
            return "CUT_IN";
        }
        if (has("\\bre\\s+(trai|phai)|queo|cat\\s+mat|cat\\s+ngang\\s+(dau|huong)", t)) {
            return "TURNING";
        }
        if (has("xe\\s+(o\\s+)?(phia\\s+)?truoc|xe\\s+dang\\s+truoc|xe\\s+dau\\s+phia\\s+truoc|xe\\s+(tai|con|buyt|khach)\\s+(o\\s+)?(phia\\s+)?truoc", t)) {
            if (has("phanh\\s+(gap|dot\\s+ngot|manh|khan\\s+cap)|thang\\s+gap|dung\\s+dot\\s+ngot", t)) {
                return "CCRB";
            }
            if (has("dung\\s+yen|dang\\s+dung|dung\\s+do|do\\s+(xe|ben|giua|tren)|\\bdo\\s+lai|chet\\s+may|hong\\s+xe|xe\\s+hong", t)) {
                return "CCRS";
            }
            if (has("chay\\s+cham|di\\s+cham|chay\\s+deu|dang\\s+chay|chay\\s+voi", t)) {
                return "CCRM";
            }
            return "CCRS";
        }
        return null;
    }

    private static String plain(String text) {
        String s = Normalizer.normalize(text.toLowerCase(), Normalizer.Form.NFD).replace("đ", "d");
        return s.replaceAll("\\p{Mn}", "");
    }

    private static final String NUM = "(\\d+(?:[.,]\\d+)?)";

    private static Double num(String pattern, String text) {
        Matcher m = Pattern.compile(pattern).matcher(text);
        return m.find() ? Double.parseDouble(m.group(1).replace(",", ".")) : null;
    }

    private static boolean has(String pattern, String text) {
        return Pattern.compile(pattern).matcher(text).find();
    }

    /** Trích xuất bằng regex/từ khoá — kém LLM nhưng không bao giờ bịa số. */
    static Map<String, Object> ruleBased(String text) {
        String t = plain(text);
        List<Object> inferred = new ArrayList<>();
        Double pedSpeed = num(NUM + "\\s*m\\s*/\\s*s", t);
        if (pedSpeed == null) {
            if (has("\\b(chay|lao)\\s+(ra|qua|sang)", t)) {
                pedSpeed = 3.0;
                inferred.add("pedestrian_speed_mps");
            } else if (has("\\bdi\\s+bo\\s+(cham|tu tu)|\\bdi\\s+cham", t)) {
                pedSpeed = 1.4;
                inferred.add("pedestrian_speed_mps");
            }
        }
        String weather = null;
        String[][] weatherRules = {
                {"mua\\s+(to|lon|nang hat)|giong", "HEAVY_RAIN"}, {"\\bmua\\b", "RAIN"}, {"suong\\s+mu", "FOG"},
                {"nhieu\\s+may|am\\s+u", "CLOUDY"}, {"troi\\s+(quang|nang)|nang\\s+dep", "CLEAR"}};
        for (String[] rule : weatherRules) {
            if (has(rule[0], t)) {
                weather = rule[1];
                break;
            }
        }
        String timeOfDay = null;
        String[][] timeRules = {
                {"ban\\s+dem|buoi\\s+toi|\\bdem\\b|troi\\s+toi", "NIGHT"}, {"chang\\s+vang|hoang\\s+hon|sang\\s+som", "DUSK"},
                {"ban\\s+ngay|buoi\\s+sang|buoi\\s+chieu|giua\\s+trua", "DAY"}};
        for (String[] rule : timeRules) {
            if (has(rule[0], t)) {
                timeOfDay = rule[1];
                break;
            }
        }
        Boolean stops = null;
        if (has("dung\\s+(lai\\s+)?(o\\s+)?(mep|le|via)|khong\\s+(sang|qua)\\s+duong|dung\\s+cho", t)) {
            stops = true;
        } else if (has("bang\\s+qua|sang\\s+duong|qua\\s+duong|lao\\s+ra|chay\\s+ra", t)) {
            stops = false;
        }
        Map<String, Object> ir = new LinkedHashMap<>();
        String category = ruleCategory(t);
        ir.put("is_pedestrian_crossing", has("nguoi\\s+di\\s+bo|nguoi\\s+qua\\s+duong|bo\\s+hanh|khach\\s+bo\\s+hanh", t));
        ir.put("category", category);
        ir.put("title", null);
        ir.put("ego_speed_kmh", num(NUM + "\\s*km\\s*/?\\s*h", t));
        // "m" đứng riêng (không phải m/s, km, mm): "cách 25 m", "25m"
        ir.put("trigger_distance_m", num(NUM + "\\s*m(?:et)?\\b(?!\\s*/)", t));
        ir.put("pedestrian_speed_mps", pedSpeed);
        ir.put("stops_at_curb", stops);
        ir.put("weather", weather);
        ir.put("time_of_day", timeOfDay);
        if (category != null && com.vsos.core.simulation.LeadVehicleCase.CATEGORIES.contains(category)) {
            // Xe phía trước: số km/h thứ nhất là ego, thứ hai là xe trước; "cách N m" là khoảng cách ban đầu; "N m/s2" là mức phanh.
            List<Double> speeds = nums(NUM + "\\s*km\\s*/?\\s*h", t);
            ir.put("ego_speed_kmh", speeds.isEmpty() ? null : speeds.get(0));
            ir.put("target_speed_kmh", "CCRS".equals(category) ? Double.valueOf(0.0) : speeds.size() > 1 ? speeds.get(1) : null);
            ir.put("initial_distance_m", ir.get("trigger_distance_m"));
            ir.put("trigger_distance_m", null);
            Double decel = num(NUM + "\\s*m\\s*/\\s*s\\s*(?:2|²|\\^2)", t);
            ir.put("target_decel_mps2", "CCRB".equals(category) && decel != null ? -Math.abs(decel) : null);
            ir.put("pedestrian_speed_mps", null);
            ir.put("stops_at_curb", null);
            ir.put("lateral_overlap_pct", has("lan\\s+ben|lan\\s+canh|lan\\s+khac", t) ? Double.valueOf(-100.0) : null);
            inferred.clear();
        }
        ir.put("inferred_fields", inferred);
        ir.put("notes", null);
        return ir;
    }

    private static List<Double> nums(String pattern, String text) {
        List<Double> out = new ArrayList<>();
        Matcher m = Pattern.compile(pattern).matcher(text);
        while (m.find()) {
            out.add(Double.parseDouble(m.group(1).replace(",", ".")));
        }
        return out;
    }

    // ------------------------------------------------------------------ gọi LLM + vòng sửa

    private record LlmOutcome(Map<String, Object> ir, int repairs, List<String> issues, double costUsd, int calls, boolean escalated) {
    }

    private LlmOutcome askLlm(String text) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(LlmService.message("system", SYSTEM_PROMPT));
        messages.add(LlmService.message("user", "Mô tả kịch bản: " + text));
        Map<String, Object> ir = null;
        List<String> issues = new ArrayList<>();
        double cost = 0;
        int calls = 0;
        boolean escalated = false;
        for (int attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
            LlmService.Call call = llm.callWithEscalation(messages, schema());
            calls++;
            cost += call.costUsd();
            escalated |= call.escalated();
            issues = new ArrayList<>();
            ir = validate(call.result(), issues);
            if (issues.isEmpty()) {
                issues = check(ir);
            }
            if (issues.isEmpty()) {
                return new LlmOutcome(ir, attempt, List.of(), cost, calls, escalated);
            }
            if (attempt == MAX_REPAIRS) {
                break;
            }
            messages.add(LlmService.message("assistant", Json.write(call.result())));
            messages.add(LlmService.message("user", "Kết quả trên chưa hợp lệ: " + String.join("; ", issues)
                    + ". Hãy trả lại IR đã sửa. Trường nào câu không nói rõ thì để null."));
        }
        return new LlmOutcome(ir, MAX_REPAIRS, issues, cost, calls, escalated);
    }

    /** Câu mô tả → IR đầy đủ (điền giả định) + nguồn gốc từng trường. */
    public Map<String, Object> describe(String rawText) {
        String text = rawText == null ? "" : rawText.strip();
        if (isTooVagueToGenerate(text)) {
            throw new InvalidRequestException(TOO_VAGUE_MESSAGE);
        }

        String source = "llm";
        String model = null;
        String llmError = null;
        int repairs = 0;
        List<String> issues = List.of();
        double cost = 0;
        int llmCalls = 0;
        Map<String, Object> ir;
        try {
            LlmOutcome out = askLlm(text);
            ir = out.ir();
            repairs = out.repairs();
            issues = out.issues();
            cost = out.costUsd();
            llmCalls = out.calls();
            model = out.escalated() ? llm.properties().escalated() : llm.properties().primaryModel();
        } catch (RuntimeException e) { // mọi lỗi LLM đều lùi về luật
            log.warn("describe: LLM không dùng được, lùi về luật: {}", e.getMessage());
            ir = ruleBased(text);
            source = "rules";
            String msg = String.valueOf(e.getMessage());
            llmError = msg.length() > 300 ? msg.substring(0, 300) : msg;
        }

        Object category = ir.get("category");
        if (category == null && Boolean.TRUE.equals(ir.get("is_pedestrian_crossing"))) {
            category = ScenarioRules.CP_CROSSING;
        }
        if (category == null) {
            throw new InvalidRequestException("Không nhận ra loại tình huống trong mô tả. Hiện chạy được: người đi bộ băng ngang, xe phía trước đứng yên, "
                    + "chạy chậm hoặc phanh gấp — hãy mô tả xe ego gặp một trong các đối tượng đó.");
        }
        if (!ScenarioRules.SIMULATED.contains(category.toString())) {
            throw new InvalidRequestException("Đã nhận diện là " + category + " (" + CATEGORY_LABELS.get(category.toString()) + ") — loại này chưa có bộ mô phỏng. "
                    + "Hiện chạy được: người đi bộ băng ngang, xe phía trước đứng yên / chạy chậm / phanh gấp.");
        }
        if (isLead(ir)) {
            return describeLead(category.toString(), ir, source, model, llmError, repairs, issues, cost, llmCalls);
        }

        Set<String> inferred = new LinkedHashSet<>(Json.asList(ir.get("inferred_fields")).stream().map(String::valueOf).toList());
        List<Map<String, Object>> fields = new ArrayList<>();
        Map<String, Object> values = new LinkedHashMap<>();
        List<String> assumed = new ArrayList<>();
        for (Map.Entry<String, String[]> meta : FIELD_META.entrySet()) {
            String key = meta.getKey();
            Object value = ir.get(key);
            String origin = inferred.contains(key) && value != null ? "inferred" : "stated";
            if (value == null) {
                value = DEFAULTS.get(key);
                origin = "assumed";
                assumed.add(key);
            }
            values.put(key, value);
            fields.add(Json.obj("key", key, "label", meta.getValue()[0], "value", value, "unit", meta.getValue()[1], "origin", origin));
        }
        Map<String, Object> irOut = new LinkedHashMap<>();
        irOut.put("motif", MOTIF);
        irOut.putAll(values);
        String title = ir.get("title") == null ? "" : String.valueOf(ir.get("title")).strip();
        title = title.length() > 80 ? title.substring(0, 80) : title;
        return Json.obj(
                "motif", MOTIF,
                "category", ScenarioRules.CP_CROSSING,
                "source", source,
                "model", model,
                "llm_error", llmError,
                "repairs", repairs,
                "issues", issues,
                "title", title.isEmpty() ? "Người đi bộ băng ngang" : title,
                "notes", ir.get("notes"),
                "ir", irOut,
                "fields", fields,
                "assumed", assumed,
                "cost_usd", Vs.round(cost, 9),
                "llm_calls", llmCalls,
                "weathers", FamilyService.WEATHERS,
                "times", FamilyService.TIMES);
    }

    /** Kết quả mô tả cho nhóm xe phía trước (ADR-050): cùng hình dạng với người đi bộ, thêm {@code category}. */
    private Map<String, Object> describeLead(String category, Map<String, Object> ir, String source, String model, String llmError, int repairs,
                                             List<String> issues, double cost, int llmCalls) {
        Set<String> inferred = new LinkedHashSet<>(Json.asList(ir.get("inferred_fields")).stream().map(String::valueOf).toList());
        Map<String, Object> defaults = leadDefaults(category);
        List<Map<String, Object>> fields = new ArrayList<>();
        Map<String, Object> values = new LinkedHashMap<>();
        List<String> assumed = new ArrayList<>();
        for (Map.Entry<String, String[]> meta : LEAD_FIELD_META.entrySet()) {
            String key = meta.getKey();
            if (key.equals("target_decel_mps2") && !"CCRB".equals(category)) {
                continue;
            }
            Object value = key.equals("target_speed_kmh") && "CCRS".equals(category) ? Double.valueOf(0.0) : ir.get(key);
            String origin = inferred.contains(key) && value != null ? "inferred" : "stated";
            if (value == null) {
                value = defaults.get(key);
                origin = "assumed";
                assumed.add(key);
            }
            values.put(key, value);
            fields.add(Json.obj("key", key, "label", meta.getValue()[0], "value", value, "unit", meta.getValue()[1], "origin", origin));
        }
        Map<String, Object> irOut = new LinkedHashMap<>();
        irOut.put("motif", LEAD_MOTIF);
        irOut.put("category", category);
        irOut.putAll(values);
        String title = ir.get("title") == null ? "" : String.valueOf(ir.get("title")).strip();
        title = title.length() > 80 ? title.substring(0, 80) : title;
        String label = CATEGORY_LABELS.get(category);
        return Json.obj(
                "motif", LEAD_MOTIF,
                "category", category,
                "source", source,
                "model", model,
                "llm_error", llmError,
                "repairs", repairs,
                "issues", issues,
                "title", title.isEmpty() ? Character.toUpperCase(label.charAt(0)) + label.substring(1) : title,
                "notes", ir.get("notes"),
                "ir", irOut,
                "fields", fields,
                "assumed", assumed,
                "cost_usd", Vs.round(cost, 9),
                "llm_calls", llmCalls,
                "weathers", FamilyService.WEATHERS,
                "times", FamilyService.TIMES);
    }
}
