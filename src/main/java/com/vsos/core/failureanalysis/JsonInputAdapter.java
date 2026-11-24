package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.InputRejectedException.Kind.*;

/** Bounded, read-only ADR065 result/collection intake. No physics or diagnosis here.
 * Embedded views retain original container hashes and exact original JSON layouts;
 * a self-declared digest proves consistency, never external source authenticity.
 */
public final class JsonInputAdapter implements AutoCloseable {
    public static final String VERSION="fa-json-input/1";
    public record Entry(String runKey,String pointer,Run run,List<Issue> issues){
        public Entry{issues=List.copyOf(issues);}
        public Map<String,Object> json(){return obj("run_key",runKey,"json_pointer",pointer,"status",run==null?"BLOCKED":"ANALYZABLE",
            "reason_codes",issues.stream().map(Issue::code).distinct().toList(),"issues",issues.stream().map(Issue::json).toList());}
    }
    private final BoundedInput budget;
    private final String containerId,containerHash,expectedHash,uri;
    private final Integrity containerIntegrity;
    private final List<Entry> entries=new ArrayList<>();
    private final List<Issue> collectionIssues=new ArrayList<>();
    private final Map<String,Object> root;
    private boolean closed;
    public JsonInputAdapter(Path path)throws IOException{this(path,InputResourcePolicy.defaults(),null);}
    public JsonInputAdapter(Path path,InputResourcePolicy policy,String independentlyExpectedSha256)throws IOException{
        budget=new BoundedInput(policy);byte[] bytes=budget.read(path,path.toString());containerHash=sha256(bytes);
        expectedHash=independentlyExpectedSha256;uri=path.toAbsolutePath().normalize().toUri().toString();containerId="json-container:"+containerHash;
        if(expectedHash!=null&&(!expectedHash.matches("[a-f0-9]{64}")||!expectedHash.equals(containerHash)))
            throw new InputRejectedException(INTEGRITY_MISMATCH,"CONTAINER_HASH_MISMATCH",containerId,"Independent expected container hash differs");
        containerIntegrity=expectedHash==null?Integrity.UNVERIFIED:Integrity.VERIFIED;
        Object parsed=budget.parse(bytes,"application/json",containerId);
        if(!(parsed instanceof Map<?,?>))throw reject("JSON_OBJECT_REQUIRED","");root=map(parsed);
        Object format=root.get("format");
        if("vehicsim.result/v1".equals(format))entries.add(parseEntry(root,"",null,null));
        else if("vehicsim.run-collection/v1".equals(format))collection();
        else throw reject("JSON_SCHEMA_UNSUPPORTED","/format");
    }
    private InputRejectedException reject(String reason,String pointer){return new InputRejectedException(INVALID_ARTIFACT,reason,containerId,"JSON pointer "+pointer);}
    private Issue issue(Status status,String code,String pointer,String detail){return new Issue(status,code,new SourceRef(containerId,pointer),detail);}
    private static Map<String,Object> map(Object x){if(!(x instanceof Map<?,?> m))return Map.of();Map<String,Object> out=new LinkedHashMap<>();m.forEach((k,v)->out.put(k.toString(),v));return out;}
    private static String id(Object x){return x!=null&&x.toString().matches("[1-9]\\d*")?x.toString():null;}
    private static boolean sameId(Object a,Object b){return id(a)!=null&&Objects.equals(id(a),id(b));}
    private static String escape(String x){return x.replace("~","~0").replace("/","~1");}
    public List<Entry> entries(){if(closed)throw new IllegalStateException("JSON_INPUT_CLOSED");return List.copyOf(entries);}
    public List<Run> runs(){return entries().stream().map(Entry::run).filter(Objects::nonNull).toList();}
    public boolean complete(){return !entries.isEmpty()&&entries.stream().allMatch(e->e.run()!=null)&&collectionIssues.isEmpty();}
    public Map<String,Object> manifest(){return obj("schema_version","vehicsim.failure-analysis-input-manifest/v1","adapter_version",VERSION,
        "input_format",root.get("format"),"container_sha256_bytes",containerHash,"independently_expected_sha256",expectedHash,
        "container_integrity",containerIntegrity.name(),"status",complete()?"COMPLETE":"PARTIAL_OR_BLOCKED",
        "completeness_scope","DELIVERED_MANIFEST_MEMBERS_ONLY_NOT_FROZEN_SCENARIO_COHORT","declared_collection",root.get("collection"),"declared_collection_status",root.get("status"),
        "expected_members",entries.size(),"analyzable_members",entries.stream().filter(e->e.run()!=null).count(),
        "members",entries.stream().map(Entry::json).toList(),"issues",collectionIssues.stream().map(Issue::json).toList(),"resource_counters",budget.counters());}

