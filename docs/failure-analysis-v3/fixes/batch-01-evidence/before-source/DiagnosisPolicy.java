package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** Conservative V3 policy. Outcome, symptoms, functional requirements and causal attribution are separate. */
public final class DiagnosisPolicy {
    public record Outcome(String label,String basis,List<String> reasons) {}
    public record Assessment(List<Map<String,Object>> candidates,List<Map<String,Object>> hypotheses,String functionalAssessment) {}
    public record Requirement(String id,String version,String status,String candidateType,List<SourceRef> refs) {
        public Requirement { refs=List.copyOf(refs); }
    }
    /** Explicit normalized evidence, not inferred from legacy labels, configuration or future target intent. */
    public record FunctionalEvidence(Requirement requirement,Map<String,Value> gates) {
        public FunctionalEvidence { gates=Map.copyOf(gates); }
    }
    public static List<String> requiredGates(String type) {
        return switch(type) {
            case "FALSE_BRAKING" -> List.of("ACTUAL_MEANINGFUL_AEB_ATTRIBUTION","APPROVED_CAUTION_POLICY","EX_ANTE_NO_ALLOWED_HAZARD","ALL_ACTOR_REASON_COVERAGE","VALID_CLOCK_GEOMETRY");
            case "NO_BRAKING" -> List.of("APPROVED_INTERVENTION_DUTY","VALIDATED_OBSERVABLE_ACTIONABLE_OPPORTUNITY","COMPLETE_COMMAND_WINDOW","NO_PERMITTED_INHIBIT_OR_CANCELLATION","VALID_CLOCK_GEOMETRY");
            case "INEFFECTIVE_BRAKING" -> List.of("APPROVED_PERFORMANCE_GOAL","APPLIED_CONSUMED_COMMAND_AND_RESPONSE","VALIDATED_RESPONSE_ENVELOPE","MEANINGFUL_OPPORTUNITY","STATED_GOAL_VIOLATION","VALID_CLOCK_GEOMETRY");
            default -> List.of();
        };
    }
    /** Upgrade only an existing symptom, with every required predicate cited and non-conditional.
     * A complete source-backed requirement package is required; this never confirms a root cause. */
    public Assessment applyRequirements(Assessment symptoms,Map<String,FunctionalEvidence> supplied) {
        if(symptoms.functionalAssessment.equals("NOT_APPLICABLE"))return symptoms;
        List<Map<String,Object>> out=new ArrayList<>();boolean supported=false;
        for(var candidate:symptoms.candidates) {
            String type=candidate.get("type").toString();FunctionalEvidence evidence=supplied.get(type);
            Requirement req=evidence==null?null:evidence.requirement;
            boolean approved=req!=null&&req.id!=null&&!req.id.isBlank()&&req.version!=null&&!req.version.isBlank()&&"APPROVED".equals(req.status)
                    &&type.equals(req.candidateType)&&!req.refs.isEmpty()&&!requiredGates(type).isEmpty();
            List<SourceRef> refs=new ArrayList<>();if(approved)refs.addAll(req.refs);
            for(String key:requiredGates(type)) {
                Value gate=evidence==null?null:evidence.gates.get(key);
                if(gate==null||!Boolean.TRUE.equals(gate.value())||!List.of(Status.OBSERVED,Status.DERIVED).contains(gate.status())||gate.sourceRefs().isEmpty()
                        ||gate.status()==Status.DERIVED&&gate.formulaId()==null)approved=false;
                else refs.addAll(gate.sourceRefs());
            }
            if(!approved){out.add(candidate);continue;}
            Map<String,Object> upgraded=new LinkedHashMap<>(candidate);
            upgraded.put("status","SUPPORTED");upgraded.put("requirement_id",req.id);
            upgraded.put("requirement_reference",obj("id",req.id,"version",req.version,"status",req.status,"scope",req.candidateType,"source_refs",req.refs.stream().map(SourceRef::json).toList()));
            upgraded.put("evidence",calculated("Explicit requirement and every required claim-local predicate are supported by supplied evidence","Q01",null,null,null,refs,List.of()));
            upgraded.put("missing_evidence",List.of());upgraded.put("reason_codes",List.of("APPROVED_REQUIREMENT_AND_CITED_GATES_SATISFIED"));
            out.add(upgraded);supported=true;
        }
        return new Assessment(List.copyOf(out),symptoms.hypotheses,supported?"FAILURE_SUPPORTED":symptoms.functionalAssessment);
    }
    /** No-contact outcome requires an independently supplied complete-encounter authority and approved threshold. */
    public static Outcome outcome(Boolean coreCollision,boolean admissibleContact,boolean verifiedNoContact,
                                  Double clearanceLow,Double clearanceHigh,Double approvedNearThreshold) {
        if(admissibleContact)return new Outcome("COLLISION","RECORDED_MATCHING_CONTACT",Boolean.FALSE.equals(coreCollision)?List.of("COLLISION_AUTHORITY_DISAGREEMENT"):List.of());
        if(Boolean.TRUE.equals(coreCollision))return new Outcome("UNKNOWN","UNRESOLVED",List.of("COLLISION_AUTHORITY_DISAGREEMENT","CONTACT_COVERAGE_UNPROVEN"));
        if(!verifiedNoContact||clearanceLow==null||clearanceHigh==null||approvedNearThreshold==null)
            return new Outcome("UNKNOWN","UNRESOLVED",List.of("CONTACT_COVERAGE_OR_APPROVED_ENCOUNTER_POLICY_MISSING"));
        if(clearanceLow<0||clearanceLow>clearanceHigh||!Double.isFinite(clearanceLow)||!Double.isFinite(clearanceHigh)||!Double.isFinite(approvedNearThreshold)||approvedNearThreshold<0)
            return new Outcome("UNKNOWN","INVALID_BOUNDS",List.of("CLEARANCE_OR_POLICY_BOUNDS_INVALID"));
        if(clearanceHigh<=approvedNearThreshold)return new Outcome("NEAR_MISS","VERIFIED_NO_CONTACT_AND_APPROVED_CLEARANCE",List.of());
        if(clearanceLow>approvedNearThreshold)return new Outcome("SAFE","VERIFIED_NO_CONTACT_AND_APPROVED_CLEARANCE",List.of());
        return new Outcome("UNKNOWN","UNCERTAINTY_CROSSES_THRESHOLD",List.of("ENCOUNTER_THRESHOLD_UNRESOLVED"));
    }
    public Assessment assess(Run r,AebTimelineBuilder.Timeline t,ImpactAnalyzer.Contact contact,GeometryEngine.Result nominal,
                             boolean terminalStationaryOutside,Outcome outcome) {
        List<Map<String,Object>> candidates=new ArrayList<>(),hypotheses=new ArrayList<>();
        if(t.off())return new Assessment(List.of(),List.of(),"NOT_APPLICABLE");
        if(t.behavior().equals("UNKNOWN"))return new Assessment(List.of(),List.of(),"INCONCLUSIVE");
        List<SourceRef> refs=refs(r,"/outcome/metrics/aeb_decision_t","/outcome/metrics/brake_onset_t","/outcome/frames");
        if(!t.pending()&&t.decision()==null&&t.command()==null&&(contact.admissible()||nominal!=null&&Boolean.TRUE.equals(nominal.conflict()))) {
            List<SourceRef> evidence=new ArrayList<>(refs);evidence.addAll(contact.refs());
            candidates.add(claim("no-braking","NO_BRAKING","NO_RECORDED_AEB_COMMAND",evidence,List.of("G03","T01","Q01"),
                    List.of("REQUIREMENT_UNAPPROVED","OBSERVABILITY_UNPROVEN","COMMAND_COVERAGE_UNPROVEN","ACTIONABLE_2D_OPPORTUNITY_UNPROVEN"),
                    List.of("Primary target never qualified","Occlusion or missing radar delivery","Permitted inhibit or incomplete logging")));
            hypotheses.add(claim("primary-perception","PRIMARY_PERCEPTION_OR_DELIVERY_UNRESOLVED","No command is recorded; perception mechanism is not isolated",evidence,List.of("T01","Q01"),
                    List.of("PRIMARY_RADAR_TRACE_MISSING","REJECTION_TRACK_LIFECYCLE_MISSING","CAUSAL_ADJUDICATION_MISSING"),List.of("Occlusion","Motion qualification","Coverage gaps")));
        }
        if(t.command()!=null&&terminalStationaryOutside&&nominal!=null&&nominal.complete()&&nominal.lateral().isEmpty()) {
            candidates.add(claim("false-braking","FALSE_BRAKING","Hindsight target stopped outside the declared nominal corridor after a recorded AEB command",refs,List.of("G03","G04","T01","Q01"),
                    List.of("CAUTION_POLICY_UNAPPROVED","PRIMARY_PREDICTION_INPUTS_MISSING","ALL_ACTOR_REASON_COVERAGE_MISSING","PHYSICS_CONSUMPTION_UNKNOWN"),
                    List.of("Acceptable precaution while target was still moving","Other legitimate hazard","Track velocity persistence")));
            hypotheses.add(claim("caution-or-prediction","CAUTION_OR_TRACK_PERSISTENCE","Actual controller prediction inputs are unavailable",refs,List.of("T01","Q01"),
                    List.of("ACTUAL_TRACK_VLEFT_PREDICTED_PATH_MISSING","REQUIREMENT_UNAPPROVED"),List.of("Reasonable caution","Stale motion estimate")));
        }
        if(t.command()!=null&&contact.admissible()) {
            List<SourceRef> evidence=new ArrayList<>(refs);evidence.addAll(contact.refs());
            candidates.add(claim("ineffective-braking","INEFFECTIVE_BRAKING","Recorded core command engagement and matching contact event",evidence,List.of("T01","I01","P05","Q01"),
                    List.of("PERFORMANCE_REQUIREMENT_UNAPPROVED","APPLIED_CONSUMED_COMMAND_MISSING","PHYSICAL_FEASIBILITY_UNCERTIFIED","CALIBRATION_DOMAIN_UNKNOWN"),
                    List.of("Mitigation may have met its goal despite contact","Late opportunity","Response variation","Geometry or target timing")));
        }
        boolean unresolved=!candidates.isEmpty()||t.pending()||outcome.reasons().contains("COLLISION_AUTHORITY_DISAGREEMENT")||t.decision()!=null&&t.command()==null;
        return applyRequirements(new Assessment(List.copyOf(candidates),List.copyOf(hypotheses),unresolved?"INCONCLUSIVE":"NO_SUPPORTED_FAILURE"),Map.of());
    }
    private Map<String,Object> claim(String id,String type,String description,List<SourceRef> refs,List<String> formulas,List<String> missing,List<String> alternatives) {
        Map<String,Object> evidence=calculated(description,"Q01",null,null,null,refs,List.of("Symptom/hypothesis only; no approved requirement or confirmed root-cause attribution"),"INSUFFICIENT_FOR_FUNCTIONAL_CONFIRMATION");
        return obj("id",id,"type",type,"status","SUSPECTED","evidence",evidence,"reason_codes",List.of("OBSERVED_SYMPTOM_WITH_EVIDENCE_GAPS"),
                "formula_refs",formulas,"requirement_id",null,"requirement_reference",missing("REQUIREMENT_UNAPPROVED",null),"missing_evidence",missing,"alternatives",alternatives);
    }
}
