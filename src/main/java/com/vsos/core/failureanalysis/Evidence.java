package com.vsos.core.failureanalysis;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/** Shared immutable evidence types. An observed record is not a physical or causal verdict. */
public final class Evidence {
    private Evidence() {}
    public enum Status { OBSERVED, DERIVED, CONDITIONAL, UNKNOWN, NOT_APPLICABLE, CONFLICTING, INVALID }
    public enum Integrity { VERIFIED, FAILED, UNVERIFIED }

    public record SourceRef(String artifactId, String locator) {
        public Map<String, Object> json() {
            return obj("artifact_id", artifactId, "locator", locator, "input_ids", List.of());
        }
    }
    public record Value(Object value, Status status, String unit, String clockId,
                        List<SourceRef> sourceRefs, List<String> reasonCodes, String formulaId) {
        public Value {
            sourceRefs = List.copyOf(sourceRefs);
            reasonCodes = List.copyOf(reasonCodes);
            value = freeze(value);
            if ((status == Status.UNKNOWN || status == Status.INVALID || status == Status.NOT_APPLICABLE) && value != null)
                throw new IllegalArgumentException("Non-value status cannot contain a value");
            if ((value == null || status == Status.CONDITIONAL || status == Status.CONFLICTING) && reasonCodes.isEmpty())
                throw new IllegalArgumentException("Evidence needs a reason code");
            if (status == Status.OBSERVED && sourceRefs.isEmpty())
                throw new IllegalArgumentException("Observed evidence needs a source");
        }
        public Map<String, Object> json() {
            return obj("value", value, "status", status.name(), "unit", unit, "clock_id", clockId,
                    "frame_id", null, "source_refs", sourceRefs.stream().map(SourceRef::json).toList(),
                    "formula_id", formulaId, "assumptions", status == Status.CONDITIONAL ? reasonCodes.stream().map(c -> switch(c) {
                        case "PROFILE_SOURCE_MAPPING_CONDITIONAL" -> "Runtime behavior agrees with the declared simulator profile and inspected producer source; binary/source equivalence is unverified";
                        case "LEGACY_ON_OMISSION_CONVENTION" -> "Producer follows vehicsim.result/v1 AebMode omission convention";
                        default -> c;
                    }).toList() : List.of(), "bounds", null, "reason_codes", reasonCodes);
        }
    }
    public record Issue(Status status, String code, SourceRef source, String detail) {
        public Map<String, Object> json() {
            return obj("status", status.name(), "reason_code", code, "source_ref", source.json(), "detail", detail);
        }
    }
    public record Artifact(String id, String runKey, String uri, String sha256, String mediaType,
                           Integrity integrity, Object data, List<Issue> issues, Map<String,Object> provenance) {
        public Artifact(String id,String runKey,String uri,String sha256,String mediaType,Integrity integrity,Object data,List<Issue> issues){
            this(id,runKey,uri,sha256,mediaType,integrity,data,issues,Map.of());
        }
        @SuppressWarnings("unchecked") public Artifact { data = freeze(data); issues = List.copyOf(issues); provenance=(Map<String,Object>)freeze(provenance); }
        public boolean usable() { return integrity != Integrity.FAILED && issues.stream().noneMatch(i -> i.status() == Status.INVALID); }
        public Map<String, Object> json() {
            Map<String,Object> out=obj("id", id, "run_key", runKey, "uri", uri, "sha256", sha256,
                    "media_type", mediaType, "integrity", integrity.name());
            if(!provenance.isEmpty())out.put("provenance",provenance);return out;
        }
        /** Logical normalized paths resolve back to the original JSON, never invented CSV records. */
        public SourceRef ref(String pointer){
            if(!provenance.containsKey("json_root_pointer"))return new SourceRef(id,pointer);
            String root=Objects.toString(provenance.get("json_root_pointer"),"");
            Object columns=provenance.get("table_columns");
            if(columns instanceof List<?> names&&!pointer.isEmpty()){
                String[] parts=pointer.substring(1).split("/",3);
                if(parts[0].matches("\\d+")){
                    String row=root+"/rows/"+parts[0];
                    if(parts.length>1){int column=names.indexOf(parts[1].replace("~1","/").replace("~0","~"));
                        // Missing column references resolve to the actual schema declaration.
                        if(column<0)return new SourceRef(id,root+"/columns");
                        row+="/"+column;if(parts.length>2)row+="/"+parts[2];}
                    return new SourceRef(id,row);
                }
            }
            return new SourceRef(id,root+pointer);
        }
    }
    public record Run(String runKey, String caseKey, String directory, Map<String, Artifact> artifacts,
                      List<Issue> identityIssues) {
        public Run { artifacts = Collections.unmodifiableMap(new LinkedHashMap<>(artifacts)); identityIssues = List.copyOf(identityIssues); }
        public Artifact artifact(String name) { return artifacts.get(name); }
        public SourceRef ref(String name, String pointer) {
            Artifact a = artifact(name);
            if(a.provenance().containsKey("json_root_pointer"))return a.ref(pointer);
            String locator = pointer;
            if (a.mediaType().equals("text/csv") || a.mediaType().equals("application/x-ndjson")) {
                String[] parts = pointer.split("/", 3);
                if (parts.length >= 2 && parts[1].matches("\\d+")) {
                    int index = Integer.parseInt(parts[1]);
                    locator = a.mediaType().equals("text/csv") ? "CSV record=" + (index + 2) + ";column=" + (parts.length == 3 ? parts[2] : "*")
                            : "line=" + (index + 1) + ";json_pointer=" + (parts.length == 3 ? "/" + parts[2] : "");
                } else if (pointer.isEmpty()) locator = a.mediaType().equals("text/csv") ? "CSV all records" : "all JSONL lines";
            }
            return new SourceRef(a.id(), locator);
        }
        public Object get(String name, String pointer) {
            Artifact a = artifact(name);
            return a != null && a.usable() ? at(a.data(), pointer) : null;
        }
        public Value read(String name, String pointer, String unit, String clock) {
            Artifact a = artifact(name);
            if (a == null) return unknown("SOURCE_MISSING", unit);
            SourceRef ref = ref(name, pointer);
            if (!a.usable()) return value(null, Status.INVALID, unit, clock, List.of(ref), "SOURCE_INVALID");
            Object v = at(a.data(), pointer);
            if (invalidNumber(v)) return value(null, Status.INVALID, unit, clock, List.of(ref), "NONFINITE_NUMBER");
            return v == null ? value(null, Status.UNKNOWN, unit, clock, List.of(ref), "FIELD_MISSING_OR_NULL")
                    : value(v, Status.OBSERVED, unit, clock, List.of(ref));
        }
    }

