import com.vsos.core.common.MiniJson;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tạo tài khoản có role cao (mặc định ADMIN) cho backend Java và, với {@code --seed}, dữ liệu mặc định.
 *
 * <p>Tự đăng ký luôn ra EXPERIENCER (ADR-035), nên chương trình làm hai việc: đăng ký qua API (backend phải đang chạy)
 * rồi đổi role bằng SQL trong container {@code mysql} của docker compose. Chạy lại nhiều lần không sao: tài khoản
 * đã có thì chỉ đổi role. Chạy từ gốc repo bằng source-file mode của JDK 21, dùng {@code MiniJson} của lõi
 * (cần {@code target/classes}, có sẵn khi backend chạy từ repo hoặc sau {@code mvnw compile}):
 *
 * <pre>
 *   java -cp target/classes scripts/CreateAdmin.java --email admin@example.com --seed
 *   java -cp target/classes scripts/CreateAdmin.java --email boss@example.com --role MANAGER
 * </pre>
 */
public class CreateAdmin {

    static final Set<String> ROLES = Set.of("ADMIN", "MANAGER", "ENGINEER", "REVIEWER", "EXPERIENCER");
    static final Pattern SAFE_EMAIL = Pattern.compile("^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$");
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

    record Reply(int status, Map<String, Object> body) {}

    public static void main(String[] argv) throws Exception {
        Map<String, String> args = parseArgs(argv);
        String email = args.get("email");
        String role = args.getOrDefault("role", "ADMIN");
        String name = args.getOrDefault("name", "Admin VehicSim");
        String api = args.getOrDefault("api", "http://localhost:8001").replaceAll("/+$", "");
        boolean seed = args.containsKey("seed");
        String service = args.getOrDefault("compose-service", "mysql");
        String database = args.getOrDefault("database", "vehicsim");

        if (email == null) fail("Thiếu --email.");
        if (!SAFE_EMAIL.matcher(email).matches()) fail("Email không hợp lệ.");
        if (!ROLES.contains(role)) fail("--role phải là một trong " + ROLES + ".");
        if (seed && !role.equals("ADMIN")) fail("--seed cần --role ADMIN.");
        String password = args.containsKey("password") ? args.get("password") : askPassword();
        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < 8 || bytes > 72) fail("Mật khẩu phải từ 8 đến 72 byte.");

        String[] parts = name.trim().split("\\s+");
        Map<String, Object> register = new LinkedHashMap<>();
        register.put("email", email);
        register.put("password", password);
        register.put("lastName", parts[0]);
        register.put("firstName", parts[parts.length - 1]);
        Reply reply = post(api + "/api/v1/auth/register", register, null);
        switch (reply.status()) {
            case 200 -> System.out.println("Đã tạo tài khoản " + email + ".");
            case 400 -> System.out.println("Tài khoản " + email + " đã có hoặc dữ liệu không hợp lệ ("
                    + reply.body().getOrDefault("detail", "") + ") — chỉ đổi role.");
            case 429 -> fail("Backend đang giới hạn tần suất đăng ký; thử lại sau ít phút.");
            default -> fail("Đăng ký thất bại (HTTP " + reply.status() + "): " + reply.body());
        }

        setRole(email, role, service, database);
        System.out.println("Đã đặt role " + role + " cho " + email + ".");

