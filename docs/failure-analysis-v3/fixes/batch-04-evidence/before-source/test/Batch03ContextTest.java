package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** All identities, reviews, validation statements and authority pins in this class are
 * SYNTHETIC_TEST_ONLY. They test acceptance/rejection, not any operational approval. */
class Batch03ContextTest {
    static Run template;
    static final Instant AS_OF=Instant.parse("2026-11-24T00:00:00Z");
    record PackageInput(Artifact pkg,Artifact trace,Artifact review,AnalysisContext.ReviewAuthority authority) {}
    @BeforeAll static void fixture() throws Exception {template=M1CFixture.create().input().members().getFirst().run();}
    static Run run(String type) {
        var data=M1CFixture.mutable(template.artifact("result").data());
        boolean command=!type.equals("NO_BRAKING"),contact=!type.equals("FALSE_BRAKING");
        for(String parent:List.of("/outcome/metrics","/evaluation/aeb_result")) {
            M1CFixture.set(data,parent+"/collision",contact);M1CFixture.set(data,parent+"/brake_onset_t",command?1.:null);
            M1CFixture.set(data,parent+"/aeb_decision_t",command?.75:null);M1CFixture.set(data,parent+"/first_detection_t",command?.5:null);
        }
        M1CFixture.set(data,"/source/project_id",1);
        List<Map<String,Object>> core=new ArrayList<>(),frames=new ArrayList<>(),gt=new ArrayList<>();
        for(int i=0;i<=201;i++) {
            double t=i/100.;if(i<=200)core.add(obj("t",t,"ego_x",10*t,"ego_v",10.,"ego_a",0.,"ped_x",15.,"ped_y",contact?0.:-3.,"ped_vy",0.));
            frames.add(obj("frame",1000+i,"sim_time_s",t,"ego_speed_ms",10.,"brake",command&&t>=1?.2:0.));
            for(String role:List.of("ego","target"))gt.add(obj("frame",1000+i,"sim_time_s",t,"role",role,"actor_id",role.equals("ego")?100:101,
                    "x_m",role.equals("ego")?10*t:15.,"y_m",role.equals("ego")?0.:contact?0.:-3.,"z_m",0.,"vx_ms",role.equals("ego")?10.:0.,"vy_ms",0.,"vz_ms",0.,"a_along_v_ms2",0.));
        }
        M1CFixture.set(data,"/outcome/frames",core);
        Map<String,Artifact> artifacts=new LinkedHashMap<>(template.artifacts());
        replace(artifacts,"result",data);replace(artifacts,"frames",frames);replace(artifacts,"ground_truth",gt);
        replace(artifacts,"collisions",contact?List.of(obj("frame",1180,"sim_time_s",1.8,"gt_frame_before",1179,"other_actor_id",101,"relative_speed_before_ms",10.,"impulse_ns",0.)):List.of());
        return new Run(template.runKey(),template.caseKey(),template.directory(),artifacts,List.of());
    }
    static void replace(Map<String,Artifact> artifacts,String name,Object data){Artifact a=artifacts.get(name);Artifact replacement=M1CFixture.artifact(a.id(),data);
        artifacts.put(name,new Artifact(a.id(),template.runKey(),replacement.uri(),replacement.sha256(),replacement.mediaType(),replacement.integrity(),replacement.data(),List.of()));}
    static Run changeRun(Run run,String pointer,Object value){var raw=M1CFixture.mutable(run.artifact("result").data());M1CFixture.set(raw,pointer,value);
        var artifacts=new LinkedHashMap<>(run.artifacts());replace(artifacts,"result",raw);return new Run(run.runKey(),run.caseKey(),run.directory(),artifacts,List.of());}
    static Map<String,Object> scope(Run r,String clock) {
        Map<String,Object> hashes=new LinkedHashMap<>();for(String name:List.of("result","bundle","frames","ground_truth","collisions"))hashes.put(name,r.artifact(name).sha256());
        return obj("run_key",r.runKey(),"result_sha256",r.artifact("result").sha256(),"artifact_hashes",hashes,
                "project_id",1,"scenario_id",1,"scenario_version_id",201,"aeb_version_id",10,"simulator",r.get("result","/simulator"),
                "interval",obj("start_s",0.,"end_s","recorder".equals(clock)?2.01:2.,"unit","s","clock_id",clock));
    }
    static Map<String,Object> predicate(String trace,String key,Object value,String unit,String clock) {
        return obj("value",value,"status","OBSERVED","unit",unit,"clock_id",clock,
                "interval",obj("start_s",0.,"end_s","recorder".equals(clock)?2.01:2.,"unit","s"),"source_refs",List.of(new SourceRef(trace,"/claims/"+key).json()));
    }
    static PackageInput sign(Map<String,Object> pkgData,Artifact trace) {
        String id=str(pkgData.get("id"));Artifact pkg=M1CFixture.artifact(id,pkgData);
        Artifact review=M1CFixture.artifact(id+"-review",obj("schema",AnalysisContext.REVIEW,"evidence_scope","SYNTHETIC_TEST_ONLY",
                "authority_id","SYNTHETIC_AUTHORITY","reviewer_id","SYNTHETIC_REVIEWER","review_id",id+"-review","status","APPROVED",
                "reviewed_at","2026-11-23T00:00:00Z","valid_until","2026-11-25T00:00:00Z",
                "subject_id",id,"subject_version",pkgData.get("version"),"subject_sha256",pkg.sha256(),"subject_data_sha256",AnalysisContext.dataHash(pkg),
                "evidence",obj(trace.id(),obj("sha256",trace.sha256(),"data_sha256",AnalysisContext.dataHash(trace)))));
        return new PackageInput(pkg,trace,review,new AnalysisContext.ReviewAuthority("SYNTHETIC_AUTHORITY","SYNTHETIC_REVIEWER",review.sha256(),AnalysisContext.dataHash(review)));
    }
    static PackageInput packageOf(Run r,String kind,Map<String,Object> payload,Map<String,Object> claims,String clock) {
        String id="synthetic-"+kind.toLowerCase(Locale.ROOT)+"-"+Objects.toString(payload.get("candidate_type"),Objects.toString(payload.get("field"),"coverage"));String traceId=id+"-trace";
        Map<String,Object> predicates=new LinkedHashMap<>();claims.forEach((key,v)->predicates.put(key,predicate(traceId,key,v,
                key.equals("measured_residual")?"m/s2":key.equals("drain_watermark")?"s":List.of("clearance_interval","near_miss_threshold").contains(key)?"m":null,
                key.equals("near_miss_threshold")||kind.equals("CALIBRATION")?null:clock)));
        var trace=M1CFixture.artifact(traceId,obj("schema","vehicsim.analysis-context-attestation/v1","evidence_scope","SYNTHETIC_TEST_ONLY",
                "run_key",r.runKey(),"result_sha256",r.artifact("result").sha256(),"basis","REVIEWED_EX_ANTE_EVIDENCE","claims",claims));
        payload=new LinkedHashMap<>(payload);payload.put("predicates",predicates);
        return sign(obj("schema",AnalysisContext.PACKAGE,"evidence_scope","SYNTHETIC_TEST_ONLY","id",id,"version","SYNTHETIC/1","kind",kind,
                "scope",scope(r,clock),"review_artifact_id",id+"-review","payload",payload),trace);
    }
    static PackageInput requirement(Run r,String type){Map<String,Object> claims=new LinkedHashMap<>();DiagnosisPolicy.requiredGates(type).forEach(g->claims.put(g,true));
        return packageOf(r,"REQUIREMENT",obj("candidate_type",type,"dependencies",List.of()),claims,"core");}
    static PackageInput calibration(Run r,String field,double max){return packageOf(r,"CALIBRATION",obj("field",field,"constraints",List.of(
                    obj("path","result:/outcome/case/road_friction","operator","CLOSED_RANGE","value",obj("min",.7,"max",max),"unit","1"),
                    obj("path","result:/simulator","operator","EQ","value","carla-0.9.16-xosc15","unit",null)),
            "limitations",List.of("Synthetic validation only; not a real calibrated vehicle")),obj("validation_completed",true,"measured_residual",.2),null);}
    static PackageInput coverage(Run r,Double low,Double high,Double threshold) {
        Map<String,Object> claims=new LinkedHashMap<>();for(String g:List.of("sensor_attached","sensor_healthy","complete_encounter","clock_valid","approved_absence_criterion"))claims.put(g,true);
        claims.put("sensor_binding",obj("sensor_actor_id",999,"ego_actor_id",100,"target_actor_id",101));
        claims.put("absence_criterion",obj("id","SYNTHETIC-ABSENCE","version","SYNTHETIC/1","policy","MATCHING_TARGET_SENSOR_EVENTS_ZERO_AFTER_DRAIN"));
        claims.put("drain_watermark",2.02);if(low!=null)claims.put("clearance_interval",obj("min",low,"max",high));if(threshold!=null)claims.put("near_miss_threshold",threshold);
        claims.put("clearance_basis",obj("frame_id","CARLA_WORLD","geometry_scope","FULL_BODY","uncertainty_scope","VALIDATED_ENCOUNTER_BOUNDS"));
        return packageOf(r,"COLLISION_COVERAGE",obj("sensor_actor_id",999,"ego_actor_id",100,"target_actor_id",101),claims,"recorder");
    }
    static AnalysisContext context(PackageInput... packages){return new AnalysisContext(AnalysisContext.VERSION,
            Arrays.stream(packages).map(PackageInput::pkg).toList(),Arrays.stream(packages).flatMap(p->java.util.stream.Stream.of(p.trace,p.review)).toList(),
            Arrays.stream(packages).map(PackageInput::authority).toList(),AS_OF,null);}
    static PackageInput mutate(PackageInput p,String pointer,Object value){var data=M1CFixture.mutable(p.pkg.data());M1CFixture.set(data,pointer,value);return sign(data,p.trace);}
    static Map<String,Object> analyze(Run r,AnalysisContext c){var out=new DiagnosticReport().analyze(r,null,c);
        assertThat(out.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(out));
        Set<Object> registry=new HashSet<>();for(Object a:list(at(out,"/input/artifacts")))registry.add(at(a,"/id"));validateRefs(out,registry);
        return MiniJson.parseObject(MiniJson.write(out));}
    static void validateRefs(Object node,Set<Object> registry){if(node instanceof Map<?,?> m){if(m.containsKey("artifact_id")&&m.containsKey("locator"))assertThat(registry).contains(m.get("artifact_id"));
        m.values().forEach(v->validateRefs(v,registry));}else if(node instanceof List<?> l)l.forEach(v->validateRefs(v,registry));}
    static void suspected(Map<String,Object> report){assertThat(at(report,"/report/functional_candidates/0/status")).isNotEqualTo("SUPPORTED");
        assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");}

    @ParameterizedTest @ValueSource(strings={"NO_BRAKING","FALSE_BRAKING","INEFFECTIVE_BRAKING"})
    void approvedCompleteRequirementsReachSerializedPublicReport(String type){Run r=run(type);var report=analyze(r,context(requirement(r,type)));
        assertThat(at(report,"/report/functional_candidates/0/type")).isEqualTo(type);assertThat(at(report,"/report/functional_candidates/0/status")).isEqualTo("SUPPORTED");
        assertThat(at(report,"/report/functional_assessment/value")).isEqualTo("FAILURE_SUPPORTED");
        assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");assertThat(at(report,"/input/baseline_binding/identity_status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"project_id","run_key","result_sha256","scenario_id","scenario_version_id","aeb_version_id","simulator"})
    void wrongIdentityScopeIsRejected(String field){Run r=run("NO_BRAKING");var p=mutate(requirement(r,"NO_BRAKING"),"/scope/"+field,field.endsWith("_id")?999:"WRONG");suspected(analyze(r,context(p)));}
    @ParameterizedTest @ValueSource(strings={"APPROVED_INTERVENTION_DUTY","VALIDATED_OBSERVABLE_ACTIONABLE_OPPORTUNITY","COMPLETE_COMMAND_WINDOW","NO_PERMITTED_INHIBIT_OR_CANCELLATION","VALID_CLOCK_GEOMETRY"})
    void everyFunctionalGateIsNecessary(String gate){Run r=run("NO_BRAKING");var p=mutate(requirement(r,"NO_BRAKING"),"/payload/predicates/"+gate+"/source_refs",List.of());suspected(analyze(r,context(p)));}
    @Test void approvedFieldWithoutIndependentAuthorityCannotUpgrade(){Run r=run("NO_BRAKING");var c=context(requirement(r,"NO_BRAKING"));suspected(analyze(r,new AnalysisContext(c.schemaVersion(),c.packages(),c.sources(),List.of(),AS_OF,null)));}
    @Test void staleReviewCannotUpgrade(){Run r=run("NO_BRAKING");var c=context(requirement(r,"NO_BRAKING"));suspected(analyze(r,new AnalysisContext(c.schemaVersion(),c.packages(),c.sources(),c.authorities(),AS_OF.plusSeconds(86400*7),null)));}
    @Test void unknownContextVersionCannotUpgrade(){Run r=run("NO_BRAKING");var c=context(requirement(r,"NO_BRAKING"));suspected(analyze(r,new AnalysisContext("unsupported/2",c.packages(),c.sources(),c.authorities(),AS_OF,null)));}
    @Test void approvedDutyCannotBeManufacturedFromConfiguredTtc(){Run r=run("NO_BRAKING");var p=mutate(requirement(r,"NO_BRAKING"),"/payload/predicates/APPROVED_INTERVENTION_DUTY",predicate(r.artifact("result").id(),"outcome/params/ttc_threshold",1.5,null,"core"));suspected(analyze(r,context(p)));}
    @ParameterizedTest @ValueSource(strings={"PHYSICAL_AVOIDABILITY","VERIFIED_NO_CONTACT","CALIBRATION:pedal_to_deceleration"})
    void unknownRequirementDependenciesCannotBeGrantedByOtherGates(String dependency){Run r=run("NO_BRAKING");var p=mutate(requirement(r,"NO_BRAKING"),"/payload/dependencies",List.of(dependency));suspected(analyze(r,context(p)));}
    @Test void calibrationUsesOnlyConstraintsActuallyDeclaredInApprovedDomain(){Run r=run("INEFFECTIVE_BRAKING");var report=analyze(r,context(calibration(r,"pedal_to_deceleration",.9)));
        assertThat(at(report,"/report/calibration_applicability/0/status")).isEqualTo("IN_DOMAIN");assertThat(at(report,"/report/calibration_applicability/0/measured_residual/value")).isEqualTo(.2);
        assertThat(at(report,"/report/physical_feasibility/status")).isEqualTo("UNKNOWN");assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");}
    @Test void outOfDomainRetainsCanonicalAndRecordedObservations(){Run r=run("INEFFECTIVE_BRAKING");var report=analyze(r,context(calibration(r,"stopping_extrapolation",.75)));
        assertThat(at(report,"/report/calibration_applicability/0/status")).isEqualTo("OUT_OF_DOMAIN");
        assertThat(at(report,"/report/physical_outcome/value")).isEqualTo("COLLISION");
        for(String key:CanonicalObjectiveReader.KEYS)assertThat(at(report,"/report/objectives/"+key+"/canonical_value/value")).isEqualTo(r.get("result","/outcome/metrics/"+key));
        assertThat(at(report,"/report/objectives/stopping_distance_m/calibrated_response_context/physical_response_claim/status")).isEqualTo("UNKNOWN");}
    @Test void applicableCalibrationCanSatisfyOnlyExplicitRequirementDependency(){Run r=run("INEFFECTIVE_BRAKING");var req=mutate(requirement(r,"INEFFECTIVE_BRAKING"),"/payload/dependencies",List.of("CALIBRATION:pedal_to_deceleration"));
        assertThat(at(analyze(r,context(req,calibration(r,"pedal_to_deceleration",.9))),"/report/functional_candidates/0/status")).isEqualTo("SUPPORTED");
        suspected(analyze(r,context(req,calibration(r,"pedal_to_deceleration",.75))));}
    @ParameterizedTest @ValueSource(strings={"stale","missing","unit","source","version"})
    void incompleteCalibrationStaysUnknown(String mutation){Run r=run("INEFFECTIVE_BRAKING");var p=calibration(r,"pedal_to_deceleration",.9);AnalysisContext c;
        switch(mutation){case "unit"->p=mutate(p,"/payload/constraints",List.of(obj("path","result:/outcome/case/road_friction","operator","EQ","value",.8,"unit","m")));
            case "source"->p=mutate(p,"/payload/predicates/validation_completed/source_refs",List.of());case "version"->p=mutate(p,"/scope/aeb_version_id",999);}
        c=mutation.equals("missing")?AnalysisContext.empty():context(p);
        if(mutation.equals("stale"))c=new AnalysisContext(c.schemaVersion(),c.packages(),c.sources(),c.authorities(),AS_OF.plusSeconds(86400*7),null);
        assertThat(at(analyze(r,c),"/report/calibration_applicability/0/status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"SAFE","NEAR_MISS","UNCERTAIN"})
    void verifiedAbsenceRequiresApprovedClearancePolicy(String outcome){Run r=run("FALSE_BRAKING");double low=outcome.equals("SAFE")?2.:.2,high=outcome.equals("NEAR_MISS")?.4:2.5;
        var report=analyze(r,context(coverage(r,low,high,1.)));
        assertThat(at(report,"/report/analysis_context/verified_no_contact")).isEqualTo(true);
        if(outcome.equals("UNCERTAIN"))assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");else assertThat(at(report,"/report/physical_outcome/value")).isEqualTo(outcome);}
    @Test void verifiedNoContactWithoutThresholdStillCannotMeanSafeOrNearMiss(){Run r=run("FALSE_BRAKING");var report=analyze(r,context(coverage(r,2.,3.,null)));
        assertThat(at(report,"/report/analysis_context/verified_no_contact")).isEqualTo(true);assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"sensor_attached","sensor_healthy","complete_encounter","clock_valid","approved_absence_criterion","sensor_binding","absence_criterion","drain_watermark"})
    void eachAbsenceGateIsRequired(String key){Run r=run("FALSE_BRAKING");var p=mutate(coverage(r,2.,3.,1.),"/payload/predicates/"+key+"/source_refs",List.of());
        var report=analyze(r,context(p));assertThat(at(report,"/report/analysis_context/verified_no_contact")).isEqualTo(false);assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");}
    @Test void positiveRecordedContactWinsOverContradictoryAbsencePackage(){Run r=run("NO_BRAKING");var report=analyze(r,context(coverage(r,2.,3.,1.)));
        assertThat(at(report,"/report/physical_outcome/value")).isEqualTo("COLLISION");assertThat(at(report,"/report/analysis_context/verified_no_contact")).isEqualTo(false);}
    @Test void emptyCollisionArrayAndGeometryAloneDoNotProveAbsence(){assertThat(at(analyze(run("FALSE_BRAKING"),AnalysisContext.empty()),"/report/physical_outcome/status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"mode","clock","event"})
    void contextCannotBypassBatch01RawModeClockOrEventGates(String defect){Run r=run("INEFFECTIVE_BRAKING");
        r=changeRun(r,defect.equals("mode")?"/outcome/case/aeb_mode":defect.equals("event")?"/outcome/metrics/brake_onset_t":"/outcome/frames",
                defect.equals("mode")?"INVALID":defect.equals("event")?-1.:List.of(M1CFixture.frame(.1),M1CFixture.frame(0.)));
        var report=analyze(r,context(requirement(r,"INEFFECTIVE_BRAKING")));assertThat((List<?>)at(report,"/report/functional_candidates")).isEmpty();assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");}
    @Test void duplicateConflictingPackagesCannotUpgrade(){Run r=run("NO_BRAKING");var p=requirement(r,"NO_BRAKING");
        var data=M1CFixture.mutable(p.pkg.data());data.put("id","second-requirement");data.put("review_artifact_id","second-requirement-review");
        var second=sign(data,new Artifact("second-trace",p.trace.runKey(),p.trace.uri(),p.trace.sha256(),p.trace.mediaType(),p.trace.integrity(),p.trace.data(),p.trace.issues()));
        // Deliberate duplicate claim and unresolved second references are both disqualifying.
        suspected(analyze(r,context(p,second)));}
    @Test void inMemoryPackageSubstitutionIsRejectedDespiteUnchangedByteHash(){Run r=run("NO_BRAKING");var p=requirement(r,"NO_BRAKING");var data=M1CFixture.mutable(p.pkg.data());M1CFixture.set(data,"/version","forged");
        var forged=new Artifact(p.pkg.id(),p.pkg.runKey(),p.pkg.uri(),p.pkg.sha256(),p.pkg.mediaType(),p.pkg.integrity(),data,List.of());suspected(analyze(r,context(new PackageInput(forged,p.trace,p.review,p.authority))));}
    @Test void immutableInputAndAuthorityListAreCopied(){Run r=run("NO_BRAKING");var p=requirement(r,"NO_BRAKING");var packages=new ArrayList<>(List.of(p.pkg));var sources=new ArrayList<>(List.of(p.trace,p.review));var authorities=new ArrayList<>(List.of(p.authority));
        var c=new AnalysisContext(AnalysisContext.VERSION,packages,sources,authorities,AS_OF,null);packages.clear();sources.clear();authorities.clear();
        assertThat(at(analyze(r,c),"/report/functional_candidates/0/status")).isEqualTo("SUPPORTED");assertThatThrownBy(()->c.packages().clear()).isInstanceOf(UnsupportedOperationException.class);}
    @ParameterizedTest @ValueSource(strings={"clock_id","unit","interval","status","value"})
    void gateRepresentationAndTemporalClaimsAreStrict(String field){Run r=run("NO_BRAKING");Object wrong=switch(field){case "clock_id"->"recorder";case "unit"->"s";case "interval"->obj("start_s",-1.,"end_s",3.,"unit","s");case "status"->"CONDITIONAL";default->1;};
        var p=mutate(requirement(r,"NO_BRAKING"),"/payload/predicates/APPROVED_INTERVENTION_DUTY/"+field,wrong);suspected(analyze(r,context(p)));}
    @Test void approvedRequirementCannotUseHindsightBasis(){Run r=run("NO_BRAKING");var p=requirement(r,"NO_BRAKING");var raw=M1CFixture.mutable(p.trace.data());raw.put("basis","HINDSIGHT_GROUND_TRUTH");var trace=M1CFixture.artifact(p.trace.id(),raw);
        suspected(analyze(r,context(sign(M1CFixture.mutable(p.pkg.data()),trace))));}
    @Test void oneInvalidPackageDoesNotRejectAnIndependentValidClaim(){Run r=run("INEFFECTIVE_BRAKING");var bad=mutate(calibration(r,"pedal_to_deceleration",.9),"/scope/project_id",999);
        var report=analyze(r,context(requirement(r,"INEFFECTIVE_BRAKING"),bad));assertThat(at(report,"/report/functional_candidates/0/status")).isEqualTo("SUPPORTED");assertThat(at(report,"/report/calibration_applicability/0/status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"partial","clock","drain","actor","clearance"})
    void absenceCannotBypassIntervalActorDrainAndGeometryScope(String defect){Run r=run("FALSE_BRAKING");var p=coverage(r,2.,3.,1.);
        p=switch(defect){case "partial"->mutate(p,"/scope/interval/end_s",1.);case "clock"->mutate(p,"/scope/interval/clock_id","core");
            case "drain"->mutate(p,"/payload/predicates/drain_watermark/value",2.01);case "actor"->mutate(p,"/payload/target_actor_id",999);default->mutate(p,"/payload/predicates/clearance_basis/source_refs",List.of());};
        assertThat(at(analyze(r,context(p)),"/report/physical_outcome/status")).isEqualTo("UNKNOWN");}
    @ParameterizedTest @ValueSource(strings={"OUT_OF_DOMAIN","UNKNOWN","IN_DOMAIN"})
    void speedDomainChecksAllSamplesWithoutSubstitutingInitialSpeed(String expected){Run r=run("INEFFECTIVE_BRAKING");
        if(!expected.equals("IN_DOMAIN"))r=changeRun(r,"/outcome/frames/100/ego_v",expected.equals("UNKNOWN")?null:25.);
        var p=calibration(r,"conditional_braking_model",.9);p=mutate(p,"/payload/constraints",List.of(obj("path","result:/outcome/frames/*/ego_v","operator","CLOSED_RANGE","value",obj("min",0.,"max",20.),"unit","m/s")));
        var report=analyze(r,context(p));assertThat(at(report,"/report/calibration_applicability/0/status")).isEqualTo(expected);
        assertThat(at(report,"/report/feasibility_results/0/calibration_applicability")).isEqualTo(expected);assertThat(at(report,"/report/physical_feasibility/status")).isEqualTo("UNKNOWN");}
    @Test void missingResidualIsNotFabricatedEvenInDomain(){Run r=run("INEFFECTIVE_BRAKING");var p=mutate(calibration(r,"pedal_to_deceleration",.9),"/payload/predicates/measured_residual/source_refs",List.of());
        var report=analyze(r,context(p));assertThat(at(report,"/report/calibration_applicability/0/status")).isEqualTo("IN_DOMAIN");assertThat(at(report,"/report/calibration_applicability/0/measured_residual/status")).isEqualTo("UNKNOWN");}
    @Test void suppliedVerifiedBaselineUsesExistingBindingChecksOnly() throws Exception {Run r=run("INEFFECTIVE_BRAKING");var original=M1CFixture.create().input().members().getFirst().baselineBinding();
        var binding=M1CFixture.change(original,"/run/result_sha256",r.artifact("result").sha256());var empty=AnalysisContext.empty();
        var c=new AnalysisContext(empty.schemaVersion(),empty.packages(),empty.sources(),empty.authorities(),AS_OF,binding);
        var report=analyze(r,c);assertThat(at(report,"/input/baseline_binding/identity_status")).isEqualTo("PROJECT_BASELINE_CONFIRMED");
        assertThat(at(report,"/input/baseline_binding/baseline_score/status")).isEqualTo("UNKNOWN");}
    @Test void offCannotAcquireFunctionalOrCausalClaims(){Run r=changeRun(run("INEFFECTIVE_BRAKING"),"/outcome/case/aeb_mode","OFF");var report=analyze(r,context(requirement(r,"INEFFECTIVE_BRAKING")));
        assertThat((List<?>)at(report,"/report/functional_candidates")).isEmpty();assertThat((List<?>)at(report,"/report/root_cause_hypotheses")).isEmpty();assertThat(at(report,"/report/functional_assessment/status")).isEqualTo("NOT_APPLICABLE");}
    @Test void reviewedTrueGateCannotOverrideConflictingRawRecorderClocks(){Run r=run("INEFFECTIVE_BRAKING");
        var gt=HandoffSnapshots.list(MiniJson.parse(MiniJson.write(r.artifact("ground_truth").data())));M1CFixture.mapMutable(gt.getFirst()).put("sim_time_s",.005);
        var artifacts=new LinkedHashMap<>(r.artifacts());replace(artifacts,"ground_truth",gt);r=new Run(r.runKey(),r.caseKey(),r.directory(),artifacts,List.of());
        suspected(analyze(r,context(requirement(r,"INEFFECTIVE_BRAKING"))));}
    @Test void coreOnlyCollisionDisagreementCannotGrantAbsenceDependentSupport(){Run r=changeRun(run("FALSE_BRAKING"),"/outcome/metrics/collision",true);
        var req=mutate(requirement(r,"FALSE_BRAKING"),"/payload/dependencies",List.of("VERIFIED_NO_CONTACT"));var report=analyze(r,context(req,coverage(r,2.,3.,1.)));
        assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");assertThat(at(report,"/report/analysis_context/verified_no_contact")).isEqualTo(false);suspected(report);}
    @Test void unknownContextSchemaCannotGrantEvenAnOtherwiseValidBaseline() throws Exception {Run r=run("INEFFECTIVE_BRAKING");var original=M1CFixture.create().input().members().getFirst().baselineBinding();
        var binding=M1CFixture.change(original,"/run/result_sha256",r.artifact("result").sha256());
        assertThat(at(analyze(r,new AnalysisContext("UNKNOWN/99",List.of(),List.of(),List.of(),AS_OF,binding)),"/input/baseline_binding/identity_status")).isEqualTo("UNKNOWN");}
    @Test void exportsAreExplicitSyntheticPublicReports() throws Exception {
        String dest=System.getProperty("batch03.evidence");Run r=run("INEFFECTIVE_BRAKING");var req=requirement(r,"INEFFECTIVE_BRAKING");var cal=calibration(r,"pedal_to_deceleration",.9);
        var report=analyze(r,context(req,cal));assertThat(at(report,"/report/functional_candidates/0/status")).isEqualTo("SUPPORTED");
        if(dest==null)return;java.nio.file.Path dir=java.nio.file.Path.of(dest);java.nio.file.Files.createDirectories(dir);
        Map<String,Map<String,Object>> examples=new LinkedHashMap<>();examples.put("SYNTHETIC-supported-requirement-and-calibration",report);
        Run safe=run("FALSE_BRAKING");examples.put("SYNTHETIC-safe",analyze(safe,context(coverage(safe,2.,3.,1.))));examples.put("SYNTHETIC-near-miss",analyze(safe,context(coverage(safe,.2,.4,1.))));
        examples.put("SYNTHETIC-absence-without-policy",analyze(safe,context(coverage(safe,2.,3.,null))));examples.put("SYNTHETIC-out-of-domain",analyze(r,context(calibration(r,"stopping_extrapolation",.75))));
        examples.put("SYNTHETIC-unapproved-requirement",analyze(r,AnalysisContext.empty()));
        for(var e:examples.entrySet())java.nio.file.Files.writeString(dir.resolve(e.getKey()+".json"),MiniJson.write(e.getValue()),java.nio.file.StandardOpenOption.CREATE_NEW);
        var c=context(req,cal);java.nio.file.Files.writeString(dir.resolve("SYNTHETIC-context-input.json"),MiniJson.write(obj("evidence_scope","SYNTHETIC_TEST_ONLY",
                "schema_version",c.schemaVersion(),"as_of",c.asOf().toString(),"packages",c.packages().stream().map(Artifact::data).toList(),"sources",c.sources().stream().map(Artifact::data).toList(),
                "trust_anchors",c.authorities().stream().map(a->obj("authority_id",a.authorityId(),"reviewer_id",a.reviewerId(),"review_sha256",a.reviewSha256(),"review_data_sha256",a.reviewDataSha256())).toList())),java.nio.file.StandardOpenOption.CREATE_NEW);
    }
}
