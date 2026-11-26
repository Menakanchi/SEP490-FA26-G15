package com.vsos.backend.service.analysis;

import com.vsos.backend.repository.analysis.FailureAnalysisDatabaseRepository;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.Semaphore;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.backend.common.analysis.FailureAnalysisJson.*;

/** Read existing Module 2 storage only. Database ownership is not baseline/calibration authority. */
@Service
public class FailureAnalysisDatabaseAdapter {
    private static final byte[] RUNS_FIELD = ",\"runs\":[".getBytes(StandardCharsets.UTF_8);
    private static final byte[] ENVELOPE_END = "]}".getBytes(StandardCharsets.UTF_8);
    private static final List<String> MEMBER_FIELDS = List.of("aeb_mode", "aeb_version_id", "carla_vehicle_model_id", "repetition", "attempt", "purpose");
    private static final List<String> IDENTITY_FIELDS = List.of("run_id", "project_id", "scenario_id", "scenario_version_id", "variant_id",
            "aeb_version_id", "carla_vehicle_model_id", "seed", "aeb_mode", "repetition", "attempt", "purpose", "simulator");

    private final FailureAnalysisDatabaseRepository db;
    private final RunService runs;
    private final FailureAnalysisService analysis;
    private final Semaphore readers = new Semaphore(2);

    public FailureAnalysisDatabaseAdapter(FailureAnalysisDatabaseRepository db, RunService runs, FailureAnalysisService analysis) {
        this.db = db;
        this.runs = runs;
        this.analysis = analysis;
    }

    private record Document(byte[] bytes, Map<String, Object> json, Map<String, Object> provenance, List<Map<String, Object>> issues) {
    }

    private record Snapshot(byte[] bytes, Map<String, Object> provenance, List<Map<String, Object>> members) {
    }

    private void acquire() {
        if (!readers.tryAcquire()) {
            throw new FailureAnalysisException(429, "FA_DATABASE_SOURCE_CAPACITY_REACHED");
        }
    }

    private static void paging(int limit, int offset) {
        if (limit < 1 || limit > 20 || offset < 0 || offset > 10000) {
            throw new FailureAnalysisException(400, "PAGINATION_INVALID");
        }
    }

    public Map<String, Object> list(long project, boolean collection, int limit, int offset) {
        paging(limit, offset);
        var rows = collection ? db.collections(project, limit, offset) : db.runs(project, limit, offset);
        var items = rows.stream().map(r -> {
            var m = new LinkedHashMap<>(r.asMap());
            m.remove("storage_url");
            return m;
        }).toList();
        return obj("schema_version", "vehicsim.fa-db-input/v1", "selection_kind", collection ? "COLLECTION" : "RUN", "project_id", project,
                "items", items, "limit", limit, "offset", offset);
    }

    public Map<String, Object> inspect(long project, long id, boolean collection) throws IOException {
        acquire();
        try {
            Snapshot s = snapshot(project, id, collection);
            Map<String, Object> manifest = null;
            if (s.bytes() != null) {
                manifest = new RestJsonAnalysis().parse(s.bytes(), policy(RESOURCE_BYTES)).manifest();
            }
            return obj("schema_version", "vehicsim.fa-db-input/v1", "selection_kind", collection ? "COLLECTION" : "RUN",
                    "selection_id", id, "project_id", project,
                    "can_analyze", s.bytes() != null, "source_sha256", s.bytes() == null ? null : sha256(s.bytes()),
                    "availability", manifest == null ? "BLOCKED" : manifest.get("status"), "members", s.members(), "input_manifest", manifest,
                    "database_provenance", s.provenance(), "freshness", "OBSERVED_SELECTION_NOT_AUTHORIZED_FROZEN_COHORT");
        } finally {
            readers.release();
        }
    }

    public Map<String, Object> analyze(long project, long user, long id, boolean collection, String expected) throws IOException {
        analysis.requireDatabaseWrite(project);
        if (expected != null && !expected.matches("[a-f0-9]{64}")) {
            throw new FailureAnalysisException(400, "DB_EXPECTED_SHA256_INVALID");
        }
        acquire();
        try {
            Snapshot s = snapshot(project, id, collection);
            if (s.bytes() == null) {
                throw new FailureAnalysisException(422, "DB_RESULT_SOURCE_UNAVAILABLE_SEE_INSPECTION");
            }
            if (expected != null && !expected.equals(sha256(s.bytes()))) {
                throw new FailureAnalysisException(409, "DB_SOURCE_CHANGED_REINSPECT");
            }
            var source = analysis.ingestDatabase(project, user, s.bytes(), s.provenance());
            return analysis.analyze(project, source.get("id").toString(), null);
        } finally {
            readers.release();
        }
    }

