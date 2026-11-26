package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

class ConsumerCompatibilityValidatorTest {
    private static ConsumerSourceInspection.Profile source;private static Artifact probe;
    @TempDir Path temp;
    private M1CFixture.Cohort fixture;private Map<String,Object> handoff;
    @BeforeAll static void consumer()throws Exception{source=ConsumerSourceInspection.read(Path.of("."));probe=M1DConsumerProbe.execute(source);}
    @BeforeEach void fixture()throws Exception{fixture=M1CFixture.create();handoff=M1CFixture.build(fixture);}
    private Map<String,Object> validate(Map<String,Object> h){return validate(h,fixture.input(),fresh(h));}
    private Map<String,Object> validate(Map<String,Object> h,MoboHandoffBuilder.Input refs,Artifact fresh){
        return new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(M1CFixture.artifact("handoff",h),source,probe,fresh,refs));}
    private static Artifact fresh(Map<String,Object> h){Map<String,Object> members=new TreeMap<>();for(Object m:list(h.get("members")))members.put(str(at(m,"/run_key")),
            obj("report_digest",at(m,"/diagnostic_report_ref/value"),"artifact_digest",at(m,"/artifact_digest/value"),"configuration_digest",at(m,"/configuration_digest/value")));
        return M1CFixture.artifact("freshness",obj("schema","vehicsim.consumer-freshness-snapshot/v1","observed_at_utc","2026-11-24T00:00:00Z",
                "evidence_scope","SYNTHETIC_TEST_ONLY","project_id",at(h,"/dataset/project_id/value"),"baseline_version_id",at(h,"/baseline/version_id/value"),
                "selection_sha256",at(h,"/dataset/snapshot_digest/value"),"cohort_digest",at(h,"/dataset/cohort_digest/value"),"members",members));}
    private static List<Object> codes(Map<String,Object> r){return list(r.get("findings")).stream().map(f->at(f,"/code")).toList();}
    private static Map<String,Object> rehash(Map<String,Object> h){h.put("content_digest",HandoffSnapshots.digest(h));return h;}
    @Test void hf09PositiveSchemaAndCanonicalProjectionNeverEnablesDispatch()throws Exception{
        var r=validate(handoff);assertThat(at(r,"/input_validation/schema")).isEqualTo("VERIFIED");assertThat(at(r,"/input_validation/integrity")).isEqualTo("VERIFIED");
        assertThat(at(r,"/input_validation/source_replay")).isEqualTo("MATCHED_M1C_SOURCE_BUNDLE");assertThat(at(r,"/identity_partition_compatibility/status")).isEqualTo("VERIFIED");
        assertThat(at(r,"/canonical_metric_parity/handoff_replay/optimization/replayed_aggregate/value/rms_jerk_mps3/value")).isEqualTo(3.);
        assertThat(at(r,"/validation_isolation/suspected_hints")).isEqualTo(1);assertThat(at(r,"/validation_isolation/confirmed_root_cause_required_for_hint")).isEqualTo(false);
        assertThat(at(r,"/validation_isolation/hint_or_range_generation_mode")).isEqualTo("EXISTING_M1C_REPLAY_FOR_CONFORMANCE_ONLY");
        assertThat(r.get("overall")).isEqualTo(source.audited()?"NOT_DIRECTLY_CONSUMABLE":"BLOCKED");assertThat(r.get("dispatch_allowed")).isEqualTo(false);assertThat(r.get("operational_ready")).isEqualTo(false);
        assertThat(codes(r)).contains("SYNTHETIC_INPUT_NOT_PRODUCTION");
        if(source.audited()) assertThat(codes(r)).contains("DATASET_CONSUMPTION_MISSING","MULTI_SEED_VARIANT_MAP_LOSS","BASELINE_STATS_OBJECTIVES_MISSING","CUSTOM_BOUNDS_IGNORED","SEALED_VALIDATION_NOT_CONSUMED");
        else assertThat(codes(r)).contains("CONSUMER_SOURCE_CHANGED_OR_MISSING");
        assertThat(list(r.get("schema_mapping"))).hasSizeGreaterThan(45);save("SYNTHETIC_POSITIVE-compatibility.json",r);
    }
    @Test void oa10ReportsActualHelperDivergenceAndLimitedScalarParity(){var r=validate(handoff);
        if(!source.audited()) {
            assertThat(at(r,"/canonical_metric_parity/consumer_probe/status")).isEqualTo("UNKNOWN");
            assertThat(r.get("dispatch_allowed")).isEqualTo(false);
            var observed=list(at(probe.data(),"/cases"));assertThat(observed).hasSize(12);
            Object missing=observed.stream().filter(x->"NULL_COLLISION_IMPACT".equals(at(x,"/id"))).findFirst().orElseThrow();
            assertThat(at(missing,"/consumer_objectives")).isNull();
            assertThat(at(missing,"/consumer_exception")).isEqualTo(IllegalStateException.class.getName());
            return;
        }
        List<Object> cases=list(at(r,"/canonical_metric_parity/consumer_probe/cases"));
        assertThat(cases).hasSize(12);assertThat(at(cases.getFirst(),"/comparison")).isEqualTo("SCALAR_MATCH_NOT_GENERAL_CONTRACT_PARITY");
        for(Object x:cases.subList(1,cases.size()))assertThat(at(x,"/comparison")).isEqualTo("DIVERGENT");
        Object missing=cases.stream().filter(x->"NULL_COLLISION_IMPACT".equals(at(x,"/id"))).findFirst().orElseThrow();
        assertThat(at(missing,"/canonical/impact_speed_mps/value")).isNull();assertThat(at(missing,"/consumer_objectives/impact_speed_mps")).isEqualTo(0.);
    }
    @Test void staleContentDigestRejected(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/0/seed/value",999);
        var r=validate(h);assertThat(codes(r)).contains("HANDOFF_CONTENT_DIGEST_MISMATCH","COHORT_DIGEST_MISMATCH");assertThat(r.get("overall")).isEqualTo("BLOCKED");}
    @Test void byteDigestCannotReplaceSemanticDigest(){var h=M1CFixture.mutable(handoff);h.put("content_digest",sha256(MiniJson.write(handoff)));
        assertThat(codes(validate(h))).contains("HANDOFF_CONTENT_DIGEST_MISMATCH");}
    @Test void falseConsumerReadyClaimCannotEnableDispatch(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/consumer_compatibility/overall","READY");
        var r=validate(rehash(h));assertThat(r.get("dispatch_allowed")).isEqualTo(false);assertThat(codes(r)).contains(source.audited()?"DATASET_CONSUMPTION_MISSING":"CONSUMER_SOURCE_CHANGED_OR_MISSING");}
    @Test void canonicalScoreTamperingDetectedAfterRehash(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/canonical_aggregation/optimization/value/rms_jerk_mps3/value",999.);
        assertThat(codes(validate(rehash(h)))).contains("CANONICAL_AGGREGATE_PARITY_FAILED");}
    @Test void missingSampleIsNotDroppedIntoSmallerAggregate(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/0/canonical_sample",null);
        assertThat(codes(validate(rehash(h)))).contains("CLAIMED_AGGREGATE_WITHOUT_BOUND_SAMPLES","CANONICAL_COHORT_REPLAY_UNAVAILABLE");}
    @Test void canonicalVersionCannotBeChanged(){var h=M1CFixture.mutable(handoff);h.put("aggregation_version","rounded-optimizer/1");assertThat(codes(validate(rehash(h)))).contains("CANONICAL_AGGREGATION_VERSION_MISMATCH");}
    @Test void hf04DuplicateVariantSeedRejectedAfterRehash(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/1/variant_id/value",at(h,"/members/0/variant_id/value"));
        assertThat(codes(validate(rehash(h)))).contains("DUPLICATE_VARIANT_SEED");}
    @Test void variantLeakageEvenWhenSeedsDiffer(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/3/variant_id/value",at(h,"/members/0/variant_id/value"));
        assertThat(codes(validate(rehash(h)))).contains("VARIANT_PARTITION_LEAKAGE");}
    @Test void requestedIdsCannotBeSubstitutedByLatestRuns(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/dataset/optimization_run_ids",List.of("999","101","102"));
        assertThat(codes(validate(rehash(h)))).contains("PARTITION_RUN_LIST_MISMATCH");}
    @Test void multipleSeedsForSameOptimizationVariantArePreservedButConsumerMapLosesIdentity()throws Exception{
        var f=M1CFixture.create(new int[]{201,201,203,204},new long[]{1,2,1,2},-1,false);var h=M1CFixture.build(f);var r=validate(h,f.input(),fresh(h));
        assertThat(codes(r)).doesNotContain("DUPLICATE_VARIANT_SEED","VARIANT_PARTITION_LEAKAGE");
        assertThat(at(r,"/identity_partition_compatibility/legacy_variant_map_collisions/0/selected_runs")).isEqualTo(2);
        assertThat(list(at(r,"/identity_partition_compatibility/optimization_bindings"))).hasSize(3);
    }
    @Test void offNeverEntersOperationalProjection(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/0/mode/value","OFF");assertThat(codes(validate(rehash(h)))).contains("OFF_OR_UNKNOWN_MODE_IN_OPERATIONAL_PARTITION");}
    @Test void missingBaselineScoresAreNotInferredFromRates(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/baseline_objectives/availability","UNKNOWN");
        assertThat(codes(validate(rehash(h)))).contains("BASELINE_CANONICAL_OBJECTIVES_UNAVAILABLE");}
    @Test void hf10NarrowedBoundsIgnoredAndEqualityMutationRiskDetected(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/search_ranges/TTC_THRESHOLD/suggested_range/value/upper",1.55);
        var r=validate(rehash(h));assertThat(at(r,"/search_bounds_assessment/TTC_THRESHOLD/domain_relation")).isEqualTo("NARROWER_THAN_DEFAULTS");
        if(source.audited()) {
            assertThat(at(r,"/search_bounds_assessment/TTC_THRESHOLD/parent_equality_mutation_risk")).isEqualTo(true);assertThat(codes(r)).contains("CUSTOM_BOUNDS_IGNORED","PARENT_EQUALITY_MUTATION_ESCAPES_RANGE");
        } else {
            assertThat(at(r,"/search_bounds_assessment/TTC_THRESHOLD/parent_equality_mutation_risk/status")).isEqualTo("UNKNOWN");
            assertThat(codes(r)).contains("CONSUMER_SOURCE_CHANGED_OR_MISSING");
        }}
    @Test void sourceRangeOutsideApprovedDomainRejected(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/search_ranges/MAX_DECELERATION/suggested_range/value/upper",11.);
        assertThat(codes(validate(rehash(h)))).contains("SUGGESTED_RANGE_OUTSIDE_SOURCE");}
    @Test void candidateRangeFixedDimensionRejected(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/search_ranges/TTC_THRESHOLD/suggested_range/value/lower",3.5);
        assertThat(codes(validate(rehash(h)))).contains("SUGGESTED_RANGE_INVALID");}
    @Test void freshnessBaselineChangeDetected(){var freshness=M1CFixture.change(fresh(handoff),"/baseline_version_id","11");var r=validate(handoff,fixture.input(),freshness);
        assertThat(codes(r)).contains("STALE_BASELINE_OR_DATASET");assertThat(r.get("dispatch_allowed")).isEqualTo(false);}
    @Test void freshnessReportChangeDetected(){String key=fixture.input().members().getFirst().run().runKey();var current=M1CFixture.change(fresh(handoff),"/members/"+key+"/report_digest","0".repeat(64));
        assertThat(codes(validate(handoff,fixture.input(),current))).contains("STALE_MEMBER_DIGEST");}
    @Test void noFreshnessExportRemainsUnknown(){assertThat(at(validate(handoff,fixture.input(),null),"/freshness/status")).isEqualTo("UNKNOWN");}
    @Test void schemaWrongTypeReturnsInvalidRatherThanReady(){var h=M1CFixture.mutable(handoff);h.put("members","not-an-array");var r=validate(rehash(h));
        assertThat(codes(r)).contains("HANDOFF_ARRAY_MISSING","HANDOFF_MEMBERS_EMPTY");assertThat(r.get("dispatch_allowed")).isEqualTo(false);}
    @Test void failedInputHashCannotBecomeVerified(){Artifact a=new Artifact("bad","external","bad.json","0".repeat(64),"application/json",Integrity.FAILED,handoff,List.of());
        var r=new ConsumerCompatibilityValidator().validate(a,source);assertThat(codes(r)).contains("HANDOFF_BYTE_INTEGRITY_FAILED");}
    @Test void stableCompatibilityDigestIgnoresIdentityAndTimestamp(){var a=validate(handoff);var b=validate(handoff);assertThat(a.get("compatibility_id")).isNotEqualTo(b.get("compatibility_id"));
        assertThat(a.get("content_digest")).isEqualTo(b.get("content_digest"));assertThat(ConsumerCompatibilityValidator.contentDigest(MiniJson.parseObject(MiniJson.write(a)))).isEqualTo(a.get("content_digest"));}
    @Test void referenceSourceMutationCannotBeRepairedByHandoffRehash(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/0/seed/value",999);
        assertThat(codes(validate(rehash(h)))).contains("REFERENCED_SOURCE_REPLAY_MISMATCH");}
    @Test void validationHintReferenceRejected(){var h=M1CFixture.mutable(handoff);String val=fixture.input().members().getLast().run().runKey();
        M1CFixture.set(h,"/parameter_hints/0/evidence_refs",List.of(new SourceRef("report:"+val,"/report/objectives").json()));
        var r=validate(rehash(h));assertThat(codes(r)).contains("VALIDATION_EVIDENCE_IN_HINT","HINT_NON_OPTIMIZATION_SOURCE");}
    @Test void validationRangeReferenceRejected(){var h=M1CFixture.mutable(handoff);String val=fixture.input().members().getLast().run().runKey();
        M1CFixture.set(h,"/search_ranges/TTC_THRESHOLD/suggested_range/source_refs",List.of(new SourceRef("report:"+val,"/report/objectives").json()));
        assertThat(codes(validate(rehash(h)))).contains("VALIDATION_EVIDENCE_IN_RANGE");}
    @Test void confirmedCauseIsNotAHintStatus(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/parameter_hints/0/status","CONFIRMED_ROOT_CAUSE");
        assertThat(codes(validate(rehash(h)))).contains("HINT_STATUS_NOT_SUPPORTED");}
    @Test void abstentionFromMissingMechanismRemainsValid()throws Exception{
        var i=fixture.input();var members=i.members().stream().map(m->new MoboHandoffBuilder.MemberInput(m.run(),m.evidenceReport(),m.diagnosticReport(),m.baselineBinding(),m.canonicalSample(),null)).toList();
        var refs=new MoboHandoffBuilder.Input(members,i.selection(),i.qualityPolicy(),i.domains(),i.mechanismSource(),i.sourceArtifacts());var h=new MoboHandoffBuilder().build(refs);
        var r=validate(h,refs,fresh(h));assertThat(at(r,"/validation_isolation/abstentions")).isEqualTo(1);assertThat(at(r,"/validation_isolation/handoff_lineage_status")).isEqualTo("VERIFIED");save("SYNTHETIC_NEGATIVE-compatibility.json",r);
    }
    @Test void numericProposalInHintRejected(){var h=M1CFixture.mutable(handoff);M1CFixture.mapMutable(at(h,"/parameter_hints/0")).put("proposed_value",1.7);
        assertThat(codes(validate(rehash(h)))).contains("OPTIMIZATION_PROPOSAL_IN_HINT");}
    @Test void sourceDriftBecomesUnknownWithoutAssumingFixes()throws Exception{
        for(Artifact a:source.artifacts().values()){Path target=temp.resolve(a.uri());Files.createDirectories(target.getParent());Files.copy(Path.of(a.uri()),target);}
        Files.writeString(temp.resolve(source.artifacts().get("OptimizationService").uri()),"\n// local drift\n",StandardOpenOption.APPEND);
        var changed=ConsumerSourceInspection.read(temp);var r=new ConsumerCompatibilityValidator().validate(M1CFixture.artifact("h",handoff),changed);
        assertThat(at(r,"/source_inspection/status")).isEqualTo("UNKNOWN");assertThat(codes(r)).contains("CONSUMER_SOURCE_CHANGED_OR_MISSING");assertThat(r.get("dispatch_allowed")).isEqualTo(false);
    }
    @Test void missingProbeDoesNotPretendActualConsumerExecuted(){var r=new ConsumerCompatibilityValidator().validate(M1CFixture.artifact("h",handoff),source);
        assertThat(at(r,"/canonical_metric_parity/consumer_probe/status")).isEqualTo("UNKNOWN");assertThat(codes(r)).contains("CONSUMER_EXECUTION_PROBE_UNAVAILABLE");}
    @Test void transitiveValidationEvidenceThroughOptimizationReportIsRejected(){
        var h=M1CFixture.mutable(handoff);var i=fixture.input();var first=i.members().getFirst();String val=i.members().getLast().run().runKey();
        var report=M1CFixture.mutable(first.report());M1CFixture.mapMutable(at(report,"/report/objectives"))
                .put("validation_bridge",new SourceRef("report:"+val,"/report/objectives").json());
        var members=new ArrayList<>(i.members());members.set(0,new MoboHandoffBuilder.MemberInput(first.run(),first.evidenceReport(),report,
                first.baselineBinding(),first.canonicalSample(),first.mechanismReview()));
        var refs=new MoboHandoffBuilder.Input(members,i.selection(),i.qualityPolicy(),i.domains(),i.mechanismSource(),i.sourceArtifacts());
        M1CFixture.set(h,"/parameter_hints/0/evidence_refs",List.of(new SourceRef("report:"+first.run().runKey(),"/report/objectives").json()));
        var r=validate(rehash(h),refs,fresh(h));assertThat(codes(r)).contains("VALIDATION_EVIDENCE_IN_HINT");
        assertThat(at(r,"/validation_isolation/validation_evidence_detected_in_handoff")).isEqualTo(true);
    }
    @Test void malformedAggregateCountsAreReportedWithoutThrowing(){var h=M1CFixture.mutable(handoff);
        M1CFixture.set(h,"/canonical_aggregation/optimization/value/rms_jerk_mps3/samples","two");
        assertThat(codes(validate(rehash(h)))).contains("AGGREGATE_OBJECTIVE_SHAPE_INVALID");}
    @Test void registryCannotImpersonateValidatorSource(){var h=M1CFixture.mutable(handoff);
        var registry=new ArrayList<>(list(h.get("source_registry")));registry.add(obj("id","consumer-source:MoboEngine","integrity","UNVERIFIED"));h.put("source_registry",registry);
        assertThat(codes(validate(rehash(h)))).contains("RESERVED_REGISTRY_ID_COLLISION");}
    @Test void wrongMetricVersionProbeRemainsUnknown(){var changed=M1CFixture.change(probe,"/aggregation_version","other/1");
        var r=new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(M1CFixture.artifact("h",handoff),source,changed,fresh(handoff),fixture.input()));
        assertThat(at(r,"/canonical_metric_parity/consumer_probe/status")).isEqualTo("UNKNOWN");assertThat(r.get("dispatch_allowed")).isEqualTo(false);}
    @Test void missingEnvelopeIdentityAndWrongStageAreInvalid(){var h=M1CFixture.mutable(handoff);h.remove("handoff_id");h.put("implementation_stage","M2");h.put("created_at_utc","yesterday");
        assertThat(codes(validate(rehash(h)))).contains("HANDOFF_REQUIRED_STRING_INVALID","HANDOFF_STAGE_OR_REGISTRY_INVALID","HANDOFF_TIMESTAMP_INVALID");}
    @Test void missingEvidenceCannotContainZero(){var h=M1CFixture.mutable(handoff);M1CFixture.set(h,"/members/0/seed/status","UNKNOWN");
        assertThat(codes(validate(rehash(h)))).contains("MISSING_VALUE_COERCED");}
    private static void save(String name,Map<String,Object> r)throws Exception{Files.createDirectories(Path.of("target/m1d-test-samples"));Files.writeString(Path.of("target/m1d-test-samples").resolve(name),MiniJson.write(r));
        Files.writeString(Path.of("target/m1d-consumer-probe.json"),MiniJson.write(probe.data()));}
}
