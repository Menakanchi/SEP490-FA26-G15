import com.vsos.core.failureanalysis.*;
import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** One-off offline review export from the supplied real JSON. No production adapter/dispatch. */
public final class ExportMoboRun2499 {
    @SuppressWarnings("unchecked") public static void main(String[] args)throws Exception {
        Path input=Path.of(args[0]).toRealPath(),output=Path.of(args[1]).toAbsolutePath(),repo=Path.of(args[2]).toRealPath();
        if(Files.exists(output)||input.equals(output))throw new IllegalArgumentException("Output exists or overlaps input");
        var budget=new BoundedInput(InputResourcePolicy.defaults());byte[] bytes=budget.read(input,input.toString());
        Map<String,Object> raw=(Map<String,Object>)budget.parse(bytes,"application/json",input.toString());
        if(!sha256(bytes).equals("e7957e2467628058453a6724fce09c96ce2ab810d70efcc3e92aaf11a1d7bf81"))throw new IllegalArgumentException("Previously inspected input has changed");
        SampleInputProbe.root=raw;SampleInputProbe.hash=sha256(bytes);SampleInputProbe.uri=input.toUri().toString();
        SampleInputProbe.key=at(raw,"/dataset/identity/run_id").toString();SampleInputProbe.artifacts.clear();
        SampleInputProbe.view("result","",raw);
        for(String name:List.of("frames","ground_truth"))SampleInputProbe.view(name,"/dataset/time_series/"+name,SampleInputProbe.rows(at(raw,"/dataset/time_series/"+name)));
        SampleInputProbe.view("collisions","/dataset/collisions/events",at(raw,"/dataset/collisions/events"));
        SampleInputProbe.view("summary","/dataset/sensors/summary",at(raw,"/dataset/sensors/summary"));
        SampleInputProbe.view("bundle","/dataset/config",at(raw,"/dataset/config"));
        for(String name:List.of("lifecycle","vsos-core","environment","metadata","case_manifest","manifest"))SampleInputProbe.view(name,"/not-embedded/"+name,null);
        var run=new Run(SampleInputProbe.key,at(raw,"/dataset/identity/variant_id").toString(),"embedded/"+at(raw,"/dataset/identity/variant_id"),SampleInputProbe.artifacts,List.of());
        var diagnostic=new DiagnosticReport().analyze(run);
        List<Artifact> sources=new ArrayList<>();
        for(String path:List.of("src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java",
            "src/main/java/com/vsos/backend/service/analysis/AnalysisService.java","src/main/java/com/vsos/backend/service/optimization/OptimizationService.java",
            "src/main/java/com/vsos/core/mobo/MoboEngine.java","src/main/java/com/vsos/core/mobo/ParameterBounds.java"))sources.add(HandoffSnapshots.source(repo.resolve(path),path));
        var original=new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(List.of(new MoboHandoffBuilder.MemberInput(run,diagnostic)),null,null,
            SearchRangeResolver.repositorySources(repo),HandoffSnapshots.source(repo.resolve("src/main/java/com/vsos/core/aeb/AebStack.java"),"aeb-mechanism-source"),sources));
        var result=new LinkedHashMap<String,Object>(original);
        Map<String,Object> recorded=new LinkedHashMap<>();
        for(var entry:new CanonicalObjectiveReader().read(run).entrySet())recorded.put(entry.getKey(),obj("canonical_value",entry.getValue().canonicalValue().json(),
            "evaluation_copy",entry.getValue().evaluationCopy().json(),"copy_agreement",entry.getValue().copyAgreement(),"usage","RECORDED_PER_RUN_NOT_FROZEN_BASELINE_SCORE"));
        // Keep all M1C fields unchanged. The versioned extension preserves declared ADR065
        // IDs/scalars without promoting them to authorized baseline/partition identity.
        result.put("extensions",obj("adr065_single_run_review",obj("extension_version","adr065-single-run-review/1",
            "export_status","OFFLINE_REVIEW_ONLY","input_file",input.getFileName().toString(),"input_byte_sha256",sha256(bytes),
            "identity_basis","DECLARED_BY_INPUT_NOT_AUTHORIZED_PROJECT_BASELINE_BINDING",
            "declared_identity",at(raw,"/dataset/identity"),"declared_configuration",at(raw,"/dataset/config"),
            "declared_provenance",at(raw,"/dataset/provenance"),"recorded_objectives",recorded,
            "diagnostic_report",diagnostic,"diagnostic_report_lookup",obj("report:"+run.runKey(),"/extensions/adr065_single_run_review/diagnostic_report"),
            "embedded_view_mapping",obj("implementation","ONE_OFF_REVIEW_HELPER_NOT_PRODUCTION_INPUT_ADAPTER",
                "root_artifact_id",run.artifact("result").id(),"integrity","UNVERIFIED",
                "frames",obj("source_json_pointer","/dataset/time_series/frames","row_mapping","rows[i][j] -> object[columns[j]]"),
                "ground_truth",obj("source_json_pointer","/dataset/time_series/ground_truth","row_mapping","rows[i][j] -> object[columns[j]]"),
                "reference_scope","Diagnostic row-object locators refer to mapped views; resolve through this mapping, not as direct pointers into original tables",
                "hash_scope","View SHA identifies the whole input JSON container, not original external CSV/member bytes"),
            "parameter_hint_assessment",obj("status","ABSTAIN","reason_codes",List.of("NO_REVIEWED_OPTIMIZATION_PARTITION","CAUSAL_PARAMETER_EVIDENCE_UNAPPROVED")),
            "execution",obj("dispatch_allowed",false,"optimizer_called",false,"baseline_scores_generated",false,"search_ranges_invented",false),
            "limitations",List.of("ONE_RUN_ONLY_NO_OFF_CONTROL_OR_REPETITIONS","FROZEN_SELECTION_AND_QUALITY_POLICY_MISSING",
                "DECLARED_IDS_NOT_VERIFIED_BASELINE_BINDING","EXTERNAL_SOURCE_HASHES_UNVERIFIED","CORE_RECORDER_CLOCK_BINDING_UNKNOWN",
                "CONTROL_WRITER_UNKNOWN","CALIBRATION_DOMAIN_UNKNOWN","CURRENT_MOBO_CONSUMER_HAS_NO_V31_HANDOFF_ADAPTER",
                "VERSIONED_REVIEW_EXTENSION_IS_NOT_AN_OPTIMIZATION_REQUEST_FIELD"))));
        result.put("content_digest",HandoffSnapshots.digest(result));
        Files.writeString(output,MiniJson.write(result)+System.lineSeparator(),StandardOpenOption.CREATE_NEW);
        if(!sha256(Files.readAllBytes(input)).equals(sha256(bytes)))throw new IllegalStateException("Input mutated during export");
        System.out.println(MiniJson.write(obj("output",output.toString(),"input_run",run.runKey(),"semantic_digest",result.get("content_digest"),
            "baseline_scores",at(result,"/baseline_objectives/availability"),"eligibility",at(result,"/eligibility_manifest/overall"),"dispatch_allowed",false)));
    }
}
