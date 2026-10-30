package com.vsos.backend;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Giữ tài liệu cho agent không mục (TD-33, thay {@code tests/test_agent_docs.py}): bản đồ ngắn, link còn sống,
 * tên test trong tài liệu sống còn tồn tại, từ điển dữ liệu phủ hết bảng/cột, mọi ADR nằm trong mục lục.
 * Chỉ đọc file nên không cần Spring, MySQL hay Redis.
 */
class RepoDocsTest {

    private static final Path ROOT = Path.of(".").toAbsolutePath().normalize();
    private static final int MAX_AGENTS_LINES = 150;

    private static final Pattern LINK = Pattern.compile("\\[[^\\]]*]\\(([^)\\s]+)\\)");
    private static final Pattern HEADING = Pattern.compile("^#{1,6}\\s+(.+?)\\s*$", Pattern.MULTILINE);
    private static final Pattern PY_TEST_REF = Pattern.compile("`(test_[a-z0-9_]+)`");
    private static final Pattern PY_TEST_DEF = Pattern.compile("^\\s*(?:async\\s+)?def\\s+(test_[a-z0-9_]+)", Pattern.MULTILINE);
    /** {@code `RegressionDecisionTest`} hoặc {@code `RegressionDecisionTest#aFailedTestCanNeverBeAccepted`}. */
    private static final Pattern JAVA_TEST_REF = Pattern.compile("`([A-Z][A-Za-z0-9]*Test)(?:#([A-Za-z0-9_]+))?`");

    private static String read(Path p) throws IOException {
        return Files.readString(p);
    }

    private static List<Path> walk(Path root, String glob) throws IOException {
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        try (Stream<Path> s = Files.walk(root)) {
            return s.filter(p -> p.getFileSystem().getPathMatcher("glob:" + glob).matches(p.getFileName())).sorted().toList();
        }
    }

    private static String rel(Path p) {
        return ROOT.relativize(p.toAbsolutePath().normalize()).toString().replace('\\', '/');
    }

    private static List<Path> agentDocs() throws IOException {
        List<Path> docs = new ArrayList<>();
        docs.add(ROOT.resolve("AGENTS.md"));
        docs.addAll(walk(ROOT.resolve("docs/vehicsim"), "*.md"));
        docs.addAll(walk(ROOT.resolve("docs/exec-plans"), "*.md"));
        for (Path adr : walk(ROOT.resolve("docs/adr"), "ADR-0*.md")) {
            String name = adr.getFileName().toString();
            if (name.matches("ADR-0(2[3-9]|3\\d|4\\d)-.*")) {
                docs.add(adr);
            }
        }
        return docs.stream().distinct().sorted().toList();
    }