        if (seed) {
            Reply login = post(api + "/api/v1/auth/login", Map.of("email", email, "password", password), null);
            if (login.status() != 200) fail("Đăng nhập để seed thất bại (HTTP " + login.status() + "): " + login.body());
            Reply boot = post(api + "/api/v1/vehicsim/bootstrap", Map.of(), (String) login.body().get("access_token"));
            if (boot.status() != 200) fail("Seed thất bại (HTTP " + boot.status() + "): " + boot.body());
            System.out.println("Dữ liệu mặc định: " + (Boolean.TRUE.equals(boot.body().get("created")) ? "đã tạo" : "đã có sẵn")
                    + " (project " + boot.body().get("project_id") + ")");
        }
    }

    static Map<String, String> parseArgs(String[] argv) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < argv.length; i++) {
            String a = argv[i];
            if (a.equals("-h") || a.equals("--help")) {
                System.out.println("java -cp target/classes scripts/CreateAdmin.java --email <email> [--password <pw>] "
                        + "[--name \"Họ Tên\"] [--role ADMIN|MANAGER|ENGINEER|REVIEWER|EXPERIENCER] [--api http://localhost:8001] "
                        + "[--seed] [--compose-service mysql] [--database vehicsim]");
                System.exit(0);
            }
            if (!a.startsWith("--")) fail("Tham số lạ: " + a);
            String key = a.substring(2);
            if (key.equals("seed")) {
                out.put(key, "true");
            } else {
                if (i + 1 >= argv.length) fail("Thiếu giá trị cho " + a);
                out.put(key, argv[++i]);
            }
        }
        return out;
    }

    static String askPassword() throws IOException {
        if (System.console() != null) {
            char[] chars = System.console().readPassword("Mật khẩu (8–72 ký tự): ");
            return chars == null ? "" : new String(chars);
        }
        System.out.print("Mật khẩu (8–72 ký tự): ");
        String line = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
        return line == null ? "" : line;
    }

    @SuppressWarnings("unchecked")
    static Reply post(String url, Object body, String token) throws InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(MiniJson.write(body), StandardCharsets.UTF_8));
        if (token != null) request.header("Authorization", "Bearer " + token);
        try {
            HttpResponse<String> response = HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            Map<String, Object> parsed = Map.of();
            try {
                Object value = response.body().isBlank() ? Map.of() : MiniJson.parse(response.body());
                if (value instanceof Map<?, ?> map) parsed = (Map<String, Object>) map;
            } catch (RuntimeException ignored) {
                // body không phải JSON (vd. trang lỗi proxy): chỉ còn status
            }
            return new Reply(response.statusCode(), parsed);
        } catch (ConnectException e) {
            fail("Không gọi được " + url + ". Backend đã chạy chưa? (./mvnw spring-boot:run)");
        } catch (IOException e) {
            fail("Không gọi được " + url + ": " + e.getMessage());
        }
        return null;
    }

    static String rootPassword() throws IOException {
        String env = System.getenv("MYSQL_ROOT_PASSWORD");
        if (env != null && !env.isEmpty()) return env;
        Path envFile = Path.of(".env");
        if (Files.isRegularFile(envFile)) {
            for (String line : Files.readAllLines(envFile, StandardCharsets.UTF_8)) {
                if (line.startsWith("MYSQL_ROOT_PASSWORD=")) {
                    return line.substring(line.indexOf('=') + 1).trim().replaceAll("^\"|\"$", "");
                }
            }
        }
        return "vehicsim_root";
    }

    static void setRole(String email, String role, String service, String database) throws Exception {
        String lower = email.toLowerCase();
        List<String> base = List.of("docker", "compose", "exec", "-T", "-e", "MYSQL_PWD=" + rootPassword(), service,
                "mysql", "-uroot", "-N", database, "-e");
        Result update = run(with(base, "UPDATE users SET role_id = (SELECT id FROM roles WHERE code = '" + role
                + "') WHERE email = '" + lower + "'; SELECT ROW_COUNT();"));
        if (update.code() != 0) fail("Đổi role thất bại: " + (update.err().isBlank() ? update.out() : update.err()).strip());
        // ROW_COUNT() = 0 cũng xảy ra khi tài khoản đã đúng role; chỉ báo lỗi khi không có tài khoản.
        Result exists = run(with(base, "SELECT COUNT(*) FROM users WHERE email = '" + lower + "'"));
        List<String> lines = exists.out().strip().lines().toList();
        if (lines.isEmpty() || !lines.get(lines.size() - 1).strip().equals("1")) fail("Không thấy tài khoản " + email + " trong DB.");
    }

    record Result(int code, String out, String err) {}

    static List<String> with(List<String> base, String last) {
        List<String> out = new ArrayList<>(base);
        out.add(last);
        return out;
    }

    static Result run(List<String> command) throws Exception {
        Process process = new ProcessBuilder(command).start();
        process.getOutputStream().close();
        String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String err = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
        return new Result(process.waitFor(), out, err);
    }

    static void fail(String message) {
        System.err.println(message);
        System.exit(1);
    }
}
