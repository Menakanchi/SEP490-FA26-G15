package com.vsos.core.failureanalysis;

import java.util.*;
import java.util.function.Consumer;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** M1C path-specific structural contract. Operational sufficiency and hashes are separate checks. */
final class HandoffSchemaValidator {
    record Violation(String code,String path,String detail) {}
    private enum Type { TEXT, ID, HASH, NUMBER, POSITIVE, INTEGER, SEQUENCE, BOOLEAN, RANGE, AGGREGATE }
    private static final Set<String> PARTITIONS=Set.of("OPTIMIZATION","VALIDATION","DIAGNOSTIC_ONLY","EXCLUDED","UNKNOWN");
    private static final Set<String> QUALITY=Set.of("ELIGIBLE","EXCLUDED","UNKNOWN","NOT_APPLICABLE");
    private final Object root;
    private final List<Violation> violations=new ArrayList<>();
    private HandoffSchemaValidator(Object root){this.root=root;}
    static List<Violation> validate(Object root){var v=new HandoffSchemaValidator(root);v.validate();return List.copyOf(v.violations);}
    private Object get(String p){return at(root,p);}
    private void bad(String p,String detail){violations.add(new Violation("HANDOFF_FIELD_SCHEMA_INVALID",p,detail));}
    private boolean object(String p){if(get(p) instanceof Map<?,?>)return true;bad(p,"Required object");return false;}
    private void required(String p){int split=p.lastIndexOf('/');Object parent=get(p.substring(0,split));
        if(parent instanceof List<?> l){try{int i=Integer.parseInt(p.substring(split+1));if(i>=0&&i<l.size())return;}catch(NumberFormatException ignored){}}
        if(!(parent instanceof Map<?,?> m)||!m.containsKey(p.substring(split+1)))bad(p,"Required field missing");}
    private void string(String p,boolean nullable){required(p);Object x=get(p);if(!(x instanceof String s&&!s.isBlank())&&!(nullable&&x==null))bad(p,"Expected "+(nullable?"nullable ":"")+"nonempty string");}
    private void nullableString(String p){required(p);if(get(p)!=null&&!(get(p) instanceof String))bad(p,"Expected string or null");}
    private void choice(String p,Set<String> allowed,boolean nullable){required(p);Object x=get(p);if(!(nullable&&x==null)&&!allowed.contains(Objects.toString(x,"")))bad(p,"Expected one of "+new TreeSet<>(allowed));}
    private void exact(String p,String expected){if(!expected.equals(get(p)))bad(p,"Expected contract literal "+expected);}
    private void number(String p,boolean positive,boolean whole,boolean nullable){required(p);Object x=get(p);
        if(nullable&&x==null)return;
        if(!finiteNonnegative(x)||positive&&((Number)x).doubleValue()<=0||whole&&!integer(x))bad(p,"Expected finite "+(positive?"positive":"nonnegative")+(whole?" integer":" number"));}
    private void bool(String p){required(p);if(!(get(p) instanceof Boolean))bad(p,"Expected boolean");}
    private void array(String p,Consumer<String> element){if(!(get(p) instanceof List<?> l)){bad(p,"Required array");return;}for(int i=0;i<l.size();i++)element.accept(p+"/"+i);}
    private void strings(String p){array(p,q->{if(!(get(q) instanceof String s)||s.isBlank())bad(q,"Expected nonempty string array item");});}
    private void refs(String p){array(p,q->{if(object(q)){string(q+"/artifact_id",false);nullableString(q+"/locator");if(get(q+"/locator")==null)bad(q+"/locator","Source locator must be a string, including empty root locator");strings(q+"/input_ids");}});}
    private void ev(String p,Type type){
        if(!object(p))return;
        for(String k:List.of("value","status","unit","clock_id","frame_id","source_refs","formula_id","assumptions","bounds","reason_codes"))required(p+"/"+k);
        choice(p+"/status",Set.of("OBSERVED","DERIVED","CONDITIONAL","UNKNOWN","NOT_APPLICABLE","CONFLICTING","INVALID"),false);
        for(String k:List.of("unit","clock_id","frame_id","formula_id"))nullableString(p+"/"+k);
        refs(p+"/source_refs");strings(p+"/assumptions");strings(p+"/reason_codes");
        if(get(p+"/bounds")!=null){String b=p+"/bounds";if(object(b)){
            for(String k:List.of("lower","upper")){required(b+"/"+k);if(!(get(b+"/"+k) instanceof Number n)||!Double.isFinite(n.doubleValue()))bad(b+"/"+k,"Expected finite number");}
            choice(b+"/kind",Set.of("BOUND","STANDARD_UNCERTAINTY","EXPANDED_UNCERTAINTY"),false);required(b+"/coverage_factor");
            if(get(b+"/coverage_factor")!=null){number(b+"/coverage_factor",true,false,false);if(!"EXPANDED_UNCERTAINTY".equals(get(b+"/kind")))bad(b+"/coverage_factor","Coverage factor applies only to expanded uncertainty");}
            if(get(b+"/lower") instanceof Number lo&&get(b+"/upper") instanceof Number hi&&lo.doubleValue()>hi.doubleValue())bad(b,"Bounds lower exceeds upper");
        }}
        Object value=get(p+"/value");String status=str(get(p+"/status"));
        if(value==null||Set.of("CONDITIONAL","CONFLICTING").contains(Objects.toString(status,"")))
            if(list(get(p+"/reason_codes")).isEmpty())bad(p+"/reason_codes","Missing/conditional/conflicting evidence needs explicit reasons");
        if(Arrays.asList("UNKNOWN","INVALID","NOT_APPLICABLE").contains(status)&&value!=null){
            violations.add(new Violation("MISSING_VALUE_COERCED",p,"Missing/invalid/NA status cannot contain a value"));}
        if("DERIVED".equals(status))string(p+"/formula_id",false);
        if("CONDITIONAL".equals(status)&&list(get(p+"/assumptions")).isEmpty())bad(p+"/assumptions","Conditional evidence needs assumptions");
        if("OBSERVED".equals(status)&&list(get(p+"/source_refs")).isEmpty())bad(p+"/source_refs","Observed evidence must be cited");
        if(Arrays.asList("OBSERVED","DERIVED").contains(status)&&value==null)bad(p+"/value","Observed/derived evidence requires a value");
        if(value==null)return;String q=p+"/value";
        switch(type){
            case TEXT->string(q,false);
            case ID->{string(q,false);if(!id(value))bad(q,"Database ID must be a decimal string");}
            case HASH->{if(!hash(value))bad(q,"Expected SHA256 hex digest");}
            case NUMBER->number(q,false,false,false);
            case POSITIVE->number(q,true,false,false);
            case INTEGER->{if(!integer(value))bad(q,"Expected exact signed integer seed");}
            case SEQUENCE->number(q,true,true,false);
            case BOOLEAN->bool(q);
            case RANGE->{if(object(q)){number(q+"/lower",false,false,false);number(q+"/upper",false,false,false);
                if(finiteNonnegative(get(q+"/lower"))&&finiteNonnegative(get(q+"/upper"))&&((Number)get(q+"/lower")).doubleValue()>((Number)get(q+"/upper")).doubleValue())bad(q,"Lower bound exceeds upper bound");}}
            case AGGREGATE->aggregate(q);
        }
    }
    private void aggregate(String p){if(!object(p))return;exact(p+"/version","adr040-stored-aggregation/1");number(p+"/invalid_runs",false,true,false);
        for(String key:CanonicalObjectiveReader.KEYS){String q=p+"/"+key;if(!object(q))continue;
            choice(q+"/status",Set.of("VALID","MISSING","NOT_APPLICABLE"),false);string(q+"/unit",false);
            String expected=key.equals("rms_jerk_mps3")?"m/s\u00b3":key.equals("impact_speed_mps")?"m/s":"m";
            exact(q+"/unit",expected);number(q+"/value",false,false,!"VALID".equals(get(q+"/status")));
            if(!"VALID".equals(get(q+"/status"))&&get(q+"/value")!=null)bad(q+"/value","Missing/NA aggregate must be null");
            for(String k:List.of("samples","missing","notApplicable"))number(q+"/"+k,false,true,false);
        }}
    private void sample(String p){required(p);if(get(p)==null)return;if(!object(p))return;
        for(String k:List.of("status","endReason","verdict"))string(p+"/"+k,true);
        for(String k:List.of("collision","falsePositive","falseNegative","braked")){required(p+"/"+k);if(get(p+"/"+k)!=null)bool(p+"/"+k);}
        for(String k:List.of("jerk","impact","stopping"))number(p+"/"+k,false,false,true);
    }
    private boolean missingUnion(String p){if(!object(p))return true;Map<?,?> m=(Map<?,?>)get(p);
        if(m.containsKey("value")||m.containsKey("status")||m.containsKey("reason_codes")){ev(p,Type.TEXT);if(get(p+"/value")!=null)bad(p,"Unavailable union branch cannot contain a plain provenance/decision replacement");return true;}return false;}
    private void sourceHashes(String p){array(p,q->{if(object(q)){string(q+"/path",false);required(q+"/sha256");
        if(get(q+"/sha256")!=null&&!hash(get(q+"/sha256")))bad(q+"/sha256","Expected hash or explicit unverified null");string(q+"/commit",false);}});}
    private void member(String p){if(!object(p))return;
        for(String k:List.of("member_id","run_key"))string(p+"/"+k,false);
        choice(p+"/partition",PARTITIONS,false);choice(p+"/requested_partition",PARTITIONS,true);
        array(p+"/case_roles",q->choice(q,Set.of("SAFE_CONTROL","HAZARD_ENCOUNTER","BOUNDARY","CAUTION_CANDIDATE","DIAGNOSTIC_ONLY"),false));
        choice(p+"/role_basis",Set.of("DESIGN_INTENT","EVIDENCE_REVIEWED","UNKNOWN"),false);refs(p+"/role_evidence_refs");
        for(String k:List.of("run_id","variant_id","scenario_id","baseline_aeb_version_id"))ev(p+"/"+k,Type.ID);
        ev(p+"/seed",Type.INTEGER);for(String k:List.of("replicate","attempt"))ev(p+"/"+k,Type.SEQUENCE);
        for(String k:List.of("mode","run_status","end_reason","simulator"))ev(p+"/"+k,Type.TEXT);
        if(get(p+"/mode/value")!=null&&!Set.of("ON","OFF").contains(get(p+"/mode/value")))bad(p+"/mode/value","Expected ON/OFF");
        ev(p+"/dt",Type.POSITIVE);if(get(p+"/dt/value")!=null)exact(p+"/dt/unit","s");if(object(p+"/actual_parameters"))parameters(p+"/actual_parameters");
        for(String k:List.of("artifact_digest","configuration_digest","diagnostic_report_ref"))ev(p+"/"+k,Type.HASH);
        exact(p+"/artifact_digest_profile","SHA256_BYTES");exact(p+"/report_digest_profile","fa-report-sorted-json/1");
        for(String k:List.of("failure_evidence_refs","objective_evidence_refs"))refs(p+"/"+k);
        sample(p+"/canonical_sample");String q=p+"/metric_provenance";
        if(!missingUnion(q)){
            boolean database="PERSISTED_CANONICAL_RESULT".equals(get(q+"/provenance_scope"));
            for(String k:List.of("aggregation_version","metric_source","simulator","producer","vehicle_id","core_source_commit"))string(q+"/"+k,false);
            exact(q+"/aggregation_version","adr040-stored-aggregation/1");exact(q+"/metric_source","SIMULATOR_RESULT");number(q+"/dt",true,false,false);
            string(q+"/scenario_runner_version",database);
            if(database){
                // A DB canonical profile records real producer hashes; it cannot invent CARLA sidecars.
                for(String k:List.of("core_jar_sha256","core_bytecode_sha256","worker_sha256","scenario_runner_sha256"))
                    if(get(q+"/"+k)!=null&&!hash(get(q+"/"+k)))bad(q+"/"+k,"Expected SHA256 or explicit unavailable null");
                if(!hash(get(q+"/core_jar_sha256"))&&!hash(get(q+"/core_bytecode_sha256")))bad(q,"Loaded producer binary hash required");
                for(String k:List.of("canonical_targets_only","calibration_not_applicable"))
                    if(!Boolean.TRUE.equals(get(q+"/"+k)))bad(q+"/"+k,"Explicit canonical-only review required");
                refs(q+"/canonical_review_refs");
                String source=q+"/database_source";if(object(source)){
                    string(source+"/source_id",false);for(String k:List.of("project_id","run_id","attempt"))
                        if(!id(get(source+"/"+k)))bad(source+"/"+k,"Required database identity");
                    if(!hash(get(source+"/source_sha256")))bad(source+"/source_sha256","Required producer source SHA256");
                }
            }else for(String k:List.of("core_jar_sha256","worker_sha256","scenario_runner_sha256"))if(!hash(get(q+"/"+k)))bad(q+"/"+k,"Required SHA256");
            refs(q+"/source_refs");sourceHashes(q+"/metric_source_hashes");object(q+"/objectives");
            for(String key:CanonicalObjectiveReader.KEYS){String d=q+"/objectives/"+key;if(object(d)){for(String k:List.of("signal","filter","window"))string(d+"/"+k,false);refs(d+"/source_refs");}}
        }
        object(p+"/objective_quality_decisions");
        for(String key:CanonicalObjectiveReader.KEYS){q=p+"/objective_quality_decisions/"+key;if(!missingUnion(q)){
            refs(q+"/source_refs");q+="/decision";if(object(q)){choice(q+"/status",QUALITY,false);if(!hash(get(q+"/report_digest")))bad(q+"/report_digest","Required report digest");
                refs(q+"/source_refs");ev(q+"/profile_verified",Type.BOOLEAN);choice(q+"/calibration_applicability",Set.of("NOT_APPLICABLE","IN_DOMAIN","OUT_OF_DOMAIN","UNKNOWN"),false);
                refs(q+"/calibration_basis_refs");if(((Map<?,?>)get(q)).containsKey("calibration_refs"))refs(q+"/calibration_refs");}
        }}
        q=p+"/eligibility";if(object(q)){for(String k:List.of("canonical_read","optimization","validation"))choice(q+"/"+k,QUALITY,false);
            object(q+"/objective_status");for(String key:CanonicalObjectiveReader.KEYS)choice(q+"/objective_status/"+key,QUALITY,false);
            strings(q+"/reason_codes");strings(q+"/capability_refs");}
    }
    private void parameters(String p){for(String code:BaselineBindingResolver.PARAMETERS.keySet()){ev(p+"/"+code,Type.NUMBER);
        if(get(p+"/"+code+"/value")!=null)exact(p+"/"+code+"/unit",SearchRangeResolver.unit(code));}}
    private void validate(){
        // Envelope versions and integrity profile are additionally checked by the consumer validator.
        string("/content_digest",false);exact("/digest_profile","fa-handoff-sorted-json/1");
        String p="/dataset";if(object(p)){ev(p+"/snapshot_schema",Type.TEXT);if(get(p+"/snapshot_schema/value")!=null)choice(p+"/snapshot_schema/value",Set.of("vehicsim.analysis-dataset/v2","vehicsim.fa-v3-sealed-dataset/v1"),false);
            for(String k:List.of("snapshot_id","project_id","scenario_id"))ev(p+"/"+k,Type.ID);
            for(String k:List.of("snapshot_digest","cohort_digest"))ev(p+"/"+k,Type.HASH);
            ev(p+"/baseline_current",Type.BOOLEAN);choice(p+"/selection_status",Set.of("FROZEN","UNFROZEN","INVALID","UNKNOWN"),false);exact(p+"/digest_profile","fa-handoff-sorted-json/1");
            for(String k:List.of("optimization_run_ids","validation_run_ids","requested_optimization_run_ids","requested_validation_run_ids"))array(p+"/"+k,q->{if(!(get(q) instanceof String)||!id(get(q)))bad(q,"Expected decimal run ID string");});
            strings(p+"/diagnostic_control_run_keys");}
        array("/members",this::member);
        p="/baseline";if(object(p)){choice(p+"/identity_status",Set.of("SOURCE_SEED_ONLY","RUN_VERSION_BOUND","PROJECT_BASELINE_CONFIRMED","UNKNOWN","CONFLICTING"),false);for(String k:List.of("version_id","project_id"))ev(p+"/"+k,Type.ID);
            ev(p+"/version_no",Type.SEQUENCE);ev(p+"/label",Type.TEXT);for(String k:List.of("confirmed_as_v1","current","actual_config_matches_version"))ev(p+"/"+k,Type.BOOLEAN);
            object(p+"/parameter_values");parameters(p+"/parameter_values");ev(p+"/parameter_digest",Type.HASH);refs(p+"/evidence_refs");choice(p+"/score_status",Set.of("AVAILABLE","UNAVAILABLE"),false);}
        for(String group:List.of("canonical_aggregation","baseline_objectives")){object("/"+group);for(String part:List.of("optimization","validation"))ev("/"+group+"/"+part,Type.AGGREGATE);}
        choice("/baseline_objectives/availability",Set.of("KNOWN","UNKNOWN"),false);ev("/baseline_objectives/source_dataset_digest",Type.HASH);refs("/failure_evidence");
        object("/search_ranges");for(String code:BaselineBindingResolver.PARAMETERS.keySet()){p="/search_ranges/"+code;if(object(p)){
            exact(p+"/unit",SearchRangeResolver.unit(code));for(String k:List.of("catalog_domain","live_catalog_domain","engine_domain","approved_campaign_domain","suggested_range"))ev(p+"/"+k,Type.RANGE);
            exact(p+"/catalog_scope","SOURCE_SEED_ONLY");refs(p+"/applicable_model_constraints");choice(p+"/eligibility",QUALITY,false);
            choice(p+"/method",Set.of("INTERSECTION_OF_SOURCED_DOMAINS","ABSTAIN"),false);string(p+"/consumer_enforcement",false);strings(p+"/reason_codes");}}
        array("/parameter_hints",q->{if(!object(q))return;string(q+"/id",false);Set<String> codes=new HashSet<>(BaselineBindingResolver.PARAMETERS.keySet());choice(q+"/parameter_code",codes,true);
            choice(q+"/status",Set.of("SUSPECTED","ABSTAIN","NO_PARAMETER_HINT"),false);for(String k:List.of("direction","possible_direction_for_review"))choice(q+"/"+k,Set.of("REVIEW","CONSIDER_INCREASE","CONSIDER_DECREASE","NONE"),false);
            for(String k:List.of("objective_keys","related_metric_ids"))array(q+"/"+k,s->choice(s,new HashSet<>(CanonicalObjectiveReader.KEYS),false));
            for(String k:List.of("objective_keys","related_metric_ids"))if(!new HashSet<>(list(get(q+"/"+k))).equals(new HashSet<>(CanonicalObjectiveReader.KEYS))||list(get(q+"/"+k)).size()!=3)bad(q+"/"+k,"Expected exactly the three canonical objective keys");
            ev(q+"/baseline_value",Type.NUMBER);refs(q+"/evidence_refs");for(String k:List.of("related_candidate_ids","hypothesis_refs","tradeoffs","prerequisites","missing_prerequisites","alternative_non_parameter_explanations","counterevidence","reason_codes"))strings(q+"/"+k);
            string(q+"/mechanism",false);string(q+"/search_range_ref",true);});
        p="/provenance";if(object(p)){exact(p+"/metric_aggregation_version","adr040-stored-aggregation/1");exact(p+"/diagnostic_policy_version","fa-diagnosis/1.0.0");exact(p+"/formula_version","fa-formula/3.0.0");
            ev(p+"/runtime_source_equivalence",Type.BOOLEAN);for(String k:List.of("parameter_catalog_ref","dataset_snapshot_ref","baseline_version_snapshot_ref","simulator","core_source_commit","scenario_runner_version"))ev(p+"/"+k,Type.TEXT);
            ev(p+"/fixed_delta_seconds",Type.POSITIVE);for(String k:List.of("core_jar_sha256","worker_sha256","scenario_runner_sha256"))ev(p+"/"+k,Type.HASH);
            refs(p+"/calibration_refs");sourceHashes(p+"/metric_source_hashes");}
        array("/source_registry",q->{if(!object(q))return;for(String k:List.of("id","uri","media_type"))string(q+"/"+k,false);nullableString(q+"/sha256");
            choice(q+"/integrity",Set.of("VERIFIED","FAILED","UNVERIFIED"),false);if(get(q+"/sha256")!=null&&!hash(get(q+"/sha256")))bad(q+"/sha256","Expected hash or null");
            if(((Map<?,?>)get(q)).containsKey("digest_profile"))choice(q+"/digest_profile",Set.of("fa-report-sorted-json/1","SHA256_BYTES"),false);
        });
        p="/consumer_compatibility";if(object(p)){string(p+"/target",false);string(p+"/source_commit",false);
            for(String k:List.of("schema_acceptance","cohort_enforcement","bounds_enforcement"))choice(p+"/"+k,Set.of("SUPPORTED","NOT_SUPPORTED","UNKNOWN"),false);
            choice(p+"/aggregation_parity",Set.of("VERIFIED","CONDITIONAL","DIVERGENT","UNKNOWN"),false);choice(p+"/overall",Set.of("NOT_DIRECTLY_CONSUMABLE","READY_AFTER_AUTHORIZED_ADAPTER","BLOCKED"),false);
            strings(p+"/reason_codes");refs(p+"/evidence_refs");}
        p="/eligibility_manifest";if(object(p)){exact(p+"/profile_version","fa-handoff-eligibility/1");for(String k:List.of("requested_member_ids","optimization_eligible","validation_eligible","reason_codes"))strings(p+"/"+k);
            for(String k:List.of("excluded","unknown"))array(p+"/"+k,q->{if(!object(q))return;string(q+"/member_id",false);choice(q+"/partition",PARTITIONS,false);
                choice(q+"/objective_key",new HashSet<>(CanonicalObjectiveReader.KEYS),true);strings(q+"/reason_codes");refs(q+"/evidence_refs");});
            object(p+"/counts");for(String k:List.of("requested","optimization_eligible","validation_eligible","excluded","unknown"))number(p+"/counts/"+k,false,true,false);
            choice(p+"/baseline_score_status",Set.of("AVAILABLE","UNAVAILABLE"),false);choice(p+"/overall",Set.of("READY_FOR_REVIEW","BLOCKED"),false);bool(p+"/consumer_dispatch_allowed");}
    }
}