    /** Anchor kiểu GitHub: chữ thường, bỏ dấu câu, khoảng trắng thành '-'. Giữ chữ có dấu. */
    static String slug(String heading) {
        return heading.strip().toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}\\p{M}_\\- ]", "").replace(' ', '-');
    }

    private static Set<String> anchors(Path md) throws IOException {
        Set<String> out = new HashSet<>();
        Matcher m = HEADING.matcher(read(md));
        while (m.find()) {
            out.add(slug(m.group(1)));
        }
        return out;
    }

    @Test
    void agentsMdStaysAMapNotAManual() throws IOException {
        long lines = read(ROOT.resolve("AGENTS.md")).chars().filter(c -> c == '\n').count();
        assertThat(lines).as("AGENTS.md quá dài — chuyển chi tiết sang docs/ và chỉ để link").isLessThanOrEqualTo(MAX_AGENTS_LINES);
    }

    @Test
    void relativeLinksAndAnchorsResolve() throws IOException {
        List<String> broken = new ArrayList<>();
        for (Path doc : agentDocs()) {
            Matcher m = LINK.matcher(read(doc));
            while (m.find()) {
                String target = m.group(1);
                if (target.matches("^[a-z]+:.*")) { // http:, https:, mailto:
                    continue;
                }
                int hash = target.indexOf('#');
                String filePart = hash < 0 ? target : target.substring(0, hash);
                String anchor = hash < 0 ? "" : target.substring(hash + 1);
                Path dest = filePart.isEmpty() ? doc : doc.getParent().resolve(filePart).normalize();
                if (!Files.exists(dest)) {
                    broken.add(rel(doc) + " -> " + target + " (không có file)");
                } else if (!anchor.isEmpty() && Files.isRegularFile(dest) && dest.toString().endsWith(".md")
                        && !anchors(dest).contains(anchor.toLowerCase(Locale.ROOT))) {
                    broken.add(rel(doc) + " -> " + target + " (không có heading #" + anchor + ")");
                }
            }
        }
        assertThat(broken).as("link chết trong tài liệu").isEmpty();
    }

    /** Tài liệu sống (bản đồ + kiến trúc) chỉ được nhắc tới test còn tồn tại; exec plan là lịch sử nên không kiểm. */
    @Test
    void everyTestNamedInTheLivingDocsExists() throws IOException {
        Set<String> pythonTests = new HashSet<>();
        for (Path py : walk(ROOT.resolve("worker/tests"), "*.py")) {
            Matcher m = PY_TEST_DEF.matcher(read(py));
            while (m.find()) {
                pythonTests.add(m.group(1));
            }
        }
        List<Path> javaTests = walk(ROOT.resolve("src/test/java"), "*Test.java");

        List<String> missing = new ArrayList<>();
        for (Path doc : List.of(ROOT.resolve("AGENTS.md"), ROOT.resolve("docs/vehicsim/architecture.md"))) {
            String text = read(doc);
            Matcher py = PY_TEST_REF.matcher(text);
            while (py.find()) {
                if (!pythonTests.contains(py.group(1))) {
                    missing.add(rel(doc) + ": " + py.group(1) + " (không có trong worker/tests)");
                }
            }
            Matcher jv = JAVA_TEST_REF.matcher(text);
            while (jv.find()) {
                String cls = jv.group(1);
                String method = jv.group(2);
                Path file = javaTests.stream().filter(p -> p.getFileName().toString().equals(cls + ".java")).findFirst().orElse(null);
                if (file == null) {
                    missing.add(rel(doc) + ": " + cls + " (không có lớp test)");
                } else if (method != null && !Pattern.compile("void\\s+" + method + "\\s*\\(").matcher(read(file)).find()) {
                    missing.add(rel(doc) + ": " + cls + "#" + method + " (không có phương thức)");
                }
            }
        }
        assertThat(missing).as("tài liệu nhắc tới test không còn tồn tại (đổi tên test thì sửa tài liệu)").isEmpty();
    }

    /** Thêm bảng/cột vào 01_schema.sql mà quên từ điển dữ liệu thì đỏ. */
    @Test
    void schemaDocCoversEveryTableAndColumn() throws IOException {
        String sql = read(ROOT.resolve("database/mysql/01_schema.sql")).replace("\r\n", "\n");
        String doc = read(ROOT.resolve("docs/vehicsim/database-schema.md")).replace("\r\n", "\n") + "\n#";
        Pattern section = Pattern.compile("^#### `(\\w+)`.*?\\n(.*?)(?=^#{1,4} )", Pattern.MULTILINE | Pattern.DOTALL);
        java.util.Map<String, String> sections = new java.util.HashMap<>();
        Matcher sm = section.matcher(doc);
        while (sm.find()) {
            sections.put(sm.group(1), sm.group(2));
        }
        List<String> missing = new ArrayList<>();
        Matcher tm = Pattern.compile("^CREATE TABLE (\\w+) \\((.*?)\\n\\) ENGINE", Pattern.MULTILINE | Pattern.DOTALL).matcher(sql);
        int tables = 0;
        while (tm.find()) {
            tables++;
            String table = tm.group(1);
            String body = sections.get(table);
            if (body == null) {
                missing.add(table);
                continue;
            }
            Matcher cm = Pattern.compile("^\\s{2}([a-z][a-z0-9_]*)\\s+[A-Z]", Pattern.MULTILINE).matcher(tm.group(2));
            while (cm.find()) {
                String column = cm.group(1);
                if (!column.equals("constraint") && !body.contains("| `" + column + "` |")) {
                    missing.add(table + "." + column);
                }
            }
        }
        assertThat(tables).as("số bảng đọc được từ 01_schema.sql").isGreaterThanOrEqualTo(25);
        assertThat(missing).as("docs/vehicsim/database-schema.md thiếu").isEmpty();
    }

    @Test
    void everyAdrFileIsListedInTheIndex() throws IOException {
        String index = read(ROOT.resolve("docs/adr/README.md"));
        List<String> unlisted = walk(ROOT.resolve("docs/adr"), "ADR-*.md").stream()
                .map(p -> p.getFileName().toString())
                .filter(name -> !index.contains("(" + name + ")"))
                .toList();
        assertThat(unlisted).as("ADR chưa có trong docs/adr/README.md").isEmpty();
    }
}
