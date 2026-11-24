package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Explicit offline inputs. A byte hash proves integrity, not reviewer authority or DB freshness. */
public final class HandoffSnapshots {
    private HandoffSnapshots() {}
    public static Artifact read(Path path, String id, String independentlyExpectedSha256) throws IOException {
        byte[] bytes=Files.readAllBytes(path);String hash=sha256(bytes);
        Integrity integrity=independentlyExpectedSha256==null?Integrity.UNVERIFIED:
                hash.equals(independentlyExpectedSha256)?Integrity.VERIFIED:Integrity.FAILED;
        List<Issue> issues=new ArrayList<>();Object data=null;SourceRef ref=new SourceRef(id,"");
        if(integrity==Integrity.FAILED)issues.add(new Issue(Status.INVALID,"HASH_MISMATCH",ref,"Offline input hash differs"));
        try{data=MiniJson.parseObject(new String(bytes,StandardCharsets.UTF_8));}
        catch(IllegalArgumentException e){issues.add(new Issue(Status.INVALID,"SCHEMA_PARSE_ERROR",ref,e.getMessage()));}
        return new Artifact(id,"external",path.getFileName().toString(),hash,"application/json",integrity,data,issues);
    }
    public static Artifact source(Path path,String id) throws IOException {
        byte[] bytes=Files.readAllBytes(path);
        return new Artifact(id,"source",path.toString(),sha256(bytes),"text/x-java-source",Integrity.VERIFIED,null,List.of());
    }
    static boolean verified(Artifact a,String schema){return a!=null&&a.usable()&&a.integrity()==Integrity.VERIFIED
            &&hash(a.sha256())&&schema.equals(at(a.data(),"/schema"));}
    static boolean hash(Object x){return x instanceof String s&&s.matches("[a-f0-9]{64}");}
    static boolean id(Object x){return x!=null&&x.toString().matches("[1-9]\\d*");}
    static boolean text(Object x){return x instanceof String s&&!s.isBlank();}
    static boolean integer(Object x){return x instanceof Number&&x.toString().matches("-?\\d+");}
    static Map<String,Object> map(Object x){
        if(!(x instanceof Map<?,?> m))return Map.of();
        Map<String,Object> out=new LinkedHashMap<>();m.forEach((k,v)->out.put(k.toString(),v));return out;
    }
    static List<Object> list(Object x){return x instanceof List<?> l?new ArrayList<>(l):List.of();}
    static String str(Object x){return x==null?null:x.toString();}
    static Map<String,Object> unknownJson(String reason){return unknown(reason,null).json();}
    static Map<String,Object> observed(Object x,Artifact a,String path,String unit){
        return x==null?unknown("FIELD_MISSING",unit).json():value(x,Status.OBSERVED,unit,null,List.of(new SourceRef(a.id(),path))).json();
    }
    static Map<String,Object> derived(Object x,String formula,List<SourceRef> refs){
        return new Value(x,Status.DERIVED,null,null,refs,List.of(),formula).json();
    }
    /** Distinct profile from AnalysisService's Jackson digest and from byte SHA256. List order is significant. */
    public static String digest(Map<String,Object> value){
        Map<String,Object> stable=new LinkedHashMap<>(value);
        stable.remove("handoff_id");stable.remove("created_at_utc");stable.remove("content_digest");
        return EvidenceReport.contentDigest(stable);
    }
    static boolean reportValid(Map<String,Object> r,Run run){
        if(r==null||!"vehicsim.failure-analysis/v1".equals(r.get("schema_version"))
                ||!run.runKey().equals(at(r,"/input/run_key")))return false;
        try{return Objects.equals(r.get("content_digest"),EvidenceReport.contentDigest(r));}
        catch(RuntimeException e){return false;}
    }
    static boolean cited(Object value){
        return !list(value).isEmpty()&&list(value).stream().allMatch(x->text(at(x,"/artifact_id"))&&at(x,"/locator") instanceof String);
    }
    static boolean supportedGate(Object x){
        return Boolean.TRUE.equals(at(x,"/value"))&&Arrays.asList("OBSERVED","DERIVED").contains(str(at(x,"/status")))
                &&cited(at(x,"/source_refs"))&&(!"DERIVED".equals(at(x,"/status"))||text(at(x,"/formula_id")));
    }
}
