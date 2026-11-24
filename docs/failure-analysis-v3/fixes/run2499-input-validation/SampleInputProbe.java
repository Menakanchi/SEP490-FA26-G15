import com.vsos.core.failureanalysis.*;
import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Test-only bridge over embedded JSON views. NOT a production input adapter.
 * No reconstruction of original CSV bytes or assertion of external hash integrity.
 * All input views remain UNVERIFIED, use the whole JSON's computed hash and pointer URI.
 */
public final class SampleInputProbe {
    static Map<String,Object> root;
    static String hash,uri,key;
    static Map<String,Artifact> artifacts=new LinkedHashMap<>();
    static void view(String name,String pointer,Object data) {
        String id="sample-run2499"+pointer;
        var issues=data==null?List.of(new Issue(Status.UNKNOWN,"SOURCE_MISSING",new SourceRef(id,""),"Not embedded in sample")):List.<Issue>of();
        artifacts.put(name,new Artifact(id,key,uri+"#"+pointer,data==null?null:hash,"application/json",Integrity.UNVERIFIED,data,issues));
    }
    static List<Object> rows(Object table) {
        var cols=(List<?>)at(table,"/columns");var values=(List<?>)at(table,"/rows");
        List<Object> out=new ArrayList<>();
        for(Object value:values){var row=(List<?>)value;if(row.size()!=cols.size())throw new IllegalArgumentException("Row width");
            Map<String,Object> mapped=new LinkedHashMap<>();for(int i=0;i<cols.size();i++)mapped.put(cols.get(i).toString(),row.get(i));out.add(mapped);}
        return out;
    }
    @SuppressWarnings("unchecked") public static void main(String[] args)throws Exception {
        Path input=Path.of(args[0]);Path out=Path.of(args[1]);
        BoundedInput budget=new BoundedInput(InputResourcePolicy.defaults());
        byte[] bytes=budget.read(input,input.toString());root=(Map<String,Object>)budget.parse(bytes,"application/json",input.toString());
        hash=sha256(bytes);uri=input.toUri().toString();key=at(root,"/dataset/identity/run_id").toString();
        view("result","",root);
        for(String name:List.of("frames","ground_truth"))view(name,"/dataset/time_series/"+name,rows(at(root,"/dataset/time_series/"+name)));
        view("collisions","/dataset/collisions/events",at(root,"/dataset/collisions/events"));
        view("summary","/dataset/sensors/summary",at(root,"/dataset/sensors/summary"));
        view("bundle","/dataset/config",at(root,"/dataset/config"));
        // No fabricated lifecycle/environment/DB binding or approved context.
        for(String name:List.of("lifecycle","vsos-core","environment","metadata","case_manifest","manifest"))view(name,"/not-embedded/"+name,null);
        var run=new Run(key,at(root,"/dataset/identity/variant_id").toString(),"embedded/"+at(root,"/dataset/identity/variant_id"),artifacts,List.of());
        var checks=new ArrayList<Map<String,Object>>();
        new CanonicalObjectiveReader().read(run).forEach((name,v)->checks.add(obj("metric",name,"value",v.canonicalValue().value(),"status",v.canonicalValue().status().name(),"copy_agreement",v.copyAgreement())));
        var report=new DiagnosticReport().analyze(run);
        Files.createDirectories(out);
        Files.writeString(out.resolve("TEST_ONLY-mapped-diagnostic.json"),MiniJson.write(report),StandardOpenOption.CREATE_NEW);
        var summary=obj("scope","TEST_ONLY_EMBEDDED_VIEW_MAPPING_NOT_PRODUCTION_ADAPTER","input_sha256",hash,"all_artifact_integrity","UNVERIFIED",
            "canonical_objectives",checks,"resource_counters",budget.counters(),"validation_issues",new EvidenceValidator().validate(run).stream().map(Issue::json).toList(),
            "physical_outcome",at(report,"/report/physical_outcome"),"timeline",at(report,"/report/aeb_timeline"),"diagnosis",at(report,"/report/diagnosis"));
        Files.writeString(out.resolve("java-probe-summary.json"),MiniJson.write(summary),StandardOpenOption.CREATE_NEW);
        System.out.println(MiniJson.write(obj("scope",summary.get("scope"),"canonical_objectives",checks,"resource_counters",budget.counters(),"physical_outcome",summary.get("physical_outcome"))));
    }
}