    private Snapshot snapshot(long project, long id, boolean collection) throws IOException {
        if (id < 1) {
            throw new FailureAnalysisException(404, "DB_SELECTION_NOT_FOUND");
        }
        Row variant = collection ? db.variant(project, id) : null;
        Row one = collection ? null : db.run(project, id);
        if (collection ? variant == null : one == null) {
            throw new FailureAnalysisException(404, "DB_SELECTION_NOT_FOUND");
        }
        List<Row> selected = collection ? db.members(project, id) : List.of(one);
        if (selected.isEmpty()) {
            throw new FailureAnalysisException(404, "DB_COLLECTION_NO_COMPLETED_CARLA_RUNS");
        }
        if (selected.size() > MEMBERS) {
            throw new FailureAnalysisException(413, "DB_COLLECTION_MEMBER_LIMIT_NO_TRUNCATION");
        }
        var manifest = new ArrayList<Object>();
        var memberInfo = new ArrayList<Map<String, Object>>();
        var docs = new ArrayList<byte[]>();
        var origins = new ArrayList<Object>();
        byte[] standalone = null;
        long retainedBytes = 0;
        for (Row row : selected) {
            Document doc = read(project, row);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("run_id", row.lng("id"));
            for (String f : MEMBER_FIELDS) {
                m.put(f, row.get(f));
            }
            m.put("seed", row.get("random_seed"));
            m.put("simulator", row.get("simulator_version"));
            boolean usable = doc.bytes() != null;
            if (!collection) {
                standalone = doc.bytes();
            }
            m.put("document_state", obj("state", usable ? "OK" : "MISSING", "reason", usable ? null : "See database_provenance member issues"));
            if (usable) {
                m.put("document_sha256", sha256(MiniJson.write(doc.json())));
                if (collection) {
                    var prefix = ("{\"run_id\":" + row.lng("id") + ",\"result\":").getBytes(StandardCharsets.UTF_8);
                    retainedBytes += prefix.length + doc.bytes().length + 2;
                    if (retainedBytes > DB_COLLECTION_BYTES) {
                        throw new FailureAnalysisException(413, "DB_COLLECTION_BYTE_LIMIT_NO_TRUNCATION");
                    }
                    var entry = new ByteArrayOutputStream();
                    entry.write(prefix);
                    entry.write(doc.bytes());
                    entry.write('}');
                    docs.add(entry.toByteArray());
                }
            }
            manifest.add(m);
            origins.add(doc.provenance());
            memberInfo.add(obj("run_id", row.lng("id"), "identity", m, "availability", usable ? "READABLE" : "BLOCKED", "issues", doc.issues()));
        }
        var provenance = obj("adapter_version", "fa-db-source/1", "origin", "DATABASE_ARTIFACT_STORAGE",
                "selection_kind", collection ? "COLLECTION" : "RUN", "selection_id", id, "project_id", project, "members", origins,
                "baseline_authority", "UNKNOWN", "original_result_bytes_preserved", true);
        if (!collection) {
            return new Snapshot(standalone, provenance, memberInfo);
        }
        boolean complete = docs.size() == selected.size();
        var envelope = obj("format", "vehicsim.run-collection/v1",
                "collection", obj("kind", "variant", "project_id", project, "scenario_id", variant.get("scenario_id"),
                        "variant_id", id, "variant_version_no", variant.get("version_no"), "sealed", false,
                        "selection", "DB COMPLETED CARLA members; includes every seed/repetition/attempt; no reconstruction"),
                "rules", obj("document_digest_spec", "SHA-256 of Python json.dumps(value, ensure_ascii=False); MiniJson compatible",
                        "no_cross_run_aggregation", true),
                "manifest", manifest,
                "status", obj("state", complete ? "OK" : "MISSING",
                        "reason", complete ? null : "Missing or invalid original result; see manifest/database provenance"));
        String head = MiniJson.write(envelope);
        var output = new ByteArrayOutputStream();
        output.write(head.substring(0, head.length() - 1).getBytes(StandardCharsets.UTF_8));
        output.write(RUNS_FIELD);
        for (int i = 0; i < docs.size(); i++) {
            if (i > 0) {
                output.write(',');
            }
            if (output.size() + docs.get(i).length > DB_COLLECTION_BYTES) {
                throw new FailureAnalysisException(413, "DB_COLLECTION_BYTE_LIMIT_NO_TRUNCATION");
            }
            output.write(docs.get(i));
        }
        output.write(ENVELOPE_END);
        if (output.size() > DB_COLLECTION_BYTES) {
            throw new FailureAnalysisException(413, "DB_COLLECTION_BYTE_LIMIT_NO_TRUNCATION");
        }
        // A second metadata read rejects concurrent membership/identity changes, without writing Module 2.
        if (!signature(selected).equals(signature(db.members(project, id)))) {
            throw new FailureAnalysisException(409, "DB_SELECTION_CHANGED_REINSPECT");
        }
        return new Snapshot(output.toByteArray(), provenance, memberInfo);
    }

