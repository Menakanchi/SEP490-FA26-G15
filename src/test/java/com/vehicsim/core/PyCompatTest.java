package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Bản Java của {@code random}, {@code round}, định dạng số và {@code hypot} phải trùng CPython trên fixture sinh từ lõi Python (ADR-042). */
class PyCompatTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    static <T> T fixture(String name, TypeReference<T> type) throws IOException {
        try (InputStream in = PyCompatTest.class.getResourceAsStream("/parity/" + name)) {
            assertThat(in).as("thiếu fixture parity/" + name).isNotNull();
            return MAPPER.readValue(in, type);
        }
    }

    @Test
    void randomSequencesMatchCPythonForEverySeed() throws IOException {
        List<Map<String, Object>> cases = fixture("rng.json", new TypeReference<>() { });
        assertThat(cases).hasSizeGreaterThan(10);
        List<String> bitMismatches = new ArrayList<>();
        for (Map<String, Object> c : cases) {
            long seed = ((Number) c.get("seed")).longValue();
            PyRandom rng = new PyRandom(seed);
            List<?> ops = (List<?>) c.get("ops");
            List<?> values = (List<?>) c.get("values");
            for (int i = 0; i < ops.size(); i++) {
                String op = (String) ops.get(i);
                double expected = ((Number) values.get(i)).doubleValue();
                if (op.equals("r")) {
                    assertThat(rng.random()).as("seed %d random() #%d", seed, i).isEqualTo(expected);
                } else {
                    double actual = rng.gauss(0.0, Double.parseDouble(op.substring(1)));
                    // gauss dùng cos/sin/log: chấp nhận lệch vài ulp (libm khác nhau), nhưng báo số ca lệch từng bit.
                    assertThat(actual).as("seed %d gauss #%d", seed, i).isCloseTo(expected, org.assertj.core.data.Offset.offset(4 * Math.ulp(expected)));
                    if (Double.doubleToLongBits(actual) != Double.doubleToLongBits(expected)) {
                        bitMismatches.add(seed + "#" + i);
                    }
                }
            }
        }
        System.out.println("gauss lệch từng bit so với CPython: " + bitMismatches.size() + " " + bitMismatches);
    }

    @Test
    void roundMatchesPythonIncludingTiesAndNegativeZero() throws IOException {
        List<Map<String, Object>> cases = fixture("round.json", new TypeReference<>() { });
        assertThat(cases).hasSizeGreaterThan(1000);
        for (Map<String, Object> c : cases) {
            double x = Double.parseDouble((String) c.get("x"));
            int n = ((Number) c.get("n")).intValue();
            String expected = (String) c.get("expected");
            if (n == 0) {
                assertThat(Py.round(x)).as("round(%s)", c.get("x")).isEqualTo(Long.parseLong(expected));
            } else {
                assertThat(Py.reprFloat(Py.round(x, n))).as("round(%s, %d)", c.get("x"), n).isEqualTo(expected);
            }
        }
    }

    @Test
    void fixedAndGMatchPythonFormatting() throws IOException {
        List<Map<String, String>> cases = fixture("format.json", new TypeReference<>() { });
        assertThat(cases).hasSizeGreaterThan(1000);
        for (Map<String, String> c : cases) {
            double x = Double.parseDouble(c.get("x"));
            String spec = c.get("spec");
            String actual = spec.equals("g") ? Py.g(x) : Py.fixed(x, Integer.parseInt(spec.substring(1, 2)));
            assertThat(actual).as("format(%s, '%s')", c.get("x"), spec).isEqualTo(c.get("expected"));
        }
    }

    @Test
    void hypotAndTanMatchCPython() throws IOException {
        Map<String, Object> libm = fixture("libm.json", new TypeReference<>() { });
        List<Map<String, String>> hypot = MAPPER.convertValue(libm.get("hypot"), new TypeReference<>() { });
        assertThat(hypot).hasSizeGreaterThan(1000);
        List<String> off = new ArrayList<>();
        for (Map<String, String> c : hypot) {
            double actual = Py.hypot(Double.parseDouble(c.get("a")), Double.parseDouble(c.get("b")));
            if (Double.doubleToLongBits(actual) != Double.doubleToLongBits(Double.parseDouble(c.get("expected")))) {
                off.add(c.get("a") + "," + c.get("b"));
            }
        }
        assertThat(off).as("hypot lệch CPython").isEmpty();
        List<Map<String, String>> tan = MAPPER.convertValue(libm.get("tan"), new TypeReference<>() { });
        for (Map<String, String> c : tan) {
            double x = Double.parseDouble(c.get("x"));
            assertThat(x).isEqualTo(Math.PI * 10.0 * dtOf(c.get("x")));
            assertThat(StrictMath.tan(x)).as("tan(%s)", c.get("x")).isEqualTo(Double.parseDouble(c.get("expected")));
        }
    }

    /** Ngược lại {@code pi * 10 * dt} để chắc hằng số bộ lọc được dựng cùng công thức với Python. */
    private static double dtOf(String piTen) {
        double x = Double.parseDouble(piTen);
        for (double dt : new double[] {0.01, 0.05, 0.02, 0.1}) {
            if (Math.PI * 10.0 * dt == x) {
                return dt;
            }
        }
        throw new AssertionError("không suy được dt từ " + piTen);
    }

    @Test
    void reprFollowsPython() {
        assertThat(Py.repr(null)).isEqualTo("None");
        assertThat(Py.repr(true)).isEqualTo("True");
        assertThat(Py.repr(1.5)).isEqualTo("1.5");
        assertThat(Py.repr(100.0)).isEqualTo("100.0");
        assertThat(Py.repr(1e16)).isEqualTo("1e+16");
        assertThat(Py.repr(0.0001)).isEqualTo("0.0001");
        assertThat(Py.repr(0.00001)).isEqualTo("1e-05");
        assertThat(Py.repr("abc")).isEqualTo("'abc'");
        assertThat(Py.repr("it's")).isEqualTo("\"it's\"");
        assertThat(Py.repr(List.of(1, "a"))).isEqualTo("[1, 'a']");
    }
}
