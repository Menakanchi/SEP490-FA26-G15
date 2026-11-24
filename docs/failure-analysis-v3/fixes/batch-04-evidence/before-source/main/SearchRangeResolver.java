package com.vsos.core.failureanalysis;

import com.vsos.core.mobo.ParameterBounds;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Sourced intervals, never a parameter proposal. Catalog seed is deliberately not a live approval. */
public final class SearchRangeResolver {
    public record Domains(Artifact catalogSource,Artifact engineSource,Artifact liveCatalog,Artifact approvedCampaign,List<Artifact> modelConstraints){
        public Domains{modelConstraints=List.copyOf(modelConstraints);}
        public List<Artifact> artifacts(){List<Artifact> a=new ArrayList<>();
            for(Artifact x:Arrays.asList(catalogSource,engineSource,liveCatalog,approvedCampaign))if(x!=null)a.add(x);
            a.addAll(modelConstraints);return List.copyOf(a);}
    }
    public record Scope(String projectId,String baselineVersionId,String selectionSha256) {}
    public static String unit(String code){return switch(code){case "MAX_DECELERATION"->"m/s\u00b2";case "BRAKE_BUILDUP_RATE"->"m/s\u00b3";default->"s";};}
    /** Reads checked-out catalog code; no copied numeric catalog constants and no DB access. */
    public static Domains repositorySources(Path repository) throws IOException {
        Path catalog=repository.resolve("src/main/java/com/vsos/backend/service/system/BootstrapService.java");
        byte[] bytes=Files.readAllBytes(catalog);String source=new String(bytes,StandardCharsets.UTF_8);Map<String,Object> intervals=new TreeMap<>();
        Pattern row=Pattern.compile("new Object\\[\\]\\{\\\"([A-Z_]+)\\\",\\s*\\\"[^\\\"]+\\\",\\s*\\\"[^\\\"]+\\\",\\s*\\\"[^\\\"]+\\\",\\s*([0-9.]+),\\s*([0-9.]+),");
        Matcher matcher=row.matcher(source);while(matcher.find())if(BaselineBindingResolver.PARAMETERS.containsKey(matcher.group(1)))
            intervals.put(matcher.group(1),obj("lower",Double.valueOf(matcher.group(2)),"upper",Double.valueOf(matcher.group(3)),"unit",unit(matcher.group(1))));
        if(!intervals.keySet().equals(BaselineBindingResolver.PARAMETERS.keySet()))throw new IOException("CATALOG_SOURCE_UNSUPPORTED: expected four source rows");
        Artifact cat=new Artifact("catalog-source","external",repository.relativize(catalog).toString(),sha256(bytes),"text/x-java-source",Integrity.VERIFIED,
                obj("schema","vehicsim.sourced-parameter-domain/v1","scope","SOURCE_SEED_ONLY","intervals",intervals),List.of());
        Path engine=repository.resolve("src/main/java/com/vsos/core/mobo/ParameterBounds.java");Map<String,Object> bounds=new TreeMap<>();
        var defaults=ParameterBounds.defaults();for(String key:BaselineBindingResolver.PARAMETERS.keySet())
            bounds.put(key,obj("lower",defaults.lower(key),"upper",defaults.upper(key),"unit",unit(key)));
        Artifact eng=new Artifact("engine-domain","external",repository.relativize(engine).toString(),sha256(Files.readAllBytes(engine)),"text/x-java-source",Integrity.VERIFIED,
                obj("schema","vehicsim.sourced-parameter-domain/v1","scope","LOADED_ENGINE_DEFAULTS","intervals",bounds,
                        "runtime_source_equivalence","UNKNOWN"),List.of());
        return new Domains(cat,eng,null,null,List.of());
    }
    public Map<String,Object> resolve(Domains domains,Scope scope){
        Map<String,Object> out=new TreeMap<>();
        for(String code:BaselineBindingResolver.PARAMETERS.keySet()){
            List<String> reasons=new ArrayList<>();Artifact cat=domains==null?null:domains.catalogSource(),eng=domains==null?null:domains.engineSource(),
                    live=domains==null?null:domains.liveCatalog(),campaign=domains==null?null:domains.approvedCampaign();
            Object seed=range(cat,code,false,reasons),engine=range(eng,code,false,reasons);
            boolean liveOk=authorized(live,"CATALOG_LIVE",scope),campaignOk=authorized(campaign,"CAMPAIGN_APPROVED",scope);
            Object liveRange=liveOk?range(live,code,true,reasons):null,approved=campaignOk?range(campaign,code,true,reasons):null;
            if(!liveOk)reasons.add("LIVE_CATALOG_AUTHORITY_UNKNOWN");if(!campaignOk)reasons.add("CAMPAIGN_DOMAIN_UNAPPROVED_OR_SCOPE_MISMATCH");
            boolean complete=liveOk&&campaignOk&&engine!=null&&liveRange!=null&&approved!=null;
            if(campaignOk&&!Boolean.TRUE.equals(at(campaign.data(),"/model_constraints_complete"))){complete=false;reasons.add("MODEL_CONSTRAINT_REVIEW_INCOMPLETE");}
            List<Object> all=new ArrayList<>();if(engine!=null)all.add(engine);if(liveRange!=null)all.add(liveRange);if(approved!=null)all.add(approved);
            List<SourceRef> refs=new ArrayList<>();List<Map<String,Object>> constraints=new ArrayList<>();
            for(Artifact a:Arrays.asList(eng,live,campaign))if(a!=null)refs.add(new SourceRef(a.id(),"/intervals/"+code));
            if(domains!=null)for(Artifact model:domains.modelConstraints()){
                if(!authorized(model,"MODEL_CONSTRAINT",scope)||!text(at(model.data(),"/model_id"))||!hash(at(model.data(),"/model_sha256"))
                        ||!cited(at(model.data(),"/validation_refs"))){complete=false;reasons.add("MODEL_CONSTRAINT_UNVERIFIED");continue;}
                if(at(model.data(),"/intervals/"+code)!=null){Object interval=range(model,code,true,reasons);if(interval==null)complete=false;else all.add(interval);
                    SourceRef ref=new SourceRef(model.id(),"/intervals/"+code);refs.add(ref);constraints.add(ref.json());}
            }
            Map<String,Object> suggested=unknown("REQUIRED_DOMAIN_UNKNOWN",unit(code)).json();String eligibility="UNKNOWN";
            if(complete){double lo=all.stream().mapToDouble(x->((Number)at(x,"/lower")).doubleValue()).max().orElseThrow(),
                    hi=all.stream().mapToDouble(x->((Number)at(x,"/upper")).doubleValue()).min().orElseThrow();
                if(lo>=hi){eligibility="EXCLUDED";reasons.add(lo==hi?"FIXED_DIMENSION_UNSUPPORTED":"EMPTY_ALLOWED_SEARCH_DOMAIN");
                    suggested=unknown(lo==hi?"FIXED_DIMENSION_UNSUPPORTED":"EMPTY_ALLOWED_SEARCH_DOMAIN",unit(code)).json();}
                else{eligibility="ELIGIBLE";suggested=new Value(obj("lower",lo,"upper",hi),Status.DERIVED,unit(code),null,refs,List.of(),"fa-sourced-domain-intersection/1").json();}
            }
            out.put(code,obj("unit",unit(code),"catalog_domain",domainEv(seed,cat,code),"catalog_scope","SOURCE_SEED_ONLY",
                    "live_catalog_domain",domainEv(liveRange,live,code),"engine_domain",domainEv(engine,eng,code),
                    "approved_campaign_domain",domainEv(approved,campaign,code),"applicable_model_constraints",constraints,
                    "suggested_range",suggested,"eligibility",eligibility,"method",eligibility.equals("ELIGIBLE")?"INTERSECTION_OF_SOURCED_DOMAINS":"ABSTAIN",
                    "consumer_enforcement","NOT_SUPPORTED","reason_codes",reasons.stream().distinct().toList()));
        }return out;
    }
    private static Map<String,Object> domainEv(Object range,Artifact a,String code){return range==null?unknown("DOMAIN_MISSING_OR_INVALID",unit(code)).json():observed(range,a,"/intervals/"+code,unit(code));}
    private static boolean authorized(Artifact a,String kind,Scope s){
        return verified(a,"vehicsim.search-domain-snapshot/v1")&&kind.equals(at(a.data(),"/kind"))&&"APPROVED".equals(at(a.data(),"/status"))
                &&text(at(a.data(),"/version"))&&s!=null&&id(s.projectId())&&id(s.baselineVersionId())&&hash(s.selectionSha256())
                &&s.projectId().equals(str(at(a.data(),"/project_id")))&&s.baselineVersionId().equals(str(at(a.data(),"/baseline_version_id")))
                &&s.selectionSha256().equals(at(a.data(),"/selection_sha256"))
                &&Arrays.asList("EXTERNAL_POLICY","OPTIMIZATION").contains(str(at(a.data(),"/basis_partition")))&&cited(at(a.data(),"/approval_refs"));
    }
    private static Object range(Artifact a,String code,boolean approved,List<String> reasons){
        if(a==null||!a.usable()||a.integrity()!=Integrity.VERIFIED)return null;
        if(!approved&&!verified(a,"vehicsim.sourced-parameter-domain/v1"))return null;
        Object x=at(a.data(),"/intervals/"+code);Object lo=at(x,"/lower"),hi=at(x,"/upper");
        if(!unit(code).equals(at(x,"/unit"))||!finiteNonnegative(lo)||!finiteNonnegative(hi)||((Number)lo).doubleValue()>((Number)hi).doubleValue()){
            reasons.add("INVALID_DOMAIN:"+a.id()+":"+code);return null;}
        return obj("lower",lo,"upper",hi);
    }
}