    private static String signature(List<Row> rows) {
        return MiniJson.write(rows.stream().map(r -> List.of(r.lng("id"), Objects.toString(r.get("random_seed")),
                Objects.toString(r.get("repetition")), Objects.toString(r.get("attempt")), Objects.toString(r.get("aeb_mode")),
                Objects.toString(r.get("aeb_version_id")), Objects.toString(r.get("simulator_version")))).toList());
    }

    private Document read(long project, Row row) throws IOException {
        long id = row.lng("id");
        var refs = db.artifacts(project, id);
        var issues = new ArrayList<Map<String, Object>>();
        Map<String, Object> provenance = obj("run_id", id, "reference_table", "simulation_artifacts", "artifact_type", "RESULT_FILE",
                "artifact_id", refs.size() == 1 ? refs.getFirst().get("id") : null, "relative_path", "runs/" + id + "/result.json",
                "byte_sha256", null, "issues", issues);
        if (refs.size() > 1) {
            issues.add(problem("DB_RESULT_REFERENCE_AMBIGUOUS", "simulation_artifacts.RESULT_FILE"));
            return new Document(null, Map.of(), provenance, issues);
        }
        Path folder = runs.runDir(id).toAbsolutePath().normalize();
        Path file = folder.resolve("result.json");
        if (!refs.isEmpty()) {
            try {
                if (!Path.of(refs.getFirst().str("storage_url")).toAbsolutePath().normalize().equals(file)) {
                    throw new IllegalArgumentException();
                }
            } catch (RuntimeException e) {
                issues.add(problem("DB_RESULT_REFERENCE_OUTSIDE_CANONICAL_STORAGE", "simulation_artifacts.storage_url"));
                return new Document(null, Map.of(), provenance, issues);
            }
        } else {
            provenance.put("reference_resolution", "CANONICAL_RUN_STORAGE_NO_ARTIFACT_ROW");
        }
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            issues.add(problem("DB_RESULT_FILE_MISSING", "result.json"));
            return new Document(null, Map.of(), provenance, issues);
        }
        Path root = runs.runDir(0).toAbsolutePath().normalize().getParent().toRealPath();
        if (Files.isSymbolicLink(folder) || Files.isSymbolicLink(file) || !folder.toRealPath().equals(root.resolve(Long.toString(id)))) {
            issues.add(problem("DB_RESULT_SYMLINK_OR_STORAGE_ESCAPE", "result.json"));
            return new Document(null, Map.of(), provenance, issues);
        }
        var before = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        byte[] raw;
        try (var channel = FileChannel.open(file, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            raw = new BoundedInput(policy(SOURCE_BYTES)).read(Channels.newInputStream(channel), "db-result", -1);
        }
        var after = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (before.size() != after.size() || !before.lastModifiedTime().equals(after.lastModifiedTime())
                || !Objects.equals(before.fileKey(), after.fileKey())) {
            throw new FailureAnalysisException(409, "DB_RESULT_CHANGED_DURING_READ");
        }
        provenance.put("byte_sha256", sha256(raw));
        provenance.put("size_bytes", raw.length);
        Map<String, Object> json;
        try {
            json = object(raw);
        } catch (RuntimeException e) {
            issues.add(problem("DB_RESULT_JSON_INVALID", "result.json"));
            return new Document(null, Map.of(), provenance, issues);
        }
        if (!"vehicsim.result/v1".equals(json.get("format"))) {
            issues.add(problem("DB_RESULT_SCHEMA_UNSUPPORTED", "/format"));
        }
        if (!(json.get("dataset") instanceof Map<?, ?>)) {
            issues.add(problem("DATASET_REQUIRED", "/dataset"));
        }
        for (String f : IDENTITY_FIELDS) {
            Object expected = switch (f) {
                case "run_id" -> id;
                case "variant_id" -> row.get("scenario_version_id");
                case "seed" -> row.get("random_seed");
                case "simulator" -> row.get("simulator_version");
                default -> row.get(f);
            };
            Object observed = at(json, "/dataset/identity/" + f);
            if (observed == null || expected == null || !Objects.toString(expected).equals(Objects.toString(observed))) {
                issues.add(problem(observed == null ? "DB_IDENTITY_FIELD_MISSING" : "DB_IDENTITY_CONFLICT", "/dataset/identity/" + f));
            }
        }
        if (raw.length >= 3 && (raw[0] & 255) == 239 && (raw[1] & 255) == 187 && (raw[2] & 255) == 191) {
            issues.add(problem("DB_RESULT_BOM_NOT_EMBEDDABLE_WITHOUT_BYTE_CHANGE", "result.json"));
        }
        return new Document(issues.isEmpty() ? raw : null, json, provenance, issues);
    }

    private static Map<String, Object> problem(String code, String field) {
        return obj("reason_code", code, "field", field, "required_from", "MODULE_2_ORIGINAL_RESULT_OR_ARTIFACT_REFERENCE");
    }
}
