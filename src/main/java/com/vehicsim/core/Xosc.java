package com.vehicsim.core;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

/**
 * OpenSCENARIO của VehicSim: đọc metadata {@code vs_*} và profile thời gian từ file {@code .xosc} — port 1:1 từ {@code read_xosc} / {@code read_profile} của
 * {@code worker/openscenario_export.py} (ADR-042), kể cả thông báo lỗi. XML là cảnh thực thi; {@code ParameterDeclarations} giữ seed/AEB/xe/nguồn để controller
 * tái dùng đúng lõi của dự án.
 */
public final class Xosc {

    public static final String FORMAT = "vehicsim.xosc/v3";
    public static final String SIMULATOR_SUFFIX = "-xosc3";
    /** v3: bước mô phỏng 0,01 s (100 Hz, kế hoạch 20/10 D3); perception/quyết định AEB vẫn theo chu kỳ cảm biến 0,05 s. */
    public static final double STEP_S = 0.01;
    public static final double PERCEPTION_PERIOD_S = 0.05;
    /** v2 (20 Hz) chỉ còn để chạy lại bằng chứng cũ ngoài web; backend không tạo run mới bằng profile này và không ghép với v3. */
    public static final String LEGACY_FORMAT = "vehicsim.xosc/v2";
    public static final String LEGACY_SIMULATOR_SUFFIX = "-xosc2";
    public static final double LEGACY_STEP_S = 0.05;
    public static final List<String> SOURCE_KEYS = List.of("run_id", "scenario_id", "scenario_version_id", "aeb_version_id", "carla_vehicle_model_id");

    private static final Pattern FLOAT = Pattern.compile("[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?");
    private static final Pattern INTEGER = Pattern.compile("[+-]?\\d+");

    private Xosc() {
    }

    /** (hậu tố định danh simulator, bước mô phỏng s, chu kỳ perception s) theo định dạng của file. */
    public record Profile(String suffix, double stepS, double perceptionPeriodS) {
    }