    private void collection(){
        Object state=at(root,"/status/state");if(state!=null&&!"OK".equals(state))collectionIssues.add(issue(Status.UNKNOWN,"COLLECTION_STATUS_NOT_OK","/status","Producer did not declare a complete readable collection"));
        if(!(root.get("runs") instanceof List<?> values))throw reject("COLLECTION_RUNS_REQUIRED","/runs");
        budget.check(values.size(),budget.policy.maxRuns(),"RUN_COUNT",containerId);
        if(values.isEmpty())collectionIssues.add(issue(Status.UNKNOWN,"COLLECTION_EMPTY","/runs","No run documents"));
        Map<String,Map<String,Object>> manifests=new LinkedHashMap<>();Set<String> duplicates=new HashSet<>();
        if(root.get("manifest") instanceof List<?> list){
            budget.check(list.size(),budget.policy.maxRuns(),"MANIFEST_RUN_COUNT",containerId);
            for(int i=0;i<list.size();i++){
                var row=map(list.get(i));String key=id(row.get("run_id"));
                if(key==null){collectionIssues.add(issue(Status.INVALID,"MANIFEST_RUN_ID_INVALID","/manifest/"+i,"Expected positive run identity"));continue;}
                if(manifests.putIfAbsent(key,row)!=null){duplicates.add(key);collectionIssues.add(issue(Status.CONFLICTING,"DUPLICATE_RUN_IDENTITY","/manifest/"+i,"Duplicate manifest identity"));}
            }
        }else collectionIssues.add(issue(Status.UNKNOWN,"COLLECTION_MANIFEST_MISSING","/manifest","Whole-collection membership cannot be verified"));
        Map<String,Integer> counts=new HashMap<>();
        for(Object value:values){String key=id(at(value,"/run_id"));if(key!=null)counts.merge(key,1,Integer::sum);}
        Set<String> found=new HashSet<>();
        for(int i=0;i<values.size();i++){
            Object value=values.get(i);String pointer="/runs/"+i+"/result",key=id(at(value,"/run_id"));
            if(key!=null)found.add(key);
            if(key==null||counts.getOrDefault(key,0)>1||duplicates.contains(key)){
                entries.add(new Entry(key,pointer,null,List.of(issue(Status.INVALID,key==null?"COLLECTION_RUN_ID_MISSING":"DUPLICATE_RUN_IDENTITY",pointer,"No unique member identity"))));continue;
            }
            var row=manifests.get(key);
            if(row==null)collectionIssues.add(issue(Status.UNKNOWN,"RUN_NOT_IN_MANIFEST",pointer,"Run is not covered by the collection manifest"));
            entries.add(parseEntry(at(value,"/result"),pointer,key,row));
        }
        for(String key:manifests.keySet())if(!found.contains(key))entries.add(new Entry(key,"/manifest",null,List.of(issue(Status.UNKNOWN,"MANIFEST_RUN_DOCUMENT_MISSING","/manifest","Expected run "+key+" has no document"))));
        budget.check(entries.size(),budget.policy.maxRuns(),"EXPECTED_RUN_COUNT",containerId);
    }
    private Entry parseEntry(Object document,String prefix,String wrapperId,Map<String,Object> manifest){
        String key=id(at(document,"/dataset/identity/run_id"));List<Issue> issues=new ArrayList<>();
        try{
            if(!(document instanceof Map<?,?>))throw reject("RUN_DOCUMENT_REQUIRED",prefix);
            if(!"vehicsim.result/v1".equals(at(document,"/format")))throw reject("RESULT_SCHEMA_UNSUPPORTED",prefix+"/format");
            if(!(at(document,"/dataset") instanceof Map<?,?>))throw reject("DATASET_REQUIRED",prefix+"/dataset");
            if(!"vehicsim.run-dataset/v1".equals(at(document,"/dataset/format")))throw reject("DATASET_SCHEMA_UNSUPPORTED",prefix+"/dataset/format");
            if(key==null)throw reject("RUN_IDENTITY_MISSING_OR_INVALID",prefix+"/dataset/identity/run_id");
            String variant=id(at(document,"/dataset/identity/variant_id"));if(variant==null)throw reject("VARIANT_IDENTITY_MISSING_OR_INVALID",prefix+"/dataset/identity/variant_id");
            if(wrapperId!=null&&!key.equals(wrapperId))throw reject("INCONSISTENT_IDENTITY",prefix+"/dataset/identity/run_id");
            for(String field:List.of("run_id","scenario_id","scenario_version_id","aeb_version_id","carla_vehicle_model_id")){
                Object source=at(document,"/source/"+field),embedded=at(document,"/dataset/identity/"+field);
                if(source!=null&&embedded!=null&&!sameId(source,embedded))throw reject("INCONSISTENT_IDENTITY",prefix+"/source/"+field);
            }
            Object version=at(document,"/dataset/identity/scenario_version_id");if(version!=null&&!sameId(version,variant))throw reject("INCONSISTENT_IDENTITY",prefix+"/dataset/identity/variant_id");
            for(String field:List.of("seed","simulator"))if(!Objects.equals(at(document,"/"+field),at(document,"/dataset/identity/"+field)))throw reject("INCONSISTENT_IDENTITY",prefix+"/dataset/identity/"+field);
            Object seed=at(document,"/seed");if(!(seed instanceof Number)||!seed.toString().matches("-?\\d+"))throw reject("SEED_TYPE_INVALID",prefix+"/seed");
            String mode=Objects.toString(at(document,"/dataset/identity/aeb_mode"),"");if(!List.of("ON","OFF").contains(mode))throw reject("AEB_MODE_INVALID",prefix+"/dataset/identity/aeb_mode");
            Object oldMode=at(document,"/outcome/case/aeb_mode");if(oldMode!=null&&!mode.equals(oldMode))throw reject("INCONSISTENT_IDENTITY",prefix+"/outcome/case/aeb_mode");
            for(String sequence:List.of("repetition","attempt"))if(id(at(document,"/dataset/identity/"+sequence))==null)throw reject("RUN_SEQUENCE_INVALID",prefix+"/dataset/identity/"+sequence);
            long records=0;for(String stream:List.of("/outcome/frames","/dataset/time_series/frames/rows","/dataset/time_series/ground_truth/rows","/dataset/collisions/events"))
                if(at(document,stream) instanceof List<?> rows)records=BoundedInput.checkedAdd(records,rows.size(),containerId);
            budget.check(records,budget.policy.maxRunRecords(),"RUN_RECORDS",containerId);
            if(manifest!=null){
                Object state=at(manifest,"/document_state/state");if(state!=null&&!"OK".equals(state))throw reject("MANIFEST_DOCUMENT_STATE_NOT_OK",prefix);
                for(String field:List.of("seed","aeb_mode","repetition","attempt","simulator","purpose","aeb_version_id","carla_vehicle_model_id"))
                    if(manifest.containsKey(field)&&!Objects.equals(manifest.get(field),at(document,"/dataset/identity/"+field)))throw reject("INCONSISTENT_IDENTITY",prefix+"/dataset/identity/"+field);
                Object hash=manifest.get("document_sha256");if(!(hash instanceof String s&&s.matches("[a-f0-9]{64}")))throw reject("DOCUMENT_DIGEST_MISSING_OR_INVALID",prefix);
                if(!digestProfile(at(root,"/rules/document_digest_spec")))throw reject("DOCUMENT_DIGEST_PROFILE_UNSUPPORTED",prefix);
                if(!hash.equals(digest(document,prefix)))throw new InputRejectedException(INTEGRITY_MISMATCH,"DOCUMENT_DIGEST_MISMATCH",containerId,"JSON pointer "+prefix);
                for(String field:List.of("end_reason","collision")){
                    Object stored=at(document,field.equals("collision")?"/outcome/metrics/collision":"/outcome/end_reason");
                    if(manifest.containsKey(field)&&!Objects.equals(manifest.get(field),stored))throw reject("MANIFEST_RESULT_COPY_DISAGREEMENT",prefix+"/outcome");
                }
            }
            if(wrapperId!=null)for(String field:List.of("project_id","scenario_id","variant_id")){
                Object collection=at(root,"/collection/"+field);if(collection!=null&&!sameId(collection,at(document,"/dataset/identity/"+field)))throw reject("INCONSISTENT_IDENTITY",prefix+"/dataset/identity/"+field);
            }
            Map<String,Artifact> artifacts=new LinkedHashMap<>();
            Artifact container=new Artifact(containerId,null,uri,containerHash,"application/json",containerIntegrity,null,List.of(),obj("hash_scope","CONTAINER_BYTES","independently_expected_sha256",expectedHash));artifacts.put("json_container",container);
            List<Issue> resultIssues=new ArrayList<>();
            for(var parameter:BaselineBindingResolver.PARAMETERS.entrySet()){
                Object stored=at(document,"/outcome/params/"+parameter.getValue()),copy=at(document,"/dataset/config/aeb/params/"+parameter.getKey());
                if(stored!=null&&copy!=null&&!sameNumber(stored,copy))resultIssues.add(new Issue(Status.CONFLICTING,"INCONSISTENT_IDENTITY",new SourceRef(containerId+":"+key+":result",prefix+"/dataset/config/aeb/params/"+parameter.getKey()),"Actual parameter copies differ"));
            }
            add(artifacts,"result",document,prefix,key,null,document,null,resultIssues);
            addTable(artifacts,"frames",document,prefix,key);
            addTable(artifacts,"ground_truth",document,prefix,key);
            add(artifacts,"collisions",at(document,"/dataset/collisions/events"),prefix+"/dataset/collisions/events",key,"collisions.events",document,"sensors/collisions.json",List.of());
            add(artifacts,"summary",at(document,"/dataset/sensors/summary"),prefix+"/dataset/sensors/summary",key,"sensors.summary",document,"sensors/summary.json",List.of());
            add(artifacts,"bundle",at(document,"/dataset/config"),prefix+"/dataset/config",key,null,document,"bundle.json",List.of());
            for(String name:List.of("lifecycle","vsos-core","environment","metadata","case_manifest","manifest"))
                artifacts.put(name,new Artifact(containerId+":"+key+":"+name,key,uri,null,"application/json",Integrity.UNVERIFIED,null,
                    List.of(new Issue(Status.UNKNOWN,"SOURCE_MISSING",new SourceRef(containerId,prefix+"/dataset/provenance"),"Original "+name+" bytes not embedded; no synthetic artifact created"))));
            Run run=new Run(key,variant,"json/"+variant,artifacts,issues);
            List<Issue> intake=new ArrayList<>(issues);artifacts.values().forEach(a->intake.addAll(a.issues()));return new Entry(key,prefix,run,intake);
        }catch(InputRejectedException e){
            if(e.kind()==RESOURCE_LIMIT_EXCEEDED)throw e;
            issues.add(issue(Status.INVALID,e.reason(),prefix,e.getMessage()));return new Entry(key==null?wrapperId:key,prefix,null,issues);
        }
    }
    private void addTable(Map<String,Artifact> artifacts,String name,Object document,String prefix,String key){
        String pointer="/dataset/time_series/"+name;Object raw=at(document,pointer);List<Issue> problems=new ArrayList<>();
        List<String> columns=new ArrayList<>();List<Map<String,Object>> rows=new ArrayList<>();Object normalized=null;
        if(raw!=null){
            boolean valid=at(raw,"/columns") instanceof List<?> && at(raw,"/rows") instanceof List<?>;
            if(valid){
                var names=(List<?>)at(raw,"/columns");var values=(List<?>)at(raw,"/rows");
                budget.check(names.size(),budget.policy.maxColumns(),"EMBEDDED_COLUMNS",containerId);budget.check(values.size(),budget.policy.maxRecords(),"EMBEDDED_RECORDS",containerId);
                for(Object value:names)if(value instanceof String s&&!s.isBlank()&&!columns.contains(s))columns.add(s);else valid=false;
                if(columns.isEmpty()||!columns.containsAll(name.equals("frames")?List.of("frame","sim_time_s"):List.of("frame","sim_time_s","actor_id","role")))valid=false;
                if(valid)for(Object value:values){if(!(value instanceof List<?> cells)||cells.size()!=columns.size()){valid=false;break;}
                    budget.retain(BoundedInput.checkedAdd(128,columns.size()*128L,containerId),containerId);budget.work(columns.size(),containerId);
                    Map<String,Object> row=new LinkedHashMap<>();for(int j=0;j<columns.size();j++)row.put(columns.get(j),cells.get(j));rows.add(row);}
                Object count=at(raw,"/row_count");if(!(count instanceof Number)||!count.toString().equals(Integer.toString(values.size())))valid=false;
            }
            if(valid)normalized=rows;else problems.add(new Issue(Status.INVALID,"EMBEDDED_TABLE_INVALID",new SourceRef(containerId,prefix+pointer),"Invalid columns/rows/count; entire table quarantined"));
        }
        Object payload=raw instanceof Map<?,?>?obj("columns",at(raw,"/columns"),"rows",at(raw,"/rows")):null;
        add(artifacts,name,normalized,prefix+pointer,key,"time_series."+name,document,"sensors/"+name+".csv",problems,payload,columns);
    }
    private void add(Map<String,Artifact> artifacts,String name,Object data,String pointer,String key,String payloadKey,Object document,String original,List<Issue> issues){
        add(artifacts,name,data,pointer,key,payloadKey,document,original,issues,data,List.of());
    }
    private void add(Map<String,Artifact> artifacts,String name,Object data,String pointer,String key,String payloadKey,Object document,String original,List<Issue> supplied,Object payload,List<String> columns){
        List<Issue> issues=new ArrayList<>(supplied);Integrity integrity=containerIntegrity;
        Map<String,Object> provenance=obj("adapter_version",VERSION,"input_format",root.get("format"),"container_id",containerId,"container_sha256_bytes",containerHash,
            "independently_expected_container_sha256",expectedHash,"hash_scope","CONTAINER_BYTES_NOT_ORIGINAL_EXTERNAL_FILE",
            "json_root_pointer",pointer,"external_source_integrity","UNVERIFIED","declared_source_file",original==null?null:at(document,"/dataset/provenance/files/"+escape(original)));
        if(!columns.isEmpty())provenance.put("table_columns",columns);
        if(name.equals("result")){
            provenance.put("declared_status",at(document,"/dataset/status"));provenance.put("declared_clock",at(document,"/dataset/time_series/clock"));
            provenance.put("declared_time_origin",at(document,"/dataset/time_series/time_origin"));
            provenance.put("declared_units",at(document,"/dataset/time_series/units"));provenance.put("declared_coordinate_system",at(document,"/dataset/time_series/coordinate_system"));
            provenance.put("declared_producer_provenance",at(document,"/dataset/provenance"));
            if(root.containsKey("collection"))provenance.put("declared_collection_context",obj("metadata",root.get("collection"),"status",root.get("status"),
                "source_ref",new SourceRef(containerId,"/collection").json(),"authority","EXPORT_METADATA_ONLY_NOT_FROZEN_SELECTION"));
            provenance.put("declared_signal_quality",at(document,"/dataset/time_series/quality"));
            provenance.put("declared_derived_role",at(document,"/dataset/derived/role"));
        }
        Object expected=payloadKey==null?null:at(document,"/dataset/provenance/embedded_payloads/"+escape(payloadKey));
        boolean sourceShape=data==null||switch(name){case "collisions"->data instanceof List<?>;case "summary","bundle","result"->data instanceof Map<?,?>;default->true;};
        if(!sourceShape){issues.add(new Issue(Status.INVALID,"EMBEDDED_SOURCE_TYPE_INVALID",new SourceRef(containerId,pointer),"Invalid embedded source shape"));data=null;}
        if(expected!=null&&payload!=null&&digestProfile(at(document,"/dataset/provenance/embedded_payloads/spec"))){
            String actual=digest(payload,pointer);boolean valid=expected instanceof String s&&s.matches("[a-f0-9]{64}")&&expected.equals(actual);
            provenance.put("embedded_digest",obj("profile","ADR065_PYTHON_JSON_DUMPS_ENSURE_ASCII_FALSE_DEFAULT_SEPARATORS","declared",expected,"actual",actual,"status",valid?"MATCH":"MISMATCH","authority","SELF_DECLARED_CONSISTENCY_ONLY"));
            if(!valid){integrity=Integrity.FAILED;issues.add(new Issue(Status.INVALID,"EMBEDDED_PAYLOAD_HASH_MISMATCH",new SourceRef(containerId,pointer),"Embedded payload differs from its declared digest"));data=null;}
        }else if(expected!=null){
            provenance.put("embedded_digest",obj("declared",expected,"actual",null,"status","UNKNOWN","authority","SELF_DECLARED_ONLY"));
            issues.add(new Issue(Status.UNKNOWN,"EMBEDDED_DIGEST_PROFILE_OR_PAYLOAD_MISSING",new SourceRef(containerId,pointer),"Cannot verify this payload digest"));
        }
        if(!issues.isEmpty()&&issues.stream().anyMatch(i->i.status()==Status.INVALID)){integrity=Integrity.FAILED;data=null;}
        if(data==null&&issues.isEmpty())issues.add(new Issue(Status.UNKNOWN,"SOURCE_MISSING",new SourceRef(containerId,pointer),"Embedded evidence is absent/null"));
        reserve(data,pointer);reserve(provenance,pointer);
        artifacts.put(name,new Artifact(containerId+":"+key+":"+name,key,uri,containerHash,"application/json",integrity,data,issues,provenance));
    }
    /** Reserve immutable copies / encoding before allocating them. Not an exact heap measurement. */
    private void reserve(Object value,String source){
        Deque<Object> todo=new ArrayDeque<>();if(value!=null)todo.push(value);long charge=0;
        while(!todo.isEmpty()){Object x=todo.pop();budget.work(1,source);charge=BoundedInput.checkedAdd(charge,128,source);
            if(x instanceof Map<?,?> m){for(var e:m.entrySet()){charge=BoundedInput.checkedAdd(charge,e.getKey().toString().length()*4L,source);if(e.getValue()!=null)todo.push(e.getValue());}}
            else if(x instanceof List<?> list){for(Object item:list)if(item!=null)todo.push(item);}
            else if(x instanceof String s)charge=BoundedInput.checkedAdd(charge,s.length()*4L,source);
        }budget.retain(charge,source);
    }
    private String digest(Object data,String source){
        reserve(data,source);Deque<Object> todo=new ArrayDeque<>();if(data!=null)todo.push(data);long upper=4;
        while(!todo.isEmpty()){Object x=todo.pop();budget.work(1,source);long n=32;
            if(x instanceof String s)n=BoundedInput.checkedAdd(s.length()*6L,2,source);
            else if(x instanceof Map<?,?> m){n=2;for(var e:m.entrySet()){n=BoundedInput.checkedAdd(n,e.getKey().toString().length()*6L+8,source);if(e.getValue()!=null)todo.push(e.getValue());else n=BoundedInput.checkedAdd(n,4,source);}}
            else if(x instanceof List<?> list){n=BoundedInput.checkedAdd(2,list.size()*2L,source);for(Object item:list)if(item!=null)todo.push(item);else n=BoundedInput.checkedAdd(n,4,source);}
            upper=BoundedInput.checkedAdd(upper,n,source);budget.check(upper,budget.policy.maxMemberBytes(),"DIGEST_SERIALIZATION_UPPER_BOUND",source);
        }
        budget.retain(upper*4,source);String text=MiniJson.write(data);budget.check(text.length(),budget.policy.maxMemberBytes(),"DIGEST_DOCUMENT_CHARS",source);
        budget.work(text.length(),source);return sha256(text);
    }
    private static boolean digestProfile(Object spec){return spec instanceof String s&&s.contains("Python json.dumps")&&s.contains("ensure_ascii=False");}
    public static boolean supports(Run run){return run.artifact("result")!=null&&VERSION.equals(run.artifact("result").provenance().get("adapter_version"));}
    public static Map<String,Object> declaredIdentity(Run run){
        Map<String,Object> out=new LinkedHashMap<>();for(String field:List.of("run_id","project_id","scenario_id","variant_id","aeb_version_id","carla_vehicle_model_id","seed","aeb_mode","repetition","attempt","purpose")){
            Object v=run.get("result","/dataset/identity/"+field);if(v!=null&&field.endsWith("_id"))v=v.toString();
            out.put(field,v==null?unknown("DECLARED_IDENTITY_MISSING",null).json():value(v,Status.CONDITIONAL,null,null,List.of(run.ref("result","/dataset/identity/"+field)),"PRODUCER_DECLARED_NOT_AUTHORIZED_BINDING").json());
        }return out;
    }
    @Override public void close(){closed=true;entries.clear();collectionIssues.clear();root.clear();}
}
