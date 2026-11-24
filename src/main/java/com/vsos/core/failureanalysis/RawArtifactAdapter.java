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

    private final BoundedInput budget;
    private final Map<String,Artifact> cache=new HashMap<>();
    private final Map<String,Run> runCache=new HashMap<>();
    private List<String> directories;
    private boolean closed;
    public RawArtifactAdapter(Path input)throws IOException {this(input,InputResourcePolicy.defaults());}
    public RawArtifactAdapter(Path input,InputResourcePolicy policy)throws IOException {
        root=input.toAbsolutePath().normalize();budget=new BoundedInput(policy);ZipFile opened=null;
        if(!Files.exists(root))throw new InputRejectedException(InputRejectedException.Kind.INCOMPLETE_INPUT,"INPUT_ROOT_MISSING",root.getFileName().toString(),"Input root is missing");
        try {
            if(!Files.isDirectory(root)){paths.addAll(ArchiveIndex.read(root,budget));opened=new ZipFile(root.toFile(),StandardCharsets.UTF_8);}
            else try(var files=Files.walk(root)) {
                var iterator=files.iterator();long total=0,visited=0;Set<String> folded=new HashSet<>();
                while(iterator.hasNext()) {
                    Path file=iterator.next();budget.check(++visited,policy.maxMembers(),"DIRECTORY_ENTRY_COUNT",root.getFileName().toString());budget.work(1,"directory-index");if(!Files.isRegularFile(file))continue;
                    String name=root.relativize(file).toString().replace('\\','/');safe(name);
                    budget.retain(256L+name.length()*4L,name);
                    if(!folded.add(name.toLowerCase(Locale.ROOT)))ArchiveIndex.bad("DIRECTORY_NAME_COLLISION",name);
                    budget.check(paths.size()+1,policy.maxMembers(),"MEMBER_COUNT",name);paths.add(name);
                    long size=Files.size(file);budget.check(size,policy.maxMemberBytes(),"DECLARED_MEMBER_BYTES",name);
                    total=BoundedInput.checkedAdd(total,size,name);budget.check(total,policy.maxTotalBytes(),"DECLARED_CUMULATIVE_BYTES",name);
                }
            }
            zip=opened;
            if(paths.contains("manifest.csv")) {
                Artifact index=load("manifest.csv","__INDEX__");
                if(index.data() instanceof List<?> records)for(Object item:records) {
                    @SuppressWarnings("unchecked") Map<String,Object> row=(Map<String,Object>)item;
                    String path=Objects.toString(row.get("path_in_zip"),"");safe(path);
                    if(manifest.putIfAbsent(path,row)!=null)indexIssues.add(new Issue(Status.CONFLICTING,"DUPLICATE_MANIFEST_IDENTITY",new SourceRef("manifest.csv","path_in_zip="+path),"Duplicate manifest member"));
                } else indexIssues.addAll(index.issues());
            }
            if(manifest.containsKey("manifest.csv"))ArchiveIndex.bad("MANIFEST_SELF_REFERENCE_UNSUPPORTED","manifest.csv");
            directories=discover();budget.check(directories.size(),policy.maxRuns(),"RUN_COUNT",root.getFileName().toString());
        } catch(IOException|RuntimeException e){if(opened!=null)try{opened.close();}catch(IOException close){e.addSuppressed(close);}throw e;}
    }
    public Map<String,Object> resourceCounters(){return budget.counters();}
    public List<String> runDirectories() {return directories;}
    private List<String> discover() {
        Set<String> dirs = new TreeSet<>();
        Set<String> candidates = new TreeSet<>(paths); candidates.addAll(manifest.keySet());
        for (String path : candidates) {
            Matcher m = RUN.matcher(path);
            if (m.matches()){dirs.add(m.group(1) + "/" + m.group(2) + "/rep" + m.group(3) + "_a" + m.group(4));budget.check(dirs.size(),budget.policy.maxRuns(),"RUN_COUNT",path);}
        }
        return List.copyOf(dirs);
    }

    public Run read(String directory) throws IOException {
        if(closed)throw new InputRejectedException(InputRejectedException.Kind.INCOMPLETE_INPUT,"INPUT_SESSION_CLOSED",directory,"Reader is closed");
        budget.check(0,budget.policy.maxWork(),"SESSION_ALREADY_EXHAUSTED",directory);
        safe(directory);
        if(runCache.containsKey(directory))return runCache.get(directory);
        budget.check(runCache.size()+1,budget.policy.maxRuns(),"RUN_COUNT",directory);
        Matcher m = RUN.matcher(directory + "/result.json");
        if (!m.matches()) throw new IllegalArgumentException("Unsupported run directory: " + directory);
        String caseDir = m.group(2);
        String key = caseDir + "-R" + m.group(3) + ("1".equals(m.group(4)) ? "" : "-A" + m.group(4));
        String caseKey = caseDir.replaceFirst("-OFF$", "");
        Map<String, Artifact> artifacts = new LinkedHashMap<>();
        long records=0;
        for (String file : List.of("result.json", "sensors/frames.csv", "sensors/ground_truth.csv", "sensors/collisions.json",
                "sensors/summary.json", "lifecycle.json", "core/vsos-core.jar")) {
            String name = file.substring(file.lastIndexOf('/') + 1).replaceFirst("\\.(json|csv|jar)$", "");
            artifacts.put(name, load(directory + "/" + file, key));
            Object stream=name.equals("result")?at(artifacts.get(name).data(),"/outcome/frames"):artifacts.get(name).data();
            if(stream instanceof List<?> list){records=BoundedInput.checkedAdd(records,list.size(),directory);budget.check(records,budget.policy.maxRunRecords(),"RUN_RECORDS",directory);}
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
        Run run=new Run(key,caseKey,directory,artifacts,issues);runCache.put(directory,run);return run;
    }

    private Artifact load(String path, String key) throws IOException {
        safe(path);
        SourceRef ref = new SourceRef(path, "");
        String type = path.endsWith(".csv") ? "text/csv" : path.endsWith(".jar") ? "application/java-archive"
                : path.endsWith(".jsonl") ? "application/x-ndjson" : "application/json";
        String uri = zip == null ? path : root.getFileName() + "!/" + path;
        if (!paths.contains(path)) return new Artifact(path, key, uri, null, type, Integrity.UNVERIFIED, null,
                List.of(new Issue(Status.UNKNOWN, "SOURCE_MISSING", ref, path)));
        if(cache.containsKey(path)) {
            Artifact cached=cache.get(path);
            if(key.equals(cached.runKey()))return cached;
            // Global metadata is copied by Evidence's immutable constructor for each run.
            reserveCopy(cached.data(),path);
            return new Artifact(path,key,uri,cached.sha256(),type,cached.integrity(),cached.data(),cached.issues());
        }
        byte[] bytes;
        try{bytes=bytes(path);}catch(IOException e){
            Artifact failed=new Artifact(path,key,uri,null,type,Integrity.FAILED,null,List.of(new Issue(Status.INVALID,"INTEGRITY_MISMATCH",ref,"Unreadable or truncated member")));
            cache.put(path,failed);return failed;
        }
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
        Object data=null;
        if(integrity!=Integrity.FAILED)try{data=budget.parse(bytes,type,path);}
        catch(InputRejectedException e) {
            if(e.kind()==InputRejectedException.Kind.RESOURCE_LIMIT_EXCEEDED)throw e;
            integrity=Integrity.FAILED;
            issues.add(new Issue(Status.INVALID,e.kind().name(),ref,e.reason()));
            issues.add(new Issue(Status.INVALID,"SCHEMA_PARSE_ERROR",ref,e.reason()));
        }
        Artifact loaded=new Artifact(path,key,uri,hash,type,integrity,data,issues);cache.put(path,loaded);return loaded;
    }
    private void reserveCopy(Object data,String path) {
        long count=0;Deque<Object> todo=new ArrayDeque<>();if(data!=null)todo.push(data);
        while(!todo.isEmpty()) {Object item=todo.pop();budget.work(1,path);count=BoundedInput.checkedAdd(count,128,path);
            if(item instanceof Map<?,?> map){for(Object v:map.values())if(v!=null)todo.push(v);}
            else if(item instanceof List<?> list){for(Object v:list)if(v!=null)todo.push(v);}
            else if(item instanceof String str)count=BoundedInput.checkedAdd(count,(long)str.length()*4,path);
        }
        budget.retain(count,path);
    }
    private byte[] bytes(String path)throws IOException {
        byte[] data;
        if(zip!=null) {
            var entry=zip.getEntry(path);data=budget.read(zip.getInputStream(entry),path,entry.getCompressedSize());
            java.util.zip.CRC32 crc=new java.util.zip.CRC32();crc.update(data);
            if(data.length!=entry.getSize()||crc.getValue()!=entry.getCrc())throw new IOException("INTEGRITY_MISMATCH: ZIP size/CRC");
        } else {
            Path resolved=root.resolve(path).toRealPath();if(!resolved.startsWith(root.toRealPath()))throw new IOException("Artifact outside input root");
            data=budget.read(resolved,path);
        }
        return data;
    }
    private static void safe(String path){ArchiveIndex.safe(path);}
    @Override public void close()throws IOException {closed=true;cache.clear();runCache.clear();manifest.clear();paths.clear();if(zip!=null)zip.close();}
}
