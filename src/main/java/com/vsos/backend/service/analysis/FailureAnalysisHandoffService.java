package com.vsos.backend.service.analysis;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.RunEvidence;
import com.vsos.backend.common.analysis.FailureAnalysisJson;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.backend.repository.analysis.FailureAnalysisStore;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind;
import com.vsos.backend.repository.analysis.FailureAnalysisStore.Resource;
import com.vsos.backend.repository.common.*;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import com.vsos.core.mobo.ParameterBounds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.io.*;
import java.time.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.backend.common.analysis.FailureAnalysisJson.*;

/** Authenticated dataset review, DB authority resolution and the V3 optimizer boundary.
 * Reuses existing immutable selection and analysis storage; never substitutes a V2 dataset
 * when a requested V3 handoff is absent or invalid. No physics attestations are manufactured. */
@Service
public class FailureAnalysisHandoffService {
    public record Review(long dataset_id, String dataset_digest, boolean confirmed, String reason,
                         boolean canonical_targets_only, boolean calibration_not_applicable,
                         List<Long> nonhazard_run_ids, Map<String,Object> search_space) {}
    public record Approved(Map<String,Object> snapshot, List<RestJsonAnalysis.Parsed> inputs, byte[] sourceBytes) {
        public String id() { return snapshot.get("context_id").toString(); }
        public String digest() { return snapshot.get("context_digest").toString(); }
        public FailureAnalysisHandoffAdapter adapter() { return new FailureAnalysisHandoffAdapter(snapshot); }
        public Map<String,Object> acquisition() { return obj("origin","MODULE2_RESULT_DATABASE","selection_kind","COLLECTION",
                "context_id",id(),"context_digest",digest(),"project_id",snapshot.get("project_id"),
                "original_result_bytes_preserved",true,"members",snapshot.get("members")); }
    }
    private final Db db; private final Queries queries; private final AnalysisService analysis;
    private final FailureAnalysisStore store; private final TransactionTemplate tx;
    public FailureAnalysisHandoffService(Db db, Queries queries, AnalysisService analysis, FailureAnalysisStore store, TransactionTemplate tx) {
        this.db=db;this.queries=queries;this.analysis=analysis;this.store=store;this.tx=tx;
    }
    public Map<String,Object> createContext(long project,long user,Review request) {
        if(request==null||!request.confirmed()||!request.canonical_targets_only()||!request.calibration_not_applicable()
                ||request.reason()==null||request.reason().strip().length()<3||request.reason().length()>2000)
            throw fail(400,"V3_CANONICAL_REVIEW_REQUIRED");
        Map<String,Object> selected=analysis.handoff(project,request.dataset_id());
        if(!Objects.equals(request.dataset_digest(),selected.get("dataset_digest"))) throw fail(409,"V3_SELECTION_CHECKSUM_CHANGED");
        List<Long> ids=memberIds(selected);
        if(ids.size()>MEMBERS) throw fail(413,"V3_CONTEXT_MEMBER_LIMIT");
        Set<Long> controls=new HashSet<>(request.nonhazard_run_ids()==null?List.of():request.nonhazard_run_ids());
        if(controls.isEmpty()||request.nonhazard_run_ids().size()!=controls.size()||!ids.containsAll(controls))
            throw fail(400,"V3_REVIEWED_CONTROLS_REQUIRED");
        for(String partition:List.of("optimization_run_ids","validation_run_ids"))
            if(Json.asList(selected.get(partition)).stream().noneMatch(id->controls.contains(((Number)id).longValue())))
                throw fail(400,"V3_EACH_PARTITION_REQUIRES_REVIEWED_CONTROL");
        List<Row> catalog=queries.parameterCatalog();
        Map<String,Object> space=domain(catalog,request.search_space());
        Row baseline=queries.baselineVersion(project);
        if(baseline==null||baseline.lng("id")!=((Number)Json.asMap(selected.get("baseline")).get("id")).longValue())
            throw fail(409,"V3_BASELINE_CHANGED");
        Map<String,Object> members=capture(project,selected,controls);
        Map<String,Object> version=new LinkedHashMap<>();
        for(String key:List.of("id","project_id","version_no","label","status","source","parent_version_id")) version.put(key,baseline.get(key));
        version.put("created_at",baseline.ts("created_date")==null?null:baseline.ts("created_date").toInstant(ZoneOffset.UTC).toString());
        Map<String,Object> review=obj("reviewer_id",user,"reason",request.reason().strip(),"confirmed",true,
                "canonical_targets_only",true,"calibration_not_applicable",true,"nonhazard_run_ids",controls.stream().sorted().toList());
        Map<String,Object> draft=obj("schema","vehicsim.fa-runtime-context/v1","project_id",project,
                "dataset_id",request.dataset_id(),"dataset_digest",selected.get("dataset_digest"),"dataset",selected,
                "baseline",version,"baseline_parameters",queries.aebValues(baseline.lng("id")),
                "catalog",catalog.stream().map(r->obj("code",r.str("code"),"min_value",r.dbl("min_value"),"max_value",r.dbl("max_value"))).toList(),
                "search_space",space,"review",review,"members",members);
        String dedupe=AnalysisService.digest(draft);
        return tx.execute(status->{
            // Serialize duplicate review submissions; do not mutate an earlier approval.
            Row lock=db.first("SELECT id FROM projects WHERE id=? FOR UPDATE",project);
            if(lock==null) throw fail(404,"V3_CONTEXT_NOT_FOUND");
            store.requireWritableProject(project);
            Row existing=db.first("SELECT summary_json FROM analysis_results WHERE project_id=? AND method='FA_V3_CONTEXT' "
                    +"AND JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.dedupe_key'))=? LIMIT 1",project,dedupe);
            if(existing!=null) return contextView(existing.json("summary_json"));
            // Recheck immutable selection and producer sources after obtaining the project lock.
            if(!Objects.equals(analysis.handoff(project,request.dataset_id()).get("dataset_digest"),selected.get("dataset_digest"))
                    ||!AnalysisService.sameValue(members,capture(project,selected,controls))) throw fail(409,"V3_SOURCE_REVISION_CHANGED");
            Map<String,Object> saved=new LinkedHashMap<>(draft);
            review.put("reviewed_at",Instant.now().toString());
            saved.put("context_id",UUID.randomUUID().toString());
            saved.put("context_digest",AnalysisService.digest(saved));
            new FailureAnalysisHandoffAdapter(saved); // Structural authority checks before persistence.
            db.insert("INSERT INTO analysis_results(project_id,analysis_type,method,scenario_id,aeb_version_id,title,config_json,summary_json,status,created_by_user_id) "
                    +"VALUES(?,'BASELINE_DATASET','FA_V3_CONTEXT',?,?,'Reviewed FA V3 canonical dataset',?,?,'COMPLETED',?)",
                    project,((Number)Json.asMap(selected.get("scenario")).get("id")).longValue(),baseline.lng("id"),
                    obj("context_id",saved.get("context_id"),"dedupe_key",dedupe),saved,user);
            return contextView(saved);
        });
    }
    public Approved approved(long project,String contextId) throws IOException {
        if(contextId==null||!contextId.matches("[a-f0-9-]{36}")) throw fail(404,"V3_CONTEXT_NOT_FOUND");
        Row row=db.first("SELECT summary_json FROM analysis_results WHERE project_id=? AND method='FA_V3_CONTEXT' AND status='COMPLETED' "
                +"AND JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.context_id'))=?",project,contextId);
        if(row==null) throw fail(404,"V3_CONTEXT_NOT_FOUND");
        Map<String,Object> saved=row.json("summary_json");
        Map<String,Object> signed=new LinkedHashMap<>(saved);Object digest=signed.remove("context_digest");
        if(!Objects.equals(digest,AnalysisService.digest(signed))||!contextId.equals(saved.get("context_id"))) throw fail(409,"V3_CONTEXT_CHECKSUM_MISMATCH");
        Map<String,Object> current;
        try {current=analysis.handoff(project,((Number)saved.get("dataset_id")).longValue());}
        catch(com.vsos.backend.common.Vs.InvalidRequestException e){throw fail(409,"V3_SOURCE_REVISION_CHANGED");}
        if(!Objects.equals(saved.get("dataset_digest"),current.get("dataset_digest"))) throw fail(409,"V3_SELECTION_CHECKSUM_CHANGED");
        if(!AnalysisService.sameValue(queries.aebValues(((Number)Json.asMap(current.get("baseline")).get("id")).longValue()),saved.get("baseline_parameters")))
            throw fail(409,"V3_BASELINE_PARAMETERS_CHANGED");
        List<Row> live=queries.parameterCatalog();
        List<?> currentCatalog=live.stream().map(r->obj("code",r.str("code"),"min_value",r.dbl("min_value"),"max_value",r.dbl("max_value"))).toList();
        if(!AnalysisService.sameValue(currentCatalog,saved.get("catalog"))) throw fail(409,"V3_CATALOG_REVISION_CHANGED");
        Map<String,Object> checked=domain(live,Json.asMap(saved.get("search_space")));
        if(!AnalysisService.sameValue(checked,saved.get("search_space"))) throw fail(409,"V3_APPROVED_DOMAIN_CHANGED");
        Set<Long> controls=new HashSet<>(Json.asList(Json.asMap(saved.get("review")).get("nonhazard_run_ids")).stream().map(x->((Number)x).longValue()).toList());
        if(!AnalysisService.sameValue(capture(project,current,controls),saved.get("members"))) throw fail(409,"V3_SOURCE_REVISION_CHANGED");
        new FailureAnalysisHandoffAdapter(saved);
        List<RestJsonAnalysis.Parsed> inputs=new ArrayList<>();List<byte[]> originals=new ArrayList<>();List<Object> manifest=new ArrayList<>();
        for(long id:memberIds(current)) {
            var member=Json.asMap(Json.asMap(saved.get("members")).get(Long.toString(id)));
            Resource source=store.find(Kind.SOURCE,project,member.get("source_id").toString());
            if(source==null) throw fail(409,"DB_RESULT_NOT_PERSISTED");source.verify();
            byte[] raw=source.body();
            var parsed=new RestJsonAnalysis().parseProducer(raw,policy(SOURCE_BYTES),source.byteDigest());
            if(!parsed.complete()||parsed.runs().size()!=1) throw fail(409,"V3_PRODUCER_INPUT_INCOMPLETE");
            inputs.add(parsed);originals.add(raw);
            manifest.add(obj("run_id",id,"document_state",obj("state","OK","reason",null),"document_sha256",sha256(MiniJson.write(object(raw)))));
        }
        var output=new ByteArrayOutputStream();
        String head=MiniJson.write(obj("format","vehicsim.run-collection/v1","collection",obj("kind","reviewed-selection","project_id",project),
                "rules",obj("document_digest_spec","SHA-256 of Python json.dumps(value, ensure_ascii=False); MiniJson compatible"),
                "status",obj("state","OK","reason",null),"manifest",manifest));
        output.write(head.substring(0,head.length()-1).getBytes(java.nio.charset.StandardCharsets.UTF_8));output.write(",\"runs\":[".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        for(int i=0;i<originals.size();i++) {if(i>0)output.write(',');output.write(("{\"run_id\":"+memberIds(current).get(i)+",\"result\":").getBytes(java.nio.charset.StandardCharsets.UTF_8));output.write(originals.get(i));output.write('}');}
        output.write("]}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        if(output.size()>DB_COLLECTION_BYTES) throw fail(413,"V3_SEALED_SOURCE_BYTES_EXCEEDED");
        return new Approved(saved,List.copyOf(inputs),output.toByteArray());
    }
    public Map<String,Object> context(long project,String id) throws IOException {return contextView(approved(project,id).snapshot());}
    public Map<String,Object> campaign(long project,String id,String expected) {
        try {
            Resource handoff=store.find(Kind.HANDOFF,project,id);
            if(handoff==null) throw fail(404,"RESOURCE_NOT_FOUND");handoff.verify();
            Map<String,Object> metadata=handoff.meta();
            if(!Boolean.TRUE.equals(metadata.get("dispatch_allowed"))||!"READY".equals(metadata.get("status"))) throw fail(409,"V3_HANDOFF_NOT_READY");
            if(expected==null||!expected.matches("[a-f0-9]{64}")||!expected.equals(metadata.get("content_digest"))) throw fail(409,"V3_HANDOFF_CHECKSUM_CHANGED");
            Approved approved=approved(project,Objects.toString(metadata.get("context_id"),null));
            if(!approved.digest().equals(metadata.get("context_digest"))) throw fail(409,"V3_CONTEXT_CHECKSUM_MISMATCH");
            Map<String,Object> body=object(handoff.body());
            if(!expected.equals(body.get("content_digest"))||!expected.equals(HandoffSnapshots.digest(body))) throw fail(409,"V3_HANDOFF_CONTENT_DIGEST_MISMATCH");
            List<String> reasons=readiness(body);if(!reasons.isEmpty()) throw fail(409,"V3_HANDOFF_ELIGIBILITY_CHANGED");
            // Replay the stored handoff against its exact current approved DB source bundle.
            List<MoboHandoffBuilder.MemberInput> reports=new ArrayList<>();
            List<Map<String,Object>> savedReports=store.list(Kind.REPORT,project,handoff.executionId(),20,0);
            for(var input:approved.inputs()) {
                var run=input.runs().getFirst();
                Map<String,Object> meta=savedReports.stream().filter(r->run.runKey().equals(r.get("run_key"))).findFirst().orElseThrow(()->fail(409,"V3_REPORT_MEMBER_MISSING"));
                Resource report=store.find(Kind.REPORT,project,meta.get("id").toString());report.verify();
                reports.add(new MoboHandoffBuilder.MemberInput(run,object(report.body())));
            }
            Map<String,Object> replay=approved.adapter().handoff(reports);
            if(!HandoffSnapshots.digest(replay).equals(expected)) throw fail(409,"V3_HANDOFF_REPLAY_CHANGED");
            Map<String,Object> dataset=Json.asMap(approved.snapshot().get("dataset"));
            Map<String,Object> projection=new LinkedHashMap<>(dataset);
            projection.remove("schema");projection.remove("id");
            projection.putAll(obj("schema","vehicsim.fa-v3-campaign/v1","project_id",project,"handoff_id",id,"handoff_digest",expected,"handoff_execution_id",handoff.executionId(),
                    "context_id",approved.id(),"search_space",approved.snapshot().get("search_space"),
                    "optimization_run_ids",numeric(Json.asList(at(body,"/dataset/optimization_run_ids"))),
                    "validation_run_ids",numeric(Json.asList(at(body,"/dataset/validation_run_ids")))));
            projection.put("dataset_digest",AnalysisService.digest(obj("handoff_digest",expected,"context_digest",approved.digest(),"members",approved.snapshot().get("members"),
                    "optimization",projection.get("optimization_run_ids"),"validation",projection.get("validation_run_ids"))));
            projection.put("optimization_objectives",at(body,"/canonical_aggregation/optimization/value"));
            projection.put("validation_objectives",at(body,"/canonical_aggregation/validation/value"));
            return projection;
        } catch(IOException e) {throw fail(503,"V3_SOURCE_READ_FAILED");}
    }
    public static List<String> readiness(Map<String,Object> handoff) {
        List<String> reasons=new ArrayList<>(MoboHandoffBuilder.schemaViolations(handoff));
        if(!MoboHandoffBuilder.SCHEMA.equals(handoff.get("schema_version"))
                ||!"V3.1".equals(handoff.get("design_revision"))
                ||!"vehicsim.failure-analysis/v1".equals(handoff.get("core_contract"))
                ||!"vehicsim.objective-analysis/v1".equals(handoff.get("objective_contract"))
                ||!com.vsos.core.evaluation.AnalysisMetrics.VERSION.equals(handoff.get("aggregation_version")))
            reasons.add("V3_HANDOFF_CONTRACT_UNSUPPORTED");
        for(Object reason:Json.asList(at(handoff,"/eligibility_manifest/reason_codes"))) reasons.add(reason.toString());
        if(!"KNOWN".equals(at(handoff,"/baseline_objectives/availability"))) reasons.add("V3_BASELINE_SCORES_UNAVAILABLE");
        for(Object raw:Json.asList(handoff.get("members"))) {
            String partition=Objects.toString(at(raw,"/partition"),"").toLowerCase(Locale.ROOT);
            if(!Set.of("optimization","validation").contains(partition)||!"ELIGIBLE".equals(at(raw,"/eligibility/"+partition))) reasons.add("V3_MEMBER_NOT_ELIGIBLE");
        }
        for(Object range:Json.asMap(handoff.get("search_ranges")).values()) if(!"ELIGIBLE".equals(at(range,"/eligibility"))) reasons.add("V3_APPROVED_DOMAIN_UNAVAILABLE");
        return reasons.stream().distinct().toList();
    }
    private Map<String,Object> capture(long project,Map<String,Object> selected,Set<Long> controls) {
        Map<String,Object> members=new TreeMap<>();
        for(long id:memberIds(selected)) {
            Row row=db.first("SELECT * FROM simulation_runs WHERE project_id=? AND id=?",project,id);
            if(row==null||!"COMPLETED".equals(row.str("status"))||!"ON".equals(row.str("aeb_mode"))) throw fail(409,"V3_SOURCE_RUN_UNAVAILABLE");
            Resource source=store.byKey(Kind.SOURCE,project,producerResultKey(project,id,row.lng("attempt")));
            if(source==null) throw fail(409,"DB_RESULT_NOT_PERSISTED");source.verify();
            Map<String,Object> provenance=Json.asMap(source.meta().get("database_input"));
            if(!"MODULE2_RESULT_DATABASE".equals(provenance.get("origin"))||!Objects.toString(id).equals(Objects.toString(provenance.get("run_id")))
                    ||!Objects.toString(row.lng("attempt")).equals(Objects.toString(provenance.get("attempt")))) throw fail(409,"V3_PRODUCER_SOURCE_MISMATCH");
            Map<String,Object> raw=object(source.body());
            byte[] original=source.body();
            if(original.length>=3&&(original[0]&255)==239&&(original[1]&255)==187&&(original[2]&255)==191)
                throw fail(409,"DB_RESULT_BOM_NOT_EMBEDDABLE_WITHOUT_BYTE_CHANGE");
            Map<String,Object> identity=Json.asMap(at(raw,"/dataset/identity"));
            for(String field:List.of("project_id","scenario_id","aeb_version_id","carla_vehicle_model_id","aeb_mode","attempt","repetition","purpose"))
                if(!Objects.toString(row.get(field)).equals(Objects.toString(identity.get(field)))) throw fail(409,"V3_SOURCE_IDENTITY_CHANGED");
            if(!Objects.toString(id).equals(Objects.toString(identity.get("run_id")))
                    ||!Objects.toString(row.get("scenario_version_id")).equals(Objects.toString(identity.get("variant_id")))
                    ||!Objects.toString(row.get("random_seed")).equals(Objects.toString(identity.get("seed")))
                    ||!Objects.equals(row.str("simulator_version"),identity.get("simulator"))) throw fail(409,"V3_SOURCE_IDENTITY_CHANGED");
            Map<String,Object> actualVariant=Json.asMap(at(raw,"/dataset/config/variant"));
            Map<String,Object> configuredVariant;
            try { configuredVariant=RunService.variantForBundle(row.json("run_config_json"),actualVariant.get("friction")); }
            catch(ClassCastException|NullPointerException e){throw fail(409,"V3_SOURCE_CONFIGURATION_CHANGED");}
            if(!AnalysisService.sameValue(actualVariant,configuredVariant)) throw fail(409,"V3_SOURCE_CONFIGURATION_CHANGED");
            // The existing runner reads road_friction from the variant row. Refuse a changed live override,
            // rather than silently replaying a frozen result under newer road conditions.
            Row liveVariant=db.first("SELECT road_friction FROM scenario_versions WHERE id=? AND scenario_id=?",
                    row.lng("scenario_version_id"),row.lng("scenario_id"));
            if(liveVariant==null||!AnalysisService.sameValue(liveVariant.get("road_friction"),actualVariant.get("friction")))
                throw fail(409,"V3_SOURCE_FRICTION_CHANGED");
            try {
                var parsed=new RestJsonAnalysis().parseProducer(original,policy(SOURCE_BYTES),source.byteDigest());
                if(!parsed.complete()||parsed.runs().size()!=1) throw fail(409,"V3_PRODUCER_INPUT_INCOMPLETE");
                var descriptor=MetricProvenanceResolver.descriptor(parsed.runs().getFirst());
                if(!descriptor.supported()||!AnalysisService.sameValue(descriptor.dt(),row.get("fixed_delta_seconds")))
                    throw fail(409,"V3_SOURCE_TIMESTEP_CHANGED");
            }catch(IOException e){throw fail(503,"V3_SOURCE_READ_FAILED");}
            var sample=RunEvidence.sample(row);
            Map<String,Object> metrics=Json.asMap(at(raw,"/outcome/metrics")),aeb=Json.asMap(at(raw,"/evaluation/aeb_result"));
            Map<String,Object> telemetry=row.json("telemetry_json");
            if(!AnalysisService.sameValue(metrics,telemetry.get("metrics"))
                    ||!AnalysisService.sameValue(at(raw,"/outcome/frames"),telemetry.get("frames"))
                    ||!AnalysisService.sameValue(at(raw,"/outcome/events"),telemetry.get("events"))
                    ||!AnalysisService.sameValue(at(raw,"/outcome/params"),telemetry.get("params"))
                    ||!AnalysisService.sameValue(at(raw,"/outcome/case"),telemetry.get("case"))
                    ||!AnalysisService.sameValue(sample.jerk(),metrics.get("rms_jerk_mps3"))
                    ||!AnalysisService.sameValue(sample.impact(),metrics.get("impact_speed_mps"))
                    ||!AnalysisService.sameValue(sample.stopping(),metrics.get("stopping_distance_m"))
                    ||!Objects.equals(sample.collision(),metrics.get("collision"))
                    ||!Objects.equals(sample.falsePositive(),aeb.get("false_activation"))
                    ||!Objects.equals(sample.falseNegative(),aeb.get("missed_activation"))
                    ||!Objects.equals(sample.verdict(),aeb.get("verdict"))
                    ||!Objects.equals(sample.endReason(),at(raw,"/outcome/end_reason"))) throw fail(409,"V3_CANONICAL_DATABASE_PROJECTION_CHANGED");
            if(controls.contains(id)&&(!Boolean.FALSE.equals(sample.collision())||!Boolean.FALSE.equals(sample.falsePositive())||!Boolean.FALSE.equals(sample.falseNegative())))
                throw fail(400,"V3_NONHAZARD_REVIEW_CONFLICT");
            Map<String,Object> item=Json.asList(selected.get("runs")).stream().map(Json::asMap).filter(r->((Number)r.get("run_id")).longValue()==id).findFirst().orElseThrow();
            members.put(Long.toString(id),obj("source_id",source.id(),"source_sha256",source.byteDigest(),"attempt",row.lng("attempt"),"revision",item.get("revision")));
        }
        return members;
    }
    private static Map<String,Object> domain(List<Row> catalog,Map<String,Object> requested) {
        if(catalog.size()!=4) throw fail(409,"V3_LIVE_CATALOG_UNAVAILABLE");
        if(requested!=null&&!requested.keySet().equals(Set.copyOf(ParameterBounds.PARAM_KEYS))) throw fail(400,"V3_APPROVED_DOMAIN_REQUIRES_FOUR_PARAMETERS");
        Map<String,Object> result=new TreeMap<>();var bounds=ParameterBounds.defaults();
        for(Row row:catalog) {String code=row.str("code");if(!ParameterBounds.PARAM_KEYS.contains(code)) throw fail(409,"V3_LIVE_CATALOG_UNAVAILABLE");
            Double catalogLower=row.dbl("min_value"),catalogUpper=row.dbl("max_value");
            if(catalogLower==null||catalogUpper==null||!Double.isFinite(catalogLower)||!Double.isFinite(catalogUpper)
                    ||result.containsKey(code)) throw fail(409,"V3_LIVE_CATALOG_UNAVAILABLE");
            double lower=Math.max(catalogLower,bounds.lower(code)),upper=Math.min(catalogUpper,bounds.upper(code));
            if(lower>=upper) throw fail(409,"V3_LIVE_CATALOG_UNAVAILABLE");
            List<Object> pair=requested==null?List.of(lower,upper):Json.asList(requested.get(code));
            if(pair.size()!=2||!(pair.get(0) instanceof Number low)||!(pair.get(1) instanceof Number high)
                    ||!Double.isFinite(low.doubleValue())||!Double.isFinite(high.doubleValue())||low.doubleValue()>=high.doubleValue()
                    ||low.doubleValue()<lower||high.doubleValue()>upper) throw fail(400,"V3_APPROVED_DOMAIN_INVALID");
            result.put(code,List.of(((Number)pair.get(0)).doubleValue(),((Number)pair.get(1)).doubleValue()));
        }return result;
    }
    private static List<Long> memberIds(Map<String,Object> dataset) {return Json.asList(dataset.get("runs")).stream().map(Json::asMap).map(r->((Number)r.get("run_id")).longValue()).sorted().toList();}
    private static List<Long> numeric(List<Object> ids) {return ids.stream().map(x->Long.parseLong(x.toString())).toList();}
    private static Map<String,Object> contextView(Map<String,Object> saved) {return obj("context_id",saved.get("context_id"),"context_digest",saved.get("context_digest"),"project_id",saved.get("project_id"),"search_space",saved.get("search_space"),"review",saved.get("review"));}
    private static FailureAnalysisException fail(int status,String code) {return new FailureAnalysisException(status,code);}
}