    public static Value unknown(String code, String unit) { return value(null, Status.UNKNOWN, unit, null, List.of(), code); }
    public static Value value(Object v, Status s, String unit, String clock, List<SourceRef> refs, String... codes) {
        return new Value(v, s, unit, clock, refs, List.of(codes), null);
    }
    public static Map<String, Object> obj(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) out.put((String) pairs[i], pairs[i + 1]);
        return out;
    }
    public static Object at(Object root, String pointer) {
        Object v = root;
        if (pointer.isEmpty()) return v;
        for (String part : pointer.substring(1).split("/")) {
            String key = part.replace("~1", "/").replace("~0", "~");
            if (v instanceof Map<?, ?> m) v = m.get(key);
            else if (v instanceof List<?> l) {
                try { v = l.get(Integer.parseInt(key)); } catch (RuntimeException e) { return null; }
            } else return null;
        }
        return v;
    }
    public static boolean finiteNonnegative(Object v) {
        return v instanceof Number n && Double.isFinite(n.doubleValue()) && n.doubleValue() >= 0;
    }
    private static boolean invalidNumber(Object v) {
        if (v instanceof Number n) return !Double.isFinite(n.doubleValue());
        if (v instanceof Map<?, ?> m) return m.values().stream().anyMatch(Evidence::invalidNumber);
        if (v instanceof List<?> l) return l.stream().anyMatch(Evidence::invalidNumber);
        return false;
    }
    public static boolean sameNumber(Object a, Object b) {
        if (a == null || b == null) return a == b;
        if (a instanceof Number && b instanceof Number && Double.isFinite(((Number)a).doubleValue())
                && Double.isFinite(((Number)b).doubleValue()))
            return new BigDecimal(a.toString()).compareTo(new BigDecimal(b.toString())) == 0;
        return Objects.equals(a, b);
    }
    public static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public static String sha256(String text) { return sha256(text.getBytes(StandardCharsets.UTF_8)); }
    public static Object freeze(Object v) {
        if (v instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            map.forEach((k, x) -> copy.put(String.valueOf(k), freeze(x)));
            return Collections.unmodifiableMap(copy);
        }
        if (v instanceof List<?> list) return list.stream().map(Evidence::freeze).toList();
        return v;
    }
}
