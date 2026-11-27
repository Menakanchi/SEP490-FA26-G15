package com.vsos.core.failureanalysis;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** Source mechanisms explain possibilities, never prove the executed binary or a cause.
 * Inspected source revisions are pinned; missing/changed repository sources abstain. */
public final class HypothesisInvestigator {
    private record Source(String name,String path,String sha) {}
    private static final List<Source> INSPECTED=List.of(
            new Source("AebStack","aeb/AebStack.java","a1fd82ad829877da52dfb6c44a99d7af4aeb33e8a01d3c5793e89231ec8ac78f"),
            new Source("RadarTracker","aeb/RadarTracker.java","c4388f8d662559faf1ee1d8db22b455e0e255eb6b64ebad79af78a26c6c0ef03"),
            new Source("CarlaSession","simulation/CarlaSession.java","9ff0219e17be3f0d7bf8a4b3c41ace8d508f1102c31581e94aa09027902ac0fd"),
            new Source("Simulator","simulation/Simulator.java","e8b01649b57aaa1c8c9acf0f34b324426a24959fbf04b149370e755a1e5ce9c8"));
    private final Map<String,Artifact> sources;
    public HypothesisInvestigator(){this(Path.of("."));}
    public HypothesisInvestigator(Path repository) {
        Map<String,Artifact> found=new LinkedHashMap<>();
        for(Source s:INSPECTED)try {
            Artifact a=HandoffSnapshots.source(repository.resolve("src/main/java/com/vsos/core").resolve(s.path),"fa-mechanism:"+s.name+":"+s.sha);
            if(s.sha.equals(a.sha256()))found.put(s.name,a);
        }catch(IOException ignored){ /* Absence is reported, not replaced by an invented source artifact. */ }
        sources=Collections.unmodifiableMap(found);
    }
    public List<Artifact> artifacts(){return List.copyOf(sources.values());}
    private List<Map<String,Object>> source(String name,String method) {
        Artifact a=sources.get(name);return a==null?List.of():List.of(new SourceRef(a.id(),"method:"+method).json());
    }
    private record Mechanism(String id,String stage,String source,String method,String mechanism,String trace,String expected,String refuting,List<String> formulas) {}
    private static Mechanism m(String id,String stage,String source,String method,String mechanism,String trace,String expected,String refuting,String... formulas){
        return new Mechanism(id,stage,source,method,mechanism,trace,expected,refuting,List.of(formulas));
    }
    private static List<Mechanism> mechanisms(String type) {
        return switch(type) {
            case "NO_BRAKING" -> List.of(
                    m("delivery","PERCEPTION","CarlaSession","measuredStep","Measured path passes tracker estimate only when tracked and confidence reaches the AebStack threshold; GT shadow is a separate stack, not proof of primary delivery.",
                            "Primary radar packets, rejected returns, chosen-track delivery and decision input with target actor association",
                            "No qualified target delivered before the approved actionable opportunity closes",
                            "Correct target delivered with adequate confidence early throughout the approved duty window","T01","Q01"),
                    m("association","PERCEPTION_TRACKING","RadarTracker","update/classify/openTracks","Nearest gated assignment, Doppler residual track opening, motion significance/confirmation and nearest-forward moving-track selection can withhold or select a different target.",
                            "All track IDs, point assignments, residuals, classification and selected target history",
                            "Target track is rejected, unqualified or displaced by another selected track",
                            "Associated primary target is continuously selected and delivered early enough","G01","T01","Q01"),
                    m("prediction","CONFLICT_PREDICTION_DECISION","AebStack","decide","Decision requires detected target, positive gap, sufficient closing speed, current/predicted corridor and TTC threshold. This is controller logic, not physical 2D collision truth.",
                            "Actual ex-ante gap, perceivedY, filtered vLeft, closing speed, corridor inputs and inhibit/cancellation reason",
                            "One decision predicate is false during the independently approved duty window",
                            "All predicates satisfied at an eligible decision tick yet no decision; investigate execution/logging instead","G02","G03","T01","Q01"),
                    m("late-pending","DECISION_COMMAND","AebStack","control","Command engagement waits for decision plus activation delay and actuator-response constant before ramping; right censoring can explain absent B without a missed command.",
                            "Decision tick, scheduled due tick, episode end, pending/cancel state and complete emission log",
                            "Decision arrives after the actionable window or command due time is beyond observed end",
                            "Complete aligned command window extends past due time with a valid earlier decision and no allowed cancellation","T01","P02","P04","P05"),
                    m("consumption-logging","COMMAND_PHYSICAL_RESPONSE","CarlaSession","commandTick","Core Tick output is distinct from adapter writer ownership and physics consumption. OFF returns no applied AEB command; recorder pedal alone cannot identify a writer.",
                            "Writer-tagged emitted/applied/consumed command sequence, simulator frame acknowledgments and clock mapping",
                            "A command exists upstream but downstream consumption is missing, or logs/clock mapping are incomplete",
                            "Complete writer-attributed consumption trace and aligned log coverage resolve command presence; absent D/Q/B alone cannot identify radar failure","T01","T02","Q01"));
            case "FALSE_BRAKING" -> List.of(
                    m("ex-ante-conflict","CONFLICT_PREDICTION","AebStack","decide","PredictedY uses perceivedY plus filtered lateral velocity over min(TTC,horizon); current corridor also permits a decision. A later curb stop is hindsight, not the decision input.",
                            "Actual ex-ante decision inputs, predictedY, corridor transform and approved caution policy",
                            "Decision-time predicted conflict exists although later target motion stops outside the corridor",
                            "No decision-time allowed hazard under approved caution policy and complete all-actor coverage","G02","G03","G04","T01","Q01"),
                    m("stale-track","PERCEPTION_TRACKING","RadarTracker","classify/outputVLeft/update","Motion classification has static hold and lost-track persistence; outputVLeft uses a recent regression or alpha-beta fallback. Track velocity can outlive the target's motion.",
                            "Track lifecycle, last measured packet, regression samples, vLeft fallback and selected actor history",
                            "Delivered track retains lateral motion or persists after target stops",
                            "Fresh associated target samples and velocity estimates accurately reflect the stop at every decision input","G02","T01","Q01"),
                    m("caution-other-actor","DECISION","CarlaSession","measuredStep/radarEstimate","The selected radar estimate need not be the scenario target; nearest moving hazards and a permitted caution response compete with a false-braking interpretation.",
                            "Approved caution requirements, all actor tracks/hazard reasons and selected-track binding",
                            "An allowed ex-ante precaution or another actor explains command engagement",
                            "Complete actor/reason trace and approved caution policy exclude every permitted intervention","G03","Q01"),
                    m("geometry-writer","COMMAND_GEOMETRY","CarlaSession","step/commandTick","Core front/corridor projection and recorded pedal do not establish full mesh geometry or actual writer ownership; a non-AEB command can explain pedal activity.",
                            "Full bbox transforms, actual corridor inputs, writer-tagged command and consumption sequence",
                            "Projection mismatch or another writer explains the apparent unnecessary response",
                            "Validated 2D transforms and writer-attributed AEB consumption exclude both alternatives","G01","G03","T01","T02","Q01"));
            case "INEFFECTIVE_BRAKING" -> List.of(
                    m("late-command","DECISION_COMMAND","AebStack","control/decide","Decision and command delay consume distance before the configured ramp. A 1D negative margin is only a screen; lateness requires a validated 2D feasible-window certificate.",
                            "Primary qualified opportunity, actual decision/command timestamps, aligned actor trace and certified uncertainty/action set",
                            "Command is later than a certified brake-only feasible window despite an approved earlier opportunity",
                            "Command is timely for that certificate, or no earlier observable actionable opportunity exists","T01","P02","P04","P05"),
                    m("friction-envelope","PHYSICAL_RESPONSE","Simulator","buildOutcome/brakePhaseMetrics","The model's available-deceleration scalar bounds a modeled stopping/extrapolation calculation; road friction and validated vehicle response may limit actual achievable deceleration.",
                            "Scoped friction/vehicle calibration validation, residuals, physical velocity and demand-response traces",
                            "Validated attainable response envelope is below demand in the encounter domain",
                            "Measured validated response meets demand across the certified domain; a configured cap alone cannot prove a friction limit","P01","P02","P03","Q02"),
                    m("delay-ramp-consumption","COMMAND_PHYSICAL_RESPONSE","CarlaSession","pedalFor/commandTick","Pedal mapping, optional ramp lead and feedback convert demand to pedal. Source delay constants and configured ramp are not measured actuator delay or achieved deceleration.",
                            "Writer-tagged demand, mapped pedal, consumed command frame, override masks and physical response with calibration",
                            "Attributed consumed demand precedes delayed or insufficient physical response beyond approved tolerance",
                            "Physical onset/ramp meets validated demand after correct clock alignment and permitted overrides","T01","T02","P02","Q02"),
                    m("2D-crossing","PHYSICAL_GEOMETRY_OUTCOME","CarlaSession","step","Pedestrian overlap is an approximate geometry test. The current pedestrian profile requires a sensor hit for collision; older profiles also accept overlap. Longitudinal stopping alone may not eliminate crossing occupancy.",
                            "World bbox poses, target trajectory, uncertainty set, complete brake-action analysis and collision authority policy",
                            "Full-body 2D occupancy persists for the declared action set under validated uncertainty",
                            "A certified admissible brake action separates both bodies for the complete conflict interval","G01","G03","G04","P05"),
                    m("mitigation-or-contact-authority","OUTCOME","CarlaSession","step/finish","Pedestrian collision termination depends on simulator profile: the current profile requires a sensor hit, while older profiles also accept geometric overlap. Recorded pre-contact velocity is a separate observation. Contact can remain while mitigation meets the approved goal.",
                            "Matching authoritative contact records, aligned pre-contact velocities, valid paired OFF context and approved mitigation goal",
                            "Impact reduction meets the goal, or authority/clock disagreement prevents adjudicating goal violation",
                            "Authoritative aligned impact and controlled comparison establish an approved goal violation; that still does not isolate a cause","I01","T01","Q01"));
            default -> List.of();
        };
    }
    public DiagnosisPolicy.Assessment investigate(Run run,AebTimelineBuilder.Timeline t,ImpactAnalyzer.Contact contact,
                                                  Map<String,Object> braking,DiagnosisPolicy.Assessment assessment,Map<String,Object> mitigation) {
        List<Map<String,Object>> dossiers=new ArrayList<>();
        if(t.off()||!modeIs(run,"ON"))return new DiagnosisPolicy.Assessment(assessment.candidates(),List.of(),assessment.functionalAssessment());
        for(var candidate:assessment.candidates()) {
            String type=candidate.get("type").toString();List<Mechanism> mechanisms=mechanisms(type);if(mechanisms.isEmpty())continue;
            String id=switch(type){case "NO_BRAKING"->"primary-perception";case "FALSE_BRAKING"->"caution-or-prediction";default->"response-or-opportunity";};
            List<Map<String,Object>> alternatives=new ArrayList<>(),tests=new ArrayList<>(),sourceRefs=new ArrayList<>();
            for(Mechanism m:mechanisms) {
                var refs=source(m.source,m.method);sourceRefs.addAll(refs);
                alternatives.add(obj("id",id+":"+m.id,"status","INCONCLUSIVE","stage",m.stage,"mechanism",m.mechanism,
                        "source_mechanism_refs",refs,"missing_evidence",List.of(m.trace),"root_cause_certainty",missing("CAUSAL_TRACE_AND_APPROVED_ADJUDICATION_MISSING",null)));
                tests.add(obj("id",id+":"+m.id+":falsify","hypothesis_id",id+":"+m.id,"hypothesis",m.mechanism,
                        "required_evidence",List.of(m.trace),"expected_if_true",m.expected,"refuting_observation",m.refuting,
                        "formula_refs",m.formulas,"source_mechanism_refs",refs,
                        "required_alignment",List.of("Same run, target actor/track and ego identity; preserve seed/replicate",
                                "Explicit core/recorder/command/physics clock mapping with bounded uncertainty; no inferred origin offset",
                                "Approved requirement/opportunity window; GT hindsight is not sensor observability"),
                        "execution_status","NOT_EXECUTED","executable_status","BLOCKED_BY_EXTERNAL_EVIDENCE",
                        "reason_codes",List.of("REQUIRED_PRIMARY_TRACE_OR_APPROVED_POLICY_NOT_AVAILABLE","PLAN_IS_NOT_EXPERIMENTAL_EVIDENCE")));
            }
            List<Map<String,Object>> counters=new ArrayList<>();
            if(t.detection()!=null)counters.add(obj("observation","A primary detection timestamp is recorded; total absence of all detection is not established",
                    "source_refs",refs(run,"/outcome/metrics/first_detection_t").stream().map(SourceRef::json).toList(),"limitation","Detection summary does not bind the delivered actor or an early actionable opportunity"));
            if(t.command()!=null)counters.add(obj("observation","Core command engagement is recorded; absence of every command is contradicted at the core layer",
                    "source_refs",refs(run,"/outcome/metrics/brake_onset_t").stream().map(SourceRef::json).toList(),"limitation","Emission, writer and consumption remain separate"));
            if(at(braking,"/peak_decel/value")!=null)counters.add(obj("observation","Pre-contact GT describes some physical deceleration; complete lack of response is not established",
                    "source_refs",List.of(run.ref("ground_truth","").json()),"limitation","Response may be unattributed, insufficient or affected by override; not canonical jerk"));
            if(at(mitigation,"/observed_speed_reduction/value") instanceof Number delta&&delta.doubleValue()>0)counters.add(obj(
                    "observation","Matched recorded ON/OFF contact scalars show a positive observed reduction; complete absence of mitigation is contradicted observationally",
                    "evidence",mitigation.get("observed_speed_reduction"),"limitation","Pair disturbances/writers remain uncontrolled; no causal contribution or approved goal compliance inferred"));
            List<Map<String,Object>> links=new ArrayList<>();
            for(String objective:CanonicalObjectiveReader.KEYS) {
                Object scalar=run.get("result","/outcome/metrics/"+objective);
                String mechanism=switch(objective) {
                    case "rms_jerk_mps3"->"Command timing, response ramp or oscillations could affect the producer acceleration derivative; filter/window effects differ from raw GT jerk. A high scalar does not identify BRAKE_BUILDUP_RATE.";
                    case "impact_speed_mps"->"Decision timing, feasible response and target crossing could affect core impact; recorded contact velocity and paired ON/OFF observations have separate clocks/sampling and cannot isolate a causal contribution.";
                    default->"Command onset, trace displacement and constant-deceleration extrapolated tail could explain stored stopping distance; delay/ramp screen starts at a different reference. Shorter distance alone is not success.";
                };
                List<SourceRef> objectiveRefs=new ArrayList<>(refs(run,"/outcome/metrics/"+objective,"/outcome/metrics/aeb_decision_t","/outcome/metrics/brake_onset_t"));
                if(objective.equals("impact_speed_mps"))objectiveRefs.addAll(contact.refs());
                if(objective.equals("stopping_distance_m"))objectiveRefs.addAll(refs(run,"/outcome/frames","/outcome/metrics/decel_available_mps2","/outcome/case/road_friction"));
                if(objective.equals("rms_jerk_mps3"))objectiveRefs.add(run.ref("ground_truth",""));
                links.add(obj("objective_key",objective,"hypothesis_id",id,"relation","HYPOTHESIZED",
                        "observed_value_relation",scalar==null?"UNKNOWN":"OBSERVED_STORED_VALUE_ONLY",
                        "canonical_value_status",scalar==null?"UNKNOWN":"OBSERVED","mechanism",mechanism,
                        "source_refs",objectiveRefs.stream().map(SourceRef::json).toList(),
                        "observed_evidence",objective.equals("impact_speed_mps")?obj("recorded_contact_impact",contact.json().get("recorded_relative_speed"),"paired_observation",mitigation):
                                objective.equals("rms_jerk_mps3")?obj("diagnostic_gt_jerk",braking.get("jerk_rms"),"signal_distinction","Raw recorder GT, not the filtered canonical core signal"):
                                        obj("trace_reference","/report/objectives/stopping_distance_m/decomposition/trace_component","model_tail_reference","/report/objectives/stopping_distance_m/decomposition/extrapolated_component"),
                        "formula_refs",objective.equals("rms_jerk_mps3")?List.of("T01","T02","Q02"):objective.equals("impact_speed_mps")?List.of("I01","G03","P05"):List.of("P01","P02","P04","Q02"),
                        "limitations",List.of(scalar==null?"Canonical value is missing; no substitute computed":"Canonical producer scalar/filter/window/aggregation are unchanged",
                                "Mechanism is not an observed causal effect; runtime/source equivalence and clock/actor alignment unproven",
                                "No confidence probability, weighted score or predicted improvement")));
            }
            List<String> missing=new ArrayList<>(List.of("PRIMARY_EX_ANTE_DELIVERY_AND_REASON_TRACE","ATTRIBUTED_APPLIED_CONSUMED_COMMAND_TRACE",
                    "CROSS_CLOCK_ACTOR_ALIGNMENT","APPROVED_CAUSAL_ADJUDICATION"));
            boolean allSources=sourceRefs.size()==mechanisms.size();if(!allSources)missing.add("INSPECTED_MECHANISM_SOURCE_MISSING_OR_CHANGED");
            dossiers.add(obj("id",id,"type",type+"_MECHANISM_INVESTIGATION","status",allSources?"SUSPECTED":"INCONCLUSIVE",
                    "related_failure_candidate_ids",List.of(candidate.get("id")),"stage","PERCEPTION_TO_OUTCOME",
                    "technical_mechanism",mechanisms.getFirst().mechanism,"source_mechanism_refs",sourceRefs,
                    "supporting_evidence",List.of(candidate.get("evidence")),"counterevidence",counters,
                    "alternative_hypotheses",alternatives,"alternatives",candidate.get("alternatives"),"missing_evidence",missing,
                    "falsification_tests",tests,"formula_refs",mechanisms.stream().flatMap(m->m.formulas.stream()).distinct().toList(),
                    "scope_assumptions",List.of("Observed symptom motivates investigation; it does not establish any alternative mechanism",
                            "Pinned inspected repository source explains a possible mechanism, not the executed Golden binary",
                            "Measured radar mechanisms apply only to a radar-fed runtime path; kinematic synthetic perception is a competing profile-specific mechanism",
                            "Current controller predicates and hindsight GT are not approved intervention duty",
                            "No P05 physical-limit certificate or causal intervention has been supplied"),
                    "runtime_source_equivalence",missing("RUNTIME_BINARY_TO_INSPECTED_SOURCE_UNPROVEN",null),
                    "root_cause_certainty",missing("CAUSAL_TRACE_AND_APPROVED_ADJUDICATION_MISSING",null),
                    "objective_links",links,"reason_codes",List.of("OBSERVED_SYMPTOM_CAUSAL_ALTERNATIVES_UNRESOLVED")));
        }
        return new DiagnosisPolicy.Assessment(assessment.candidates(),List.copyOf(dossiers),assessment.functionalAssessment());
    }
}
