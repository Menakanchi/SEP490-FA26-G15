package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.util.zip.ZipFile;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Read-only directory/ZIP adapter. Never extracts or repairs an artifact. */
public final class RawArtifactAdapter implements AutoCloseable {
    private static final Pattern RUN = Pattern.compile("^(runs|runs_aeboff)/([^/]+)/rep(\\d+)_a(\\d+)/(?:result\\.json|sensors/.*)$");
    private final Path root;
    private final ZipFile zip;
    private final Set<String> paths = new TreeSet<>();
    private final Map<String, Map<String, Object>> manifest = new LinkedHashMap<>();
    private final List<Issue> indexIssues = new ArrayList<>();

    public RawArtifactAdapter(Path input) throws IOException {
        root = input.toAbsolutePath().normalize();
        zip = Files.isDirectory(root) ? null : new ZipFile(root.toFile(), StandardCharsets.UTF_8);
        if (zip != null) {
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                String path = entries.nextElement().getName();
                safe(path);
                if (!paths.add(path)) throw new IOException("Duplicate ZIP entry: " + path);
            }
        } else try (var files = Files.walk(root)) {
            files.filter(Files::isRegularFile).forEach(p -> paths.add(root.relativize(p).toString().replace('\\', '/')));
        }
        if (paths.contains("manifest.csv")) {
            try {
                for (Map<String, Object> row : ArtifactCsv.read(text("manifest.csv"))) {
                    String path = Objects.toString(row.get("path_in_zip"), "");
                    safe(path);
                    if (manifest.putIfAbsent(path, row) != null)
                        indexIssues.add(new Issue(Status.CONFLICTING, "DUPLICATE_MANIFEST_IDENTITY",
                                new SourceRef("manifest.csv", "path_in_zip=" + path), "Duplicate manifest member"));
                }
            } catch (IllegalArgumentException e) {
                indexIssues.add(new Issue(Status.INVALID, "MANIFEST_SCHEMA_INVALID",
                        new SourceRef("manifest.csv", ""), e.getMessage()));
            }
        }
    }

    public List<String> runDirectories() {
        Set<String> dirs = new TreeSet<>();
        Set<String> candidates = new TreeSet<>(paths); candidates.addAll(manifest.keySet());
        for (String path : candidates) {
            Matcher m = RUN.matcher(path);
            if (m.matches()) dirs.add(m.group(1) + "/" + m.group(2) + "/rep" + m.group(3) + "_a" + m.group(4));
        }
        return List.copyOf(dirs);
    }

    public Run read(String directory) throws IOException {
        Matcher m = RUN.matcher(directory + "/result.json");
        if (!m.matches()) throw new IllegalArgumentException("Unsupported run directory: " + directory);
        String caseDir = m.group(2);
        String key = caseDir + "-R" + m.group(3) + ("1".equals(m.group(4)) ? "" : "-A" + m.group(4));
        String caseKey = caseDir.replaceFirst("-OFF$", "");
        Map<String, Artifact> artifacts = new LinkedHashMap<>();
        for (String file : List.of("result.json", "sensors/frames.csv", "sensors/ground_truth.csv", "sensors/collisions.json",
                "sensors/summary.json", "lifecycle.json", "core/vsos-core.jar")) {
            String name = file.substring(file.lastIndexOf('/') + 1).replaceFirst("\\.(json|csv|jar)$", "");
            artifacts.put(name, load(directory + "/" + file, key));
        }
        artifacts.put("bundle", load(m.group(1) + "/" + caseDir + "/bundle.json", key));
        artifacts.put("environment", load(m.group(1) + "/environment.json", key));
        artifacts.put("metadata", load("metadata/runs_manifest_subset.jsonl", key));
        artifacts.put("case_manifest", load("metadata/case_manifest_subset.csv", key));
        artifacts.put("manifest", load("manifest.csv", key));
        List<Issue> issues = new ArrayList<>(indexIssues);
        for (Artifact artifact : artifacts.values()) {
            Map<String, Object> row = manifest.get(artifact.id());
            if (row == null) continue;
            SourceRef ref = new SourceRef("manifest.csv", "path_in_zip=" + artifact.id());
            for (var pair : Map.of("run_id", key, "case_id", caseKey, "rep", m.group(3), "attempt", m.group(4)).entrySet()) {
                if (row.get(pair.getKey()) != null && !pair.getValue().equals(row.get(pair.getKey()).toString()))
                    issues.add(new Issue(Status.CONFLICTING, "INCONSISTENT_IDENTITY", ref, pair.getKey() + " disagrees with member path"));
            }
        }
        return new Run(key, caseKey, directory, artifacts, issues);
    }

    private Artifact load(String path, String key) throws IOException {
        safe(path);
        SourceRef ref = new SourceRef(path, "");
        String type = path.endsWith(".csv") ? "text/csv" : path.endsWith(".jar") ? "application/java-archive"
                : path.endsWith(".jsonl") ? "application/x-ndjson" : "application/json";
        String uri = zip == null ? path : root.getFileName() + "!/" + path;
        if (!paths.contains(path)) return new Artifact(path, key, uri, null, type, Integrity.UNVERIFIED, null,
                List.of(new Issue(Status.UNKNOWN, "SOURCE_MISSING", ref, path)));
        byte[] bytes = bytes(path);
        String hash = sha256(bytes);
        List<Issue> issues = new ArrayList<>();
        Map<String, Object> row = manifest.get(path);
        Object expected = row == null ? null : row.get("sha256");
        Integrity integrity = expected == null ? Integrity.UNVERIFIED : hash.equals(expected) ? Integrity.VERIFIED : Integrity.FAILED;
        if (integrity == Integrity.FAILED) issues.add(new Issue(Status.INVALID, "HASH_MISMATCH", ref, "Byte SHA256 differs from manifest"));
        if (row != null && row.get("size_bytes") != null && !Long.toString(bytes.length).equals(row.get("size_bytes"))) {
            integrity = Integrity.FAILED;
            issues.add(new Issue(Status.INVALID, "SIZE_MISMATCH", ref, "Byte length differs from manifest"));
        }
        Object data = null;
        try {
            String content = new String(bytes, StandardCharsets.UTF_8).replaceFirst("^\uFEFF", "");
            if (path.endsWith(".csv")) data = ArtifactCsv.read(content);
            else if (path.endsWith(".jsonl")) {
                List<Object> lines = new ArrayList<>();
                for (String line : content.split("\\R")) if (!line.isBlank()) lines.add(MiniJson.parseObject(line));
                data = lines;
            } else if (path.endsWith(".json")) data = MiniJson.parse(content);
        } catch (IllegalArgumentException e) {
            issues.add(new Issue(Status.INVALID, "SCHEMA_PARSE_ERROR", ref, e.getMessage()));
        }
        return new Artifact(path, key, uri, hash, type, integrity, data, issues);
    }

    private byte[] bytes(String path) throws IOException {
        if (zip != null) try (var in = zip.getInputStream(zip.getEntry(path))) { return in.readAllBytes(); }
        Path resolved = root.resolve(path).normalize();
        if (!resolved.startsWith(root) || !resolved.toRealPath().startsWith(root.toRealPath()))
            throw new IOException("Artifact outside input root");
        return Files.readAllBytes(resolved);
    }
    private String text(String path) throws IOException { return new String(bytes(path), StandardCharsets.UTF_8); }
    private static void safe(String path) throws IOException {
        if (path.isEmpty() || path.startsWith("/") || path.contains("\\") || path.contains(":")
                || Arrays.asList(path.split("/")).contains("..")) throw new IOException("Unsafe artifact path: " + path);
    }
    @Override public void close() throws IOException { if (zip != null) zip.close(); }
}