    /** Mọi {@code ParameterDeclaration} của file, bỏ tiền tố {@code vs_}, giữ thứ tự khai báo. */
    public static Map<String, String> parameters(String xml) {
        Document doc;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(null);
            doc = builder.parse(new InputSource(new StringReader(xml)));
        } catch (ParserConfigurationException | SAXException | IOException e) {
            throw new Bundle.BundleError("File .xosc không phải XML hợp lệ: " + e.getMessage());
        }
        Map<String, String> values = new LinkedHashMap<>();
        for (Node child = doc.getDocumentElement().getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element declarations && declarations.getTagName().equals("ParameterDeclarations")) {
                for (Node p = declarations.getFirstChild(); p != null; p = p.getNextSibling()) {
                    if (p instanceof Element param && param.getTagName().equals("ParameterDeclaration")) {
                        String name = param.getAttribute("name");
                        values.put(name.startsWith("vs_") ? name.substring(3) : name, param.getAttribute("value"));
                    }
                }
            }
        }
        return values;
    }

    public static Map<String, String> parameters(Path file) {
        return parameters(readFile(file));
    }

    private static String readFile(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new Bundle.BundleError("Không đọc được file .xosc: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ hành vi float()/int() của Python, kèm thông báo lỗi

    /** {@code KeyError} của Python khi thiếu khóa: {@code str(KeyError('x'))} = {@code 'x'}. */
    private static final class MissingKey extends RuntimeException {
        MissingKey(String key) {
            super(Py.repr(key));
        }
    }

    private static String need(Map<String, String> values, String key) {
        String v = values.get(key);
        if (v == null) {
            throw new MissingKey(key);
        }
        return v;
    }

    private static double pyFloat(String raw) {
        String t = raw.strip();
        String lower = t.toLowerCase(java.util.Locale.ROOT);
        switch (lower.startsWith("+") || lower.startsWith("-") ? lower.substring(1) : lower) {
            case "nan":
                return Double.NaN;
            case "inf", "infinity":
                return lower.startsWith("-") ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;
            default:
                break;
        }
        if (!FLOAT.matcher(t).matches()) {
            throw new NumberFormatException("could not convert string to float: " + Py.repr(raw));
        }
        return Double.parseDouble(t);
    }

    private static long pyInt(String raw) {
        String t = raw.strip();
        if (!INTEGER.matcher(t).matches()) {
            throw new NumberFormatException("invalid literal for int() with base 10: " + Py.repr(raw));
        }
        BigInteger big = new BigInteger(t.startsWith("+") ? t.substring(1) : t);
        if (big.bitLength() > 63) {
            throw new NumberFormatException("seed ngoài khoảng 64 bit: " + Py.repr(raw));
        }
        return big.longValue();
    }

    private static double num(Map<String, String> values, String key) {
        return pyFloat(need(values, key));
    }

    // ------------------------------------------------------------------ đọc

    public static Bundle.RunSpec read(Path file) {
        return read(readFile(file));
    }

    /** {@code .xosc} → {@link Bundle.RunSpec}, qua cùng bộ kiểm của bundle (khoảng giá trị, tham số AEB, vật lý xe). */
    public static Bundle.RunSpec read(String xml) {
        Map<String, String> values = parameters(xml);
        String format = values.get("format");
        if ("vehicsim.xosc/v1".equals(format)) {
            throw new Bundle.BundleError("File .xosc v1 có hướng đi bộ cũ; cần xuất lại từ web để chạy người đi bộ băng ngang đường");
        }
        if (!FORMAT.equals(format) && !LEGACY_FORMAT.equals(format)) {
            throw new Bundle.BundleError("Cần file .xosc VehicSim xuất từ web (thiếu vs_format)");
        }
        try {
            Map<String, Object> variant = new LinkedHashMap<>();
            for (String key : List.of("ego_speed_kmh", "trigger_distance_m", "pedestrian_speed_mps")) {
                variant.put(key, num(values, key));
            }
            variant.put("friction", need(values, "friction").isEmpty() ? null : (Object) num(values, "friction"));
            variant.put("stops_at_curb", need(values, "stops_at_curb").equals("true"));
            variant.put("weather", need(values, "weather"));
            variant.put("time_of_day", need(values, "time_of_day"));

            Map<String, Object> physics = new LinkedHashMap<>();
            for (String key : List.of("mass", "drag_coefficient")) {
                if (values.containsKey("physics_" + key)) {
                    physics.put(key, num(values, "physics_" + key));
                }
            }
            Map<String, Object> center = new LinkedHashMap<>();
            for (String key : List.of("x", "y", "z")) {
                if (values.containsKey("center_of_mass_" + key)) {
                    center.put(key, num(values, "center_of_mass_" + key));
                }
            }
            if (!center.isEmpty()) {
                physics.put("center_of_mass", center);
            }
            Map<String, Object> source = new LinkedHashMap<>();
            for (String key : SOURCE_KEYS) {
                if (values.containsKey(key)) {
                    source.put(key, pyInt(values.get(key)));
                }
            }
            if (values.containsKey("source_simulator")) {
                source.put("simulator", values.get("source_simulator"));
            }
            // Thứ tự đánh giá như dict literal của bản Python (seed, rồi nhãn AEB, rồi tham số AEB, rồi xe) để khi có nhiều lỗi thì báo cùng lỗi đầu tiên.
            long seed = pyInt(need(values, "seed"));
            Map<String, Object> aeb = new LinkedHashMap<>();
            String label = need(values, "aeb_label");
            aeb.put("label", label.isEmpty() ? null : label);
            Map<String, Object> aebParams = new LinkedHashMap<>();
            for (String code : AebParams.CODES) {
                aebParams.put(code, num(values, code));
            }
            aeb.put("params", aebParams);

            Map<String, Object> vehicle = new LinkedHashMap<>();
            String name = need(values, "vehicle_name");
            vehicle.put("name", name.isEmpty() ? null : name);
            for (String key : List.of("length_m", "width_m", "max_brake_decel_mps2")) {
                vehicle.put(key, num(values, "vehicle_" + key));
            }
            Map<String, Object> carla = new LinkedHashMap<>();
            if (need(values, "carla_configured").equals("true")) {
                carla.put("blueprint", need(values, "blueprint"));
                carla.put("physics", physics);
                Map<String, Object> dimensions = new LinkedHashMap<>();
                for (String key : List.of("height_m", "wheelbase_m")) {
                    if (values.containsKey("dimension_" + key)) {
                        dimensions.put(key, num(values, "dimension_" + key));
                    }
                }
                carla.put("dimensions", dimensions);
                if (values.containsKey(Bundle.FULL_BRAKE_DECEL)) {
                    carla.put(Bundle.FULL_BRAKE_DECEL, num(values, Bundle.FULL_BRAKE_DECEL));
                }
            }
            vehicle.put("carla", carla);

            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("variant", variant);
            doc.put("seed", seed);
            doc.put("source", source);
            doc.put("aeb", aeb);
            doc.put("vehicle", vehicle);
            return Bundle.readSpec(doc);
        } catch (MissingKey | NumberFormatException | Bundle.BundleError e) { // BundleError là ValueError của Python: bị bọc như bản gốc
            throw new Bundle.BundleError("Metadata .xosc không hợp lệ: " + e.getMessage());
        }
    }

    public static Profile profile(Path file) {
        return profile(readFile(file));
    }

    public static Profile profile(String xml) {
        Map<String, String> values = parameters(xml);
        if (LEGACY_FORMAT.equals(values.get("format"))) {
            return new Profile(LEGACY_SIMULATOR_SUFFIX, LEGACY_STEP_S, LEGACY_STEP_S);
        }
        if (!FORMAT.equals(values.get("format"))) {
            throw new Bundle.BundleError("Cần file .xosc VehicSim xuất từ web (thiếu vs_format)");
        }
        double step;
        double period;
        try {
            step = num(values, "fixed_delta_seconds");
            period = num(values, "perception_period_s");
        } catch (MissingKey | NumberFormatException e) {
            throw new Bundle.BundleError("Metadata thời gian .xosc không hợp lệ: " + e.getMessage());
        }
        if (!(0 < step && step <= period) || Math.abs(Py.round(period / step) * step - period) > 1e-9) {
            throw new Bundle.BundleError("Bước " + Py.reprFloat(step) + " s và chu kỳ perception " + Py.reprFloat(period) + " s không tương thích");
        }
        return new Profile(SIMULATOR_SUFFIX, step, period);
    }
}
