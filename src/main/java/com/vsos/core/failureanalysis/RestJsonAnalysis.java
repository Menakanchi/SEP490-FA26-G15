package com.vsos.core.failureanalysis;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** REST composition only. Reuses the offline adapter, pairing policy and core unchanged.
 * Server-owned temporary paths are replaced by a content-addressed resource URI BEFORE
 * reports are generated and signed. No producer field or generated report is rewritten. */
public final class RestJsonAnalysis {
    public static final String VERSION = "fa-rest-json/1";
    public record Parsed(Map<String,Object> manifest, List<JsonInputAdapter.Entry> entries) {
        public Parsed { manifest = Collections.unmodifiableMap(new LinkedHashMap<>(manifest)); entries = List.copyOf(entries); }
        public List<Run> runs() { return entries.stream().map(JsonInputAdapter.Entry::run).filter(Objects::nonNull).toList(); }
        public boolean complete() { return "COMPLETE".equals(manifest.get("status")); }
    }
    public Parsed parse(byte[] bytes, InputResourcePolicy limits) throws IOException {
        return parseProducer(bytes, limits, null);
    }
    /** The expected hash must be supplied by the server's verified producer record,
     * never by an uploaded JSON document or a client-provided declaration. */
    public Parsed parseProducer(byte[] bytes, InputResourcePolicy limits, String independentlyExpectedSha256) throws IOException {
        if (bytes.length > limits.maxMemberBytes()) throw BoundedInput.limit("MEMBER_BYTES", "source");
        Path temporary = Files.createTempFile("fa-json-", ".json");
        try {
            Files.write(temporary, bytes);
            // A transport/storage checksum is NOT an independent producer trust anchor.
            try (var adapter = new JsonInputAdapter(temporary, limits, independentlyExpectedSha256)) {
                String uri = "urn:vehicsim:failure-analysis:sha256:" + sha256(bytes);
                List<JsonInputAdapter.Entry> entries = new ArrayList<>();
                for (var entry : adapter.entries()) {
                    Run run = entry.run();
                    if (run != null) {
                        Map<String,Artifact> artifacts = new LinkedHashMap<>();
                        run.artifacts().forEach((name,a) -> artifacts.put(name, new Artifact(a.id(), a.runKey(), uri,
                                a.sha256(), a.mediaType(), a.integrity(), a.data(), a.issues(), a.provenance())));
                        run = new Run(run.runKey(), run.caseKey(), uri, artifacts, run.identityIssues());
                    }
                    entries.add(new JsonInputAdapter.Entry(entry.runKey(), entry.pointer(), run, entry.issues()));
                }
                return new Parsed(adapter.manifest(), entries);
            }
        } finally { Files.deleteIfExists(temporary); }
    }
    public Map<String,Object> diagnose(Run run, Parsed input) {
        return new DiagnosticReport().analyze(run, FailureAnalysisInput.comparator(run, input.runs()), AnalysisContext.empty());
    }
    /** Context is resolved and authenticated by the backend, not discovered in result.json. */
    public Map<String,Object> diagnose(Run run, Parsed input, AnalysisContext context) {
        return new DiagnosticReport().analyze(run, FailureAnalysisInput.comparator(run, input.runs()), Objects.requireNonNull(context));
    }
    public Map<String,Object> diagnosticHandoff(Parsed input, List<MoboHandoffBuilder.MemberInput> reports) {
        if (!input.complete() || reports.size() != input.entries().size())
            throw new IllegalArgumentException("INCOMPLETE_INPUT_POPULATION");
        return new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(reports, null, null,
                new SearchRangeResolver.Domains(null,null,null,null,List.of()), null, List.of()));
    }
    /** Existing inspector's explicit missing-source path. A packaged REST deployment does
     * not claim to contain the audited checkout. All source hashes remain null/audited=false. */
    public static ConsumerSourceInspection.Profile unavailableConsumerProfile() throws IOException {
        Path empty=Files.createTempDirectory("fa-no-consumer-source-");
        try { return ConsumerSourceInspection.read(empty); }
        finally { Files.deleteIfExists(empty); }
    }
}
