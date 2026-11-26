package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

class MoboHandoffBuilderTest {
    @TempDir Path temp;
    private M1CFixture.Cohort fixture;
    @BeforeEach void fixture() throws Exception{fixture=M1CFixture.create();}
    @Test void positiveSyntheticBindingHasCanonicalScoresAndNeverBecomesATrial() throws Exception {
        var report=M1CFixture.build(fixture);
        assertThat(at(report,"/baseline/identity_status")).isEqualTo("PROJECT_BASELINE_CONFIRMED");assertThat(at(report,"/baseline/confirmed_as_v1/value")).isEqualTo(true);
        assertThat(at(report,"/baseline_objectives/optimization/value/rms_jerk_mps3/value")).isEqualTo(3.);
        assertThat(at(report,"/baseline_objectives/optimization/value/impact_speed_mps/value")).isEqualTo(2.);
        assertThat(at(report,"/baseline_objectives/optimization/value/stopping_distance_m/value")).isEqualTo(15.);
        assertThat(at(report,"/baseline_objectives/validation/value/rms_jerk_mps3/status")).isEqualTo("NOT_APPLICABLE");
        assertThat(at(report,"/eligibility_manifest/overall")).isEqualTo("READY_FOR_REVIEW");assertThat(at(report,"/eligibility_manifest/consumer_dispatch_allowed")).isEqualTo(false);
        assertThat(at(report,"/consumer_compatibility/overall")).isEqualTo("NOT_DIRECTLY_CONSUMABLE");
        assertThat(report).doesNotContainKeys("trial","trial_number","proposed_params","expected_improvement");
        Files.createDirectories(Path.of("target/m1c-test-samples"));Files.writeString(Path.of("target/m1c-test-samples/SYNTHETIC_ONLY-handoff.json"),MiniJson.write(report));
    }
    @Test void hf04DuplicateVariantSeedBlocksWholeCohort() throws Exception {var r=M1CFixture.build(M1CFixture.create(new int[]{201,201,203,204},new long[]{1,1,1,2},-1,false));
        assertThat(list(at(r,"/eligibility_manifest/reason_codes"))).contains("DUPLICATE_VARIANT_SEED");assertThat(at(r,"/baseline_objectives/optimization/status")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/dataset/selection_status")).isEqualTo("INVALID");assertThat(list(at(r,"/eligibility_manifest/optimization_eligible"))).isEmpty();}
    @Test void hf04VariantLeakageEvenWithDifferentSeed() throws Exception {var r=M1CFixture.build(M1CFixture.create(new int[]{201,202,203,201},new long[]{1,1,1,2},-1,false));
        assertThat(list(at(r,"/eligibility_manifest/reason_codes"))).contains("VARIANT_PARTITION_LEAKAGE");assertThat(list(at(r,"/parameter_hints"))).isEmpty();}
    @Test void hf05OffCannotBeAnOptimizationMember() throws Exception {var r=M1CFixture.build(M1CFixture.create(new int[]{201,202,203,204},new long[]{1,1,1,2},0,false));
        assertThat(at(r,"/members/0/partition")).isEqualTo("DIAGNOSTIC_ONLY");assertThat(at(r,"/members/0/eligibility/optimization")).isEqualTo("EXCLUDED");
        assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("OFF_CONTROL_ONLY");assertThat(list(at(r,"/dataset/optimization_run_ids"))).doesNotContain("100");}
    @Test void hf06MixedParametersCannotShareBaseline() throws Exception {var r=M1CFixture.build(M1CFixture.create(new int[]{201,202,203,204},new long[]{1,1,1,2},-1,true));
        assertThat(list(at(r,"/eligibility_manifest/reason_codes"))).contains("MIXED_BASELINE_PARAMETERS");assertThat(at(r,"/baseline/identity_status")).isEqualTo("UNKNOWN");}
    @Test void unapprovedPolicyBlocksOperationalScoresButPreservesCanonicalReplay(){var p=M1CFixture.change(fixture.input().qualityPolicy(),"/status","DRAFT");
        var r=new MoboHandoffBuilder().build(M1CFixture.withPolicy(fixture,p));assertThat(at(r,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/canonical_aggregation/optimization/value/rms_jerk_mps3/value")).isEqualTo(3.);assertThat(at(r,"/eligibility_manifest/overall")).isEqualTo("BLOCKED");}
    @Test void missingApplicableJerkRemainsInRequestedDenominator() throws Exception{
        var r=M1CFixture.build(M1CFixture.create(new int[]{201,202,203,204},new long[]{1,1,1,2},-1,false,true));
        assertThat(at(r,"/canonical_aggregation/optimization/value/rms_jerk_mps3/status")).isEqualTo("INCOMPLETE");
        assertThat(at(r,"/canonical_aggregation/optimization/value/rms_jerk_mps3/missing")).isEqualTo(1);
        assertThat(at(r,"/canonical_aggregation/optimization/value/rms_jerk_mps3/samples")).isEqualTo(1);
        assertThat(at(r,"/canonical_aggregation/optimization/value/rms_jerk_mps3/notApplicable")).isEqualTo(1);
        assertThat(at(r,"/baseline_objectives/optimization/value")).isNull();assertThat(at(r,"/members/0/canonical_sample/jerk")).isNull();
    }
    @Test void approvedPolicyCannotSubstituteMissingCalibrationDomain(){String key=fixture.input().members().getFirst().run().runKey();
        var p=M1CFixture.change(fixture.input().qualityPolicy(),"/members/"+key+"/objectives/stopping_distance_m/calibration_applicability","UNKNOWN");
        var r=new MoboHandoffBuilder().build(M1CFixture.withPolicy(fixture,p));assertThat(at(r,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/members/0/eligibility/objective_status/stopping_distance_m")).isEqualTo("UNKNOWN");}
    @Test void explicitObjectiveExclusionRemainsInExclusionManifest(){String key=fixture.input().members().getFirst().run().runKey();
        var p=M1CFixture.change(fixture.input().qualityPolicy(),"/members/"+key+"/objectives/impact_speed_mps/status","EXCLUDED");
        var r=new MoboHandoffBuilder().build(M1CFixture.withPolicy(fixture,p));assertThat(at(r,"/eligibility_manifest/counts/excluded")).isEqualTo(1);
        assertThat(list(at(r,"/dataset/optimization_run_ids"))).hasSize(3);assertThat(at(r,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");}
    @Test void hf05DesignSafeDoesNotPassReviewedNonhazardGate(){String key=fixture.input().members().get(2).run().runKey();
        var p=M1CFixture.change(fixture.input().qualityPolicy(),"/members/"+key+"/nonhazard_review/status","DESIGN_INTENT");
        var r=new MoboHandoffBuilder().build(M1CFixture.withPolicy(fixture,p));assertThat(list(at(r,"/eligibility_manifest/reason_codes"))).contains("OPTIMIZATION_REVIEWED_NONHAZARD_CONTROL_MISSING");
        assertThat(at(r,"/members/2/diagnostic_report_ref/value")).isEqualTo(fixture.reports().get(2).get("content_digest"));}
    @Test void unknownRoleCannotBeOperational(){var i=fixture.input();var selection=M1CFixture.change(i.selection(),"/members/0/role_basis","UNKNOWN");
        // Changing the selection also invalidates the old sample/policy hashes; both protections must hold.
        var r=new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(i.members(),selection,i.qualityPolicy(),i.domains(),i.mechanismSource(),i.sourceArtifacts()));
        assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("CASE_ROLE_REVIEW_UNKNOWN");assertThat(at(r,"/members/0/eligibility/optimization")).isEqualTo("UNKNOWN");}
    @Test void hf12MissingProfileHashBlocksUseWithoutErasingStoredSample(){var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();
        Artifact sample=M1CFixture.change(first.canonicalSample(),"/provenance/worker_sha256",null);members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,first.diagnosticReport(),first.baselineBinding(),sample,first.mechanismReview()));
        var r=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(at(r,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/members/0/canonical_sample/jerk")).isEqualTo(2.);assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("METRIC_PROFILE_OR_PROVENANCE_UNKNOWN_CONFLICTING");}
    @Test void offlineSnapshotCannotSelfDeclareTheDatabaseProfileToSkipItsSourceGates(){
        var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();
        Artifact sample=M1CFixture.change(first.canonicalSample(),"/provenance/provenance_scope","PERSISTED_CANONICAL_RESULT");
        sample=M1CFixture.change(sample,"/provenance/worker_sha256",null);
        sample=M1CFixture.change(sample,"/provenance/scenario_runner_sha256",null);
        members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,first.diagnosticReport(),first.baselineBinding(),sample,null));
        var handoff=new MoboHandoffBuilder().build(replaceMembers(members));
        assertThat(at(handoff,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        assertThat(list(at(handoff,"/members/0/eligibility/reason_codes"))).contains("METRIC_PROFILE_OR_PROVENANCE_UNKNOWN_CONFLICTING");
        assertThat(at(handoff,"/eligibility_manifest/consumer_dispatch_allowed")).isEqualTo(false);
    }
    @Test void hf12ProfileConflictBlocksEvenIfPolicyApproves(){var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();
        Artifact sample=M1CFixture.change(first.canonicalSample(),"/provenance/objectives/rms_jerk_mps3/window","FROM_PEDAL");members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,first.diagnosticReport(),first.baselineBinding(),sample,null));
        var r=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("METRIC_PROFILE_OR_PROVENANCE_UNKNOWN_CONFLICTING");}
    @Test void sampleIdentityDisagreementDoesNotDropBadMember(){var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();
        Artifact sample=M1CFixture.change(first.canonicalSample(),"/run_id","999");members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,first.diagnosticReport(),first.baselineBinding(),sample,null));
        var r=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(list(r.get("members"))).hasSize(4);assertThat(at(r,"/canonical_aggregation/optimization/status")).isEqualTo("UNKNOWN");
        assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("DATABASE_SAMPLE_IDENTITY_MISMATCH");}
    @Test void emptyTraceClaimCannotBeInventedAsCompletedCanonicalSample(){var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();
        Artifact sample=M1CFixture.change(first.canonicalSample(),"/trace_available",false);members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,first.diagnosticReport(),first.baselineBinding(),sample,null));
        var r=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(at(r,"/members/0/canonical_sample")).isNull();
        assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("CANONICAL_SAMPLE_OR_TRACE_MISMATCH");}
    @Test void reportTamperFailsDigestAndDoesNotChangeInput(){var members=new ArrayList<>(fixture.input().members());var first=members.getFirst();Map<String,Object> bad=M1CFixture.mutable(first.diagnosticReport());
        M1CFixture.set(bad,"/report/objectives/rms_jerk_mps3/canonical_value/value",99.);members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),null,bad,first.baselineBinding(),first.canonicalSample(),null));
        var r=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(list(at(r,"/members/0/eligibility/reason_codes"))).contains("REPORT_DIGEST_SCHEMA_OR_IDENTITY_INVALID");
        assertThat(at(first.diagnosticReport(),"/report/objectives/rms_jerk_mps3/canonical_value/value")).isEqualTo(2.);}
    @Test void stableDigestIgnoresEnvelopeTimeAndMapOrderButPreservesPartitions(){var a=M1CFixture.build(fixture);var b=M1CFixture.build(fixture);
        assertThat(a.get("handoff_id")).isNotEqualTo(b.get("handoff_id"));assertThat(a.get("content_digest")).isEqualTo(b.get("content_digest"));
        var reordered=new TreeMap<>(a);assertThat(HandoffSnapshots.digest(reordered)).isEqualTo(a.get("content_digest"));
        var changed=M1CFixture.mutable(a);M1CFixture.set(changed,"/members/0/partition","VALIDATION");assertThat(HandoffSnapshots.digest(changed)).isNotEqualTo(a.get("content_digest"));}
    @Test void hf11ValidationObjectivesNeverAffectHintsOrRanges(){var members=new ArrayList<>(fixture.input().members());var last=members.getLast();var bad=M1CFixture.mutable(last.diagnosticReport());
        M1CFixture.set(bad,"/report/objectives/rms_jerk_mps3/canonical_value/value",12345.);bad.put("content_digest",EvidenceReport.contentDigest(bad));
        members.set(3,new MoboHandoffBuilder.MemberInput(last.run(),null,bad,last.baselineBinding(),last.canonicalSample(),last.mechanismReview()));
        var a=M1CFixture.build(fixture);var b=new MoboHandoffBuilder().build(replaceMembers(members));assertThat(b.get("parameter_hints")).isEqualTo(a.get("parameter_hints"));assertThat(b.get("search_ranges")).isEqualTo(a.get("search_ranges"));}
    @Test void eligibilityCountsReconcileEveryRequestedMember(){var r=M1CFixture.build(fixture);Object counts=at(r,"/eligibility_manifest/counts");
        int sum=List.of("optimization_eligible","validation_eligible","excluded","unknown").stream().mapToInt(k->((Number)at(counts,"/"+k)).intValue()).sum();assertThat(sum).isEqualTo(4);}
    @Test void hashPinnedInputIsUnverifiedWithoutIndependentReference() throws Exception{Path path=temp.resolve("snapshot.json");Files.writeString(path,"{\"schema\":\"example\"}");
        assertThat(HandoffSnapshots.read(path,"example",null).integrity()).isEqualTo(Integrity.UNVERIFIED);
        assertThat(HandoffSnapshots.read(path,"example","0".repeat(64)).integrity()).isEqualTo(Integrity.FAILED);
        assertThat(HandoffSnapshots.read(path,"example",sha256(Files.readAllBytes(path))).integrity()).isEqualTo(Integrity.VERIFIED);}
    private MoboHandoffBuilder.Input replaceMembers(List<MoboHandoffBuilder.MemberInput> members){var i=fixture.input();return new MoboHandoffBuilder.Input(members,i.selection(),i.qualityPolicy(),i.domains(),i.mechanismSource(),i.sourceArtifacts());}
}
