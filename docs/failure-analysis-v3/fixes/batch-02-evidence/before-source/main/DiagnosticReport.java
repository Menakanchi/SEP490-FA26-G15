package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** M1B composition over the existing M1A reader. No producer, persistence, controller or optimizer calls. */
public final class DiagnosticReport {
    public Map<String,Object> analyze(Run run) { return analyze(run,null); }
    public Map<String,Object> analyze(Run run,Run pairedOff) {
        Map<String,Object> envelope=mutable(new EvidenceReport().analyze(run));
        @SuppressWarnings("unchecked") Map<String,Object> report=(Map<String,Object>)envelope.get("report");
        @SuppressWarnings("unchecked") Map<String,Object> input=(Map<String,Object>)envelope.get("input");
        List<Issue> issues=new EvidenceValidator().validate(run);
        var impact=new ImpactAnalyzer();var contact=impact.extract(run,issues);
        var timeline=new AebTimelineBuilder().build(run,issues,contact);
        var nominal=geometry(run,issues,false);var applied=geometry(run,issues,true);
        Boolean core=run.get("result","/outcome/metrics/collision") instanceof Boolean b?b:null;
        var outcome=DiagnosisPolicy.outcome(core,contact.admissible(),false,null,null,null);
        var assessment=new DiagnosisPolicy().assess(run,timeline,contact,nominal.math,stationaryOutside(run,nominal.math),outcome);
        var braking=new PhysicalBrakingAnalyzer().analyze(run,issues,contact);
        List<SourceRef> contactRefs=contact.refs();
        report.put("physical_outcome",outcome.label().equals("UNKNOWN")?missing(outcome.reasons().getFirst(),null):observed(outcome.label(),null,"recorder",contactRefs.getFirst()));
        report.put("physical_outcome_basis",obj("basis",outcome.basis(),"claim_level",contact.admissible()?"OBSERVED_EVENT":"UNKNOWN","authority_policy","FA_DIAGNOSTIC_CONSERVATIVE_V1",
                "source_refs",contactRefs.stream().map(SourceRef::json).toList(),"reason_codes",outcome.reasons()));
        report.put("observed_behavior",calculated(timeline.behavior(),"T01",null,"core",null,refs(run,"/outcome/metrics"),List.of("Core command evidence does not prove emitted/applied/consumed braking")));
        report.put("aeb_timeline",timeline.json());report.put("braking",braking);
        report.put("control_activity",timeline.unattributedPedal()?"CONTROL_ACTIVITY_UNATTRIBUTED":"NO_ELIGIBLE_PEDAL_SAMPLE");
        report.put("geometry_results",List.of(nominal.json,applied.json));
        report.put("feasibility_results",List.of(feasibility(run,issues,timeline)));
        report.put("physical_feasibility",missing("VALIDATED_DYNAMICS_UNCERTAINTY_AND_ACTION_CERTIFICATE_MISSING",null));
        report.put("physical_limit",missing("P05_CERTIFICATE_AND_REFERENCE_OPPORTUNITY_UNPROVEN",null));
        report.put("functional_candidates",assessment.candidates());report.put("failure_candidates",assessment.candidates());
        report.put("functional_assessment",assessment.functionalAssessment().equals("NOT_APPLICABLE")?na("AEB_OFF_FUNCTIONAL_ASSESSMENT_NOT_APPLICABLE",null):
                calculated(assessment.functionalAssessment(),"Q01",null,null,null,refs(run,"/outcome/metrics"),List.of("No approved duty/caution/performance requirements; no positive compliance assertion")));
        report.put("root_cause_hypotheses",assessment.hypotheses());report.put("confirmed_root_cause",missing("CAUSAL_TRACE_REQUIREMENT_AND_ADJUDICATION_MISSING",null));
        report.put("impact_analysis",contact.json());
        ImpactAnalyzer.Contact offContact=pairedOff==null?null:impact.extract(pairedOff,new EvidenceValidator().validate(pairedOff));
        report.put("paired_mitigation",impact.compare(run,pairedOff,contact,offContact));
        @SuppressWarnings("unchecked") Map<String,Object> original=(Map<String,Object>)report.get("objectives");
        report.put("objectives",new ObjectiveExplainer().explain(run,original,timeline,braking,contact,assessment));
        @SuppressWarnings("unchecked") Map<String,Object> collision=(Map<String,Object>)report.get("collision_evidence");
        collision.put("physical_event_impact",contact.json().get("recorded_relative_speed"));
        collision.put("recorded_contact",contact.json()); // Array cardinality and canonical flag stay as M1A read them.
        List<Map<String,Object>> disagreements=new ArrayList<>();
        if(core!=null&&core!=contact.admissible()&&(Boolean.TRUE.equals(core)||contact.admissible()))
            disagreements.add(obj("id","collision-authority","field_path","/report/physical_outcome","status","OPEN","resolution_policy",null,
                    "claim_refs",List.of(run.artifact("result").id()+"#/outcome/metrics/collision",run.artifact("collisions").id()),"reason_codes",List.of("COLLISION_AUTHORITY_DISAGREEMENT")));
        report.put("disagreements",disagreements);
        var calibration=EvidenceGates.calibration(null,Map.of(),true,false); // Raw map name/full-brake scalar supply no validated domain.
        var rawKinematics=EvidenceGates.calibration(null,Map.of(),false,false);
        report.put("calibration_applicability",List.of(obj("field","pedal_to_deceleration","status",calibration.status(),"reason_codes",calibration.reasons(),
                        "source_refs",List.of(run.ref("result","/outcome/case/carla/pedal_map").json(),new SourceRef(SPEC,"Q02").json())),
                obj("field","diagnostic_gt_kinematics_uncorrected","status",rawKinematics.status(),"reason_codes",rawKinematics.reasons())));
        List<EvidenceGates.Capability> capabilities=List.of(
                EvidenceGates.capability("RECORDED_CONTACT",ordered("VALID_BINDING_AND_EPISODE",contact.admissible()),true),
                EvidenceGates.capability("VECTOR_CONTACT_SPEED",ordered("VALID_BINDING",contact.admissible(),"PRECONTACT_VECTORS",contact.vectorRelative()!=null),true),
                EvidenceGates.capability("NOMINAL_2D_GEOMETRY",ordered("DECLARED_CLOCK_FRAME_SHAPE",nominal.math!=null,"RESOLVED_TRANSLATION",nominal.math!=null&&nominal.math.complete(),"FULL_BBOX_TRANSFORM",false,"VALIDATED_GEOMETRY_UNCERTAINTY",false),true),
                EvidenceGates.capability("FUNCTIONAL_DIAGNOSIS",ordered("MODE_KNOWN",!timeline.behavior().equals("UNKNOWN"),"APPROVED_REQUIREMENT",false,"EX_ANTE_CONTROLLER_TRACE",false,"COMMAND_CONSUMPTION",false),!timeline.off()),
                EvidenceGates.capability("PHYSICAL_AVOIDABILITY",ordered("NOMINAL_MODEL",profile(run),"VALIDATED_RESPONSE",false,"UNCERTAINTY_SET",false,"EXHAUSTIVE_ACTION_CERTIFICATE",false),true));
        report.put("evidence_sufficiency",capabilities.stream().map(EvidenceGates.Capability::json).toList());
        report.put("uncertainty_notes",List.of("UNCERTAINTY_BOUNDS_UNKNOWN","CLOCK_ALIGNMENT_UNKNOWN","NOMINAL_APPLIED_DIMENSION_MISMATCH","GEOMETRY_TRANSFORM_MISSING","NO_PROBABILITY_OR_CAUSAL_CONFIDENCE_ASSIGNED"));
        List<String> inconclusive=new ArrayList<>(List.of("REQUIREMENT_UNAPPROVED","OBSERVABILITY_UNPROVEN","CONTROL_WRITER_UNKNOWN","CALIBRATION_DOMAIN_UNKNOWN","P05_CERTIFICATE_MISSING"));
        if(!modeIs(run,"ON")&&!modeIs(run,"OFF"))inconclusive.add("AEB_MODE_UNRESOLVED");
        issues.stream().filter(i->i.code().startsWith("AEB_EVENT_")).map(Issue::code).distinct().forEach(inconclusive::add);
        if(timeline.pending())inconclusive.add("RESPONSE_WINDOW_RIGHT_CENSORED");inconclusive.addAll(outcome.reasons());
        report.put("inconclusive_reasons",inconclusive);
        report.put("legacy",obj("artifact_id",run.artifact("result").id(),"json_pointer","/evaluation"));
        @SuppressWarnings("unchecked") List<Map<String,Object>> oldRegistry=(List<Map<String,Object>>)input.get("artifacts");
        Map<String,Map<String,Object>> registry=new LinkedHashMap<>();oldRegistry.forEach(a->registry.put(a.get("id").toString(),a));
        if(pairedOff!=null)pairedOff.artifacts().values().forEach(a->registry.putIfAbsent(a.id(),a.json()));
        registry.put(SPEC,specArtifact());input.put("artifacts",new ArrayList<>(registry.values()));
        envelope.put("implementation_stage","M1B");envelope.put("analyzer_build_id","failure-analysis-m1b/1.0.1");
        envelope.put("handoff_reference",missing("MOBO_HANDOFF_OUT_OF_SCOPE_M1B",null));
        envelope.put("content_digest",EvidenceReport.contentDigest(envelope));
        @SuppressWarnings("unchecked") Map<String,Object> frozen=(Map<String,Object>)freeze(envelope);return frozen;
    }
    private static Map<String,Boolean> ordered(Object... fields) {
        Map<String,Boolean> out=new LinkedHashMap<>();for(int i=0;i<fields.length;i+=2)out.put((String)fields[i],(Boolean)fields[i+1]);return out;
    }
    private record GeometryView(GeometryEngine.Result math,Map<String,Object> json) {}
    private GeometryView geometry(Run r,List<Issue> issues,boolean applied) {
        String id=applied?"APPLIED_DIMENSIONS_CORE_FRONT_ANCHOR":"NOMINAL_CORE_FRONT_ANCHOR";
        Double length=num(r,applied?"result":"bundle",applied?"/outcome/case/carla/physics_applied/length_m":"/vehicle/length_m"),
                width=num(r,applied?"result":"bundle",applied?"/outcome/case/carla/physics_applied/width_m":"/vehicle/width_m"),
                dt=carla(r)?num(r,"result","/outcome/case/carla/fixed_delta_seconds"):profile(r)?.05:null;
        var frames=rows(r,"result","/outcome/frames");List<GeometryEngine.State> states=new ArrayList<>();
        if(profile(r)&&positive(length)&&positive(width)&&positive(dt)&&!blocked(r,issues,"result"))for(var f:frames) {
            Double t=n(f.get("t")),front=n(f.get("ego_x")),x=n(f.get("ped_x")),y=n(f.get("ped_y"));
            if(t==null||front==null||x==null||y==null)states.add(null);
            else states.add(new GeometryEngine.State(t,new GeometryEngine.Vec(front-length/2,0),new GeometryEngine.Vec(x,y),0));
        }
        GeometryEngine.Result result=GeometryEngine.analyze(states,length==null||width==null||dt==null?null:new GeometryEngine.Body(length,width,PED_RADIUS,"core",FRAME,dt));
        List<SourceRef> refs=new ArrayList<>(refs(r,"/outcome/frames","/outcome/case/carla/physics_applied"));refs.add(r.ref("bundle","/vehicle"));
        GeometryEngine.Pet pet=result.complete()&&result.longitudinal().size()==1&&result.lateral().size()==1?
                GeometryEngine.pet(result.longitudinal().getFirst(),result.lateral().getFirst(),id+":crossing-area","core"):
                new GeometryEngine.Pet(null,"UNKNOWN",List.of("OCCUPANCY_UNRESOLVED_OR_ENCOUNTER_ASSOCIATION_REQUIRED"));
        List<String> assumptions=new ArrayList<>(PROJECTION);if(applied)assumptions.add("Applied dimensions anchored at recorded core front, not an observed bbox center transform");
        Map<String,Object> output=obj("id",id,"geometry_id",id,"trajectory_kind","ACTUAL_TRAJECTORY","clock_id","core","frame_id",FRAME,
                "length_m",length,"width_m",width,"radius_m",profile(r)?PED_RADIUS:null,
                "full_physical_geometry",missing("BBOX_CENTER_OFFSET_PITCH_ROLL_AND_MESH_MISSING",null),
                "decision_time",r.read("result","/outcome/metrics/aeb_decision_t","s","core").json(),
                "horizon_start",calculated(states.isEmpty()||states.getFirst()==null?null:states.getFirst().t(),"G03","s","core",FRAME,refs,assumptions),
                "horizon_end",calculated(states.isEmpty()||states.getLast()==null?null:states.getLast().t(),"G03","s","core",FRAME,refs,assumptions),
                "conflict",calculated(result.conflict(),"G03",null,"core",FRAME,refs,assumptions,result.conflict()==null?"GEOMETRY_UNRESOLVED":"GEOMETRIC_INTERSECTION_IS_NOT_CONTACT_AUTHORITY"),
                "intervals",result.conflicts().stream().map(i->interval(i,"core",refs,assumptions)).toList(),
                "minimum_signed_indicator",calculated(result.minimumSignedIndicator(),"G03","m","core",FRAME,refs,assumptions),
                "minimum_clearance",calculated(result.minimumClearance(),"G03","m","core",FRAME,refs,assumptions),
                "longitudinal_occupancy",result.longitudinal().stream().map(i->interval(i,"core",refs,assumptions)).toList(),
                "lateral_occupancy",result.lateral().stream().map(i->interval(i,"core",refs,assumptions)).toList(),
                "pet",calculated(pet.seconds(),"G04","s","core",FRAME,refs,assumptions,pet.seconds()==null?pet.reasons().getFirst():"BROAD_PHASE_NAMED_AREA_ONLY"),
                "pet_relation",calculated(pet.relation(),"G04",null,"core",FRAME,refs,assumptions),"resolved_horizon",result.complete(),
                "uncertainty",missing("GEOMETRY_UNCERTAINTY_BOUNDS_MISSING","m"),"reason_codes",result.reasons());
        return new GeometryView(result,output);
    }
    private boolean stationaryOutside(Run r,GeometryEngine.Result geometry) {
        var f=rows(r,"result","/outcome/frames");if(geometry==null||!geometry.complete()||f.size()<2||!geometry.lateral().isEmpty())return false;
        Double a=n(f.getLast().get("ped_y")),b=n(f.get(f.size()-2).get("ped_y")),v=n(f.getLast().get("ped_vy"));
        return a!=null&&a.equals(b)&&v!=null&&v==0;
    }
    private Map<String,Object> feasibility(Run r,List<Issue> issues,AebTimelineBuilder.Timeline timeline) {
        Double configured=num(r,"result","/outcome/params/max_deceleration"),vehicle=num(r,"bundle","/vehicle/max_brake_decel_mps2"),
                adapter=num(r,"result","/outcome/case/carla/full_brake_decel"),mu=num(r,"result","/outcome/case/road_friction"),
                jerk=num(r,"result","/outcome/params/brake_buildup_rate"),activation=num(r,"result","/outcome/params/brake_activation_delay");
        var envelope=StoppingModel.availableDeceleration(configured,vehicle,adapter,mu);
        Double reference=timeline.decision();String basis="ACTUAL_CORE_DECISION_NOT_OBSERVABILITY";
        if(reference==null){reference=num(r,"result","/outcome/case/carla/perception_radar/ground_truth_aeb_decision_t");basis="HYPOTHETICAL_GT_SHADOW_DECISION_NOT_OBSERVABILITY";}
        var frames=rows(r,"result","/outcome/frames");Map<String,Object> state=null;int index=-1;
        if(reference!=null&&!blocked(r,issues,"result"))for(int i=0;i<frames.size();i++){Double t=n(frames.get(i).get("t"));if(t!=null&&Math.abs(t-reference)<1e-8){state=frames.get(i);index=i;break;}}
        Double v=state==null?null:n(state.get("ego_v")),front=state==null?null:n(state.get("ego_x")),cross=state==null?null:n(state.get("ped_x"));
        StoppingModel.Parameters p=positive(envelope.cap())&&positive(jerk)&&activation!=null&&activation>=0&&profile(r)?new StoppingModel.Parameters(envelope.cap(),jerk,activation+COMMAND_DELAY):null;
        StoppingModel.Stop stop=p!=null&&v!=null&&v>=0?StoppingModel.stop(v,p):null;
        Double gap=front!=null&&cross!=null?cross-PED_RADIUS-front:null;
        List<SourceRef> refs=new ArrayList<>(refs(r,"/outcome/params","/outcome/case/road_friction","/outcome/case/carla/full_brake_decel"));
        if(index>=0)refs.add(r.ref("result","/outcome/frames/"+index));
        if(!frames.isEmpty())refs.add(r.ref("result","/outcome/frames/"+(frames.size()-1)+"/t"));
        refs.add(r.ref("bundle","/vehicle"));
        List<String> assumptions=List.of("Flat road min(config,vehicle,adapter,mu*g), source command delay .10 s, initial deceleration zero",
                "Demanded envelope is assumed attainable in continuous ramp model; physical response/calibration unvalidated",
                "Near-side boundary ped_x-radius already includes radius once; unbuffered screen is not an approved safety margin");
        Map<String,Object> result=obj("id","CONDITIONAL_BRAKE_ONLY_STOPPING_SCREEN","model_id","P01-P04-flat-delay-ramp","action_set_id","EXISTING_CONFIG_BRAKE_ONLY",
                "reference_time",calculated(reference,"P04","s","core",FRAME,refs,assumptions),"reference_basis",basis,
                "available_deceleration",calculated(envelope.cap(),"P01","m/s\u00b2","core",FRAME,refs,assumptions),
                "known_cap_upper_bound",calculated(envelope.knownUpperBound(),"P01","m/s\u00b2","core",FRAME,refs,assumptions),
                "missing_envelope_bounds",envelope.missing(),"stopping_distance",calculated(stop==null?null:stop.distanceM(),"P02","m","core",FRAME,refs,assumptions),
                "stopping_time",calculated(stop==null?null:stop.seconds(),"P02","s","core",FRAME,refs,assumptions),
                "available_distance",calculated(gap,"G01","m","core",FRAME,refs,assumptions),
                "unbuffered_stopping_margin",calculated(gap!=null&&stop!=null?gap-stop.distanceM():null,"P04","m","core",FRAME,refs,assumptions),
                "stopping_margin",missing("APPROVED_SAFETY_MARGIN_MISSING","m"),"latest_decision_windows",List.of(),
                "latest_feasible_decision",missing("CERTIFIED_2D_DECISION_WINDOW_MISSING","s"),"avoidability",missing("VALIDATED_P05_SCOPE_AND_UNCERTAINTY_MISSING",null),
                "search_certificate",missing("P05_CERTIFICATE_MISSING",null),"calibration_applicability","UNKNOWN");
        if(p!=null&&v!=null&&v>=0&&gap!=null) {
            var req=StoppingModel.requiredEnvelope(v,gap,p.jerk(),p.delay(),0,p.cap());
            result.put("required_cap_within_declared_envelope",calculated(req.requiredCap(),"P03","m/s\u00b2","core",FRAME,refs,assumptions,req.status()));
            result.put("ideal_distance_lower_bound",calculated(StoppingModel.ideal(v,p.cap()).distanceM(),"P03","m","core",FRAME,refs,assumptions));
            List<StoppingModel.StopState> path=new ArrayList<>();
            for(int i=0;i<=index;i++) {
                var f=frames.get(i);Double t=n(f.get("t")),x=n(f.get("ego_x")),cx=n(f.get("ped_x")),speed=n(f.get("ego_v"));
                if(t!=null&&x!=null&&cx!=null&&speed!=null&&speed>=0)path.add(new StoppingModel.StopState(t,cx-PED_RADIUS-x,speed));
            }
            Double dt=num(r,"result","/outcome/case/carla/fixed_delta_seconds");
            var windows=StoppingModel.windows(path,p,0,dt==null?0:dt,true);
            result.put("unbuffered_predecision_screen_windows",windows.intervals().stream().map(i->interval(i,"core",refs,assumptions)).toList());
            result.put("unbuffered_screen_latest",calculated(windows.latestDecision(),"P04","s","core",FRAME,refs,assumptions,
                    windows.latestDecision()==null?"STOP_WINDOW_RIGHT_CENSORED_OR_EMPTY":"STOP_BOUNDARY_SCREEN_NOT_2D_DEADLINE"));
            Double y=n(state.get("ped_y")),vy=n(state.get("ped_vy")),length=num(r,"bundle","/vehicle/length_m"),width=num(r,"bundle","/vehicle/width_m");
            double horizon=timeline.coreEnd()==null||reference==null?0:timeline.coreEnd()-reference;
            if(y!=null&&vy!=null&&positive(length)&&positive(width)&&horizon>0) {
                var target=new AvoidabilityAnalyzer.Target(new AvoidabilityAnalyzer.Range(cross,cross),new AvoidabilityAnalyzer.Range(y,y),new AvoidabilityAnalyzer.Range(0,0),new AvoidabilityAnalyzer.Range(vy,vy));
                var scope=new AvoidabilityAnalyzer.Scope("core",FRAME,"NOMINAL_CORE_FRONT_ANCHOR","EXISTING_CONFIG_BRAKE_ONLY",List.of(),List.of(),false);
                var screen=AvoidabilityAnalyzer.screen(front,v,length,width,PED_RADIUS,target,horizon,List.of(new AvoidabilityAnalyzer.Action("RECORDED_CONFIG_DEMAND",p)),scope,.001,15);
                result.put("conditional_2d_example",obj("trajectory_kind","COUNTERFACTUAL_ACTION","horizon_s",horizon,"horizon_scope","REMAINING_RECORDED_EPISODE_CENSORED",
                        "formula_id","fa-formula/3.0.0:P05","source_refs",refs.stream().map(SourceRef::json).toList(),
                        "uncertainty_set",missing("VALIDATED_UNCERTAINTY_SET_MISSING",null),
                        "assumptions",List.of("Illustrative point-state constant-velocity target, not validated uncertainty bounds or controller-delivered inputs","One configured brake demand, not an exhaustive physical action set"),
                        "actions",screen.actions().stream().map(a->obj("action_id",a.actionId(),"enclosure_result",a.proof(),"interval_boxes",a.enclosures())).toList(),
                        "avoidability",missing("POINT_ASSUMPTION_NOT_VALIDATED_UNCERTAINTY",null),"reason_codes",screen.missing()));
            }
        }
        return result;
    }
}
