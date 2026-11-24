package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;

class JsonInputAdapterTest {
    @TempDir Path dir;
    static Map<String,Object> document(long id,long variant,long seed,String mode){
        var metrics=obj("collision",true,"rms_jerk_mps3",2.0,"impact_speed_mps",3.0,"stopping_distance_m",4.0);
        var frames=obj("columns",List.of("frame","sim_time_s","brake"),"rows",List.of(List.of(10,.0,0),List.of(11,.01,.2),List.of(12,.02,.3)),"row_count",3);
        var gt=obj("columns",List.of("frame","sim_time_s","actor_id","role","vx_ms","vy_ms","vz_ms"),"row_count",6,
            "rows",List.of(List.of(10,.0,100,"ego",3.,0.,0.),List.of(10,.0,101,"target",0.,1.,0.),List.of(11,.01,100,"ego",3.,0.,0.),List.of(11,.01,101,"target",0.,1.,0.),List.of(12,.02,100,"ego",3.,0.,0.),List.of(12,.02,101,"target",0.,1.,0.)));
        var result=obj("format","vehicsim.result/v1","seed",seed,"simulator","carla-0.9.16-xosc15","engine","vsos-core-java/1",
            "source",obj("run_id",id,"scenario_id",26L,"scenario_version_id",variant),
            "outcome",obj("params",obj(),"case",obj("aeb_mode",mode),"metrics",metrics,"frames",List.of(obj("t",0.,"ego_x",0.,"ego_v",3.),obj("t",.01,"ego_x",.03,"ego_v",3.))),
            "evaluation",obj("aeb_result",new LinkedHashMap<>(metrics)),
            "dataset",obj("format","vehicsim.run-dataset/v1","identity",obj("run_id",id,"scenario_id",26L,"scenario_version_id",variant,"variant_id",variant,"seed",seed,"simulator","carla-0.9.16-xosc15","aeb_mode",mode,"repetition",1L,"attempt",1L,"carla_vehicle_model_id",5L,"aeb_version_id",33L),
                "config",obj(),"objectives",obj(),"time_series",obj("frames",frames,"ground_truth",gt),"collisions",obj("events",List.of(obj("frame",11,"sim_time_s",.01,"gt_frame_before",10,"other_actor_id",101,"relative_speed_before_ms",3.16,"impulse_ns",0))),"sensors",obj("summary",obj()),"provenance",obj()));
        return HandoffSnapshots.map(MiniJson.parse(MiniJson.write(result)));
    }
    static Map<String,Object> collection(List<Map<String,Object>> docs){
        return obj("format","vehicsim.run-collection/v1","collection",obj("scenario_id",26L),"rules",obj("document_digest_spec","Python json.dumps(value, ensure_ascii=False)"),
            "manifest",new ArrayList<>(docs.stream().map(d->obj("run_id",at(d,"/dataset/identity/run_id"),"document_sha256",sha256(MiniJson.write(d)))).toList()),
            "runs",new ArrayList<>(docs.stream().map(d->obj("run_id",at(d,"/dataset/identity/run_id"),"result",d)).toList()));
    }
    Path write(Object doc)throws Exception {Path p=dir.resolve(UUID.randomUUID()+".json");Files.writeString(p,MiniJson.write(doc));return p;}
    @SuppressWarnings("unchecked") static Map<String,Object> map(Object root,String pointer){return (Map<String,Object>)at(root,pointer);}
    @SuppressWarnings("unchecked") static List<Object> list(Object root,String pointer){return (List<Object>)at(root,pointer);}
    @ParameterizedTest @ValueSource(strings={"{","{\"a\":1,\"a\":2}","[]","{\"format\":\"vehicsim.result/v99\"}"})
    void malformedAndUnsupportedAreRejected(String text)throws Exception {Path p=dir.resolve("bad.json");Files.writeString(p,text);assertThatThrownBy(()->new JsonInputAdapter(p)).isInstanceOf(InputRejectedException.class);}
    @ParameterizedTest @ValueSource(strings={"dataset","format","identity","run_id","seed","repetition","mode","source","wrapper","variant"})
    void invalidIdentityIsExplicitlyBlocked(String mutation)throws Exception {
        var doc=document(1,1032,42,"ON");Object input=doc;
        switch(mutation){
            case "dataset"->doc.remove("dataset");case "format"->map(doc,"/dataset").put("format","vehicsim.run-dataset/v99");
            case "identity"->map(doc,"/dataset").remove("identity");case "run_id"->map(doc,"/dataset/identity").put("run_id",0L);
            case "seed"->map(doc,"/dataset/identity").put("seed",43L);case "repetition"->map(doc,"/dataset/identity").put("repetition",null);
            case "mode"->map(doc,"/dataset/identity").put("aeb_mode","maybe");case "source"->map(doc,"/source").put("run_id",5L);
            case "variant"->map(doc,"/dataset/identity").put("variant_id",1033L);
            case "wrapper"->{var c=collection(List.of(doc));map(c,"/runs/0").put("run_id",5L);input=c;}
        }
        try(var adapter=new JsonInputAdapter(write(input))){assertThat(adapter.complete()).isFalse();assertThat(adapter.runs()).isEmpty();assertThat(adapter.manifest().toString()).contains("BLOCKED");}
    }
    @Test void tablePointersResolveOriginalCellsAndNoExternalHashIsClaimed()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/dataset/provenance").put("files",obj("sensors/frames.csv",obj("sha256","a".repeat(64),"bytes",20)));
        try(var a=new JsonInputAdapter(write(collection(List.of(doc))))){Run r=a.runs().getFirst();assertThat(r.ref("ground_truth","/3/vy_ms").locator()).isEqualTo("/runs/0/result/dataset/time_series/ground_truth/rows/3/5");
            assertThat(r.get("ground_truth","/3/vy_ms")).isEqualTo(1.0);assertThat(r.artifact("frames").integrity()).isEqualTo(Integrity.UNVERIFIED);
            assertThat(at(r.artifact("frames").provenance(),"/declared_source_file/sha256")).isEqualTo("a".repeat(64));
            assertThat(r.artifact("frames").sha256()).isNotEqualTo("a".repeat(64));assertThat(r.artifact("lifecycle").data()).isNull();
            assertThat(new BaselineBindingResolver().verify(r,null).identityStatus()).isEqualTo("UNKNOWN");assertThat(r.artifact("json_container").runKey()).isNull();
            assertThat(a.manifest().get("completeness_scope")).isEqualTo("DELIVERED_MANIFEST_MEMBERS_ONLY_NOT_FROZEN_SCENARIO_COHORT");
        }
    }
    @Test void canonicalCopyDisagreementAndMissingStayLocalNoZeroFallback()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/evaluation/aeb_result").put("impact_speed_mps",8.);map(doc,"/outcome/metrics").remove("rms_jerk_mps3");
        try(var a=new JsonInputAdapter(write(doc))){var read=new CanonicalObjectiveReader().read(a.runs().getFirst());assertThat(read.get("impact_speed_mps").copyAgreement()).isEqualTo("DISAGREEMENT");assertThat(read.get("impact_speed_mps").canonicalValue().value()).isEqualTo(3.);assertThat(read.get("rms_jerk_mps3").canonicalValue().value()).isNull();}
    }
    @Test void invalidCanonicalTypeCannotCreateScore()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/outcome/metrics").put("impact_speed_mps","NaN");
        try(var a=new JsonInputAdapter(write(doc))){assertThat(new CanonicalObjectiveReader().read(a.runs().getFirst()).get("impact_speed_mps").canonicalValue().status()).isEqualTo(Status.INVALID);}
    }
    @Test void multipleVariantsSeedsRepetitionsRemainSeparateAndPairingIsUnique()throws Exception {
        var a=document(1,1032,42,"ON");var b=document(2,1032,43,"OFF");var c=document(3,1033,42,"OFF");var d=document(4,1032,42,"OFF");var e=document(5,1032,42,"ON");map(e,"/dataset/identity").put("repetition",2L);
        try(var input=new JsonInputAdapter(write(collection(List.of(a,b,c,d,e))))){var runs=input.runs();assertThat(runs).hasSize(5);assertThat(FailureAnalysisInput.comparator(runs.get(0),runs).runKey()).isEqualTo("4");assertThat(JsonInputAdapter.declaredIdentity(runs.get(4)).toString()).contains("2");
            assertThat(FailureAnalysisInput.comparator(runs.get(0),List.of(runs.get(0),runs.get(1),runs.get(2)))).isNull();}
    }
    @Test void ambiguousOffPairAbstainsInsteadOfSelectingArbitrarily()throws Exception {
        var docs=List.of(document(1,1032,42,"ON"),document(2,1032,42,"OFF"),document(3,1032,42,"OFF"));
        try(var input=new JsonInputAdapter(write(collection(docs)))){assertThat(FailureAnalysisInput.comparator(input.runs().getFirst(),input.runs())).isNull();}
    }
    @Test void duplicateMemberIsNeverSilentlyCollapsed()throws Exception {
        var doc=document(1,1032,42,"ON");try(var a=new JsonInputAdapter(write(collection(List.of(doc,doc))))){assertThat(a.entries()).hasSize(2);assertThat(a.runs()).isEmpty();assertThat(a.complete()).isFalse();}
    }
    @Test void missingMemberAndPartialSchemaCannotProduceWholeHandoff()throws Exception {
        var c=collection(List.of(document(1,1032,42,"ON"),document(2,1033,43,"ON")));map(c,"/runs/1/result").put("format","unsupported");Path input=write(c),output=dir.resolve("reports"),handoff=dir.resolve("handoff.json");
        OfflineDiagnosticAnalysis.main(new String[]{input.toString(),output.toString()});assertThat(Files.exists(output.resolve("1.json"))).isTrue();assertThat(Files.exists(output.resolve("2.json"))).isFalse();
        assertThatThrownBy(()->OfflineMoboHandoff.main(new String[]{input.toString(),output.toString(),handoff.toString(),Path.of("").toAbsolutePath().toString()})).isInstanceOf(InputRejectedException.class).hasMessageContaining("INCOMPLETE_INPUT_POPULATION");assertThat(handoff).doesNotExist();
        list(c,"/runs").remove(1);try(var a=new JsonInputAdapter(write(c))){assertThat(a.entries()).hasSize(2);assertThat(a.manifest().toString()).contains("MANIFEST_RUN_DOCUMENT_MISSING");}
    }
    @Test void staleDocumentDigestBlocksOnlyItsMember()throws Exception {
        var c=collection(List.of(document(1,1032,42,"ON"),document(2,1033,43,"OFF")));map(c,"/manifest/0").put("document_sha256","0".repeat(64));
        try(var a=new JsonInputAdapter(write(c))){assertThat(a.runs()).hasSize(1);assertThat(a.complete()).isFalse();assertThat(a.manifest().toString()).contains("DOCUMENT_DIGEST_MISMATCH");}
    }
    @Test void embeddedHashMismatchQuarantinesOnlyViewAndContainerPinIsIndependent()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/dataset/provenance").put("embedded_payloads",obj("spec","Python json.dumps(value, ensure_ascii=False)","time_series.frames","0".repeat(64)));Path path=write(doc);
        try(var a=new JsonInputAdapter(path,InputResourcePolicy.defaults(),sha256(Files.readAllBytes(path)))){assertThat(a.runs().getFirst().artifact("result").integrity()).isEqualTo(Integrity.VERIFIED);assertThat(a.runs().getFirst().artifact("frames").integrity()).isEqualTo(Integrity.FAILED);assertThat(a.runs().getFirst().get("frames","")).isNull();}
        assertThatThrownBy(()->new JsonInputAdapter(path,InputResourcePolicy.defaults(),"1".repeat(64))).hasMessageContaining("CONTAINER_HASH_MISMATCH");
    }
    @ParameterizedTest @ValueSource(strings={"actor","clock","event","precontact","coreclock","shape"})
    void badEvidenceCannotCreateFalsePhysicalConclusion(String mutation)throws Exception {
        var doc=document(1,1032,42,"ON");switch(mutation){
            case "actor"->map(doc,"/dataset/collisions/events/0").put("other_actor_id",999L);
            case "clock"->list(doc,"/dataset/time_series/ground_truth/rows/2").set(1,.5);
            case "event"->map(doc,"/dataset/collisions/events/0").put("sim_time_s",20.);
            case "precontact"->map(doc,"/dataset/collisions/events/0").put("gt_frame_before",500L);
            case "coreclock"->map(doc,"/outcome/frames/1").put("t",0.);
            case "shape"->list(doc,"/dataset/time_series/frames/columns").set(2,"frame");}
        try(var a=new JsonInputAdapter(write(collection(List.of(doc))))){var run=a.runs().getFirst();var issues=new EvidenceValidator().validate(run);var contact=new ImpactAnalyzer().extract(run,issues);
            if(List.of("actor","clock","event").contains(mutation))assertThat(contact.admissible()).isFalse();
            if(mutation.equals("precontact"))assertThat(contact.vectorRelative()).isNull();
            if(mutation.equals("coreclock"))assertThat(issues).extracting(Issue::code).contains("TIMESTAMP_DUPLICATE");
            if(mutation.equals("shape"))assertThat(run.artifact("frames").integrity()).isEqualTo(Integrity.FAILED);
            var report=new DiagnosticReport().analyze(run);assertThat(at(report,"/report/confirmed_root_cause/value")).isNull();assertThat(at(report,"/report/physical_limit/value")).isNull();}
    }
    @Test void invalidEventPredicateUsesTranslatedPointerAndCoreClockBlocksDecomposition()throws Exception {
        var doc=document(1,1032,42,"ON");try(var a=new JsonInputAdapter(write(collection(List.of(doc))))){var r=a.runs().getFirst();var issue=new Issue(Status.INVALID,"COLLISION_EVENT_BAD",r.ref("collisions","/0/impulse_ns"),"test");assertThat(EvidenceValidator.collisionEventInvalid(r,List.of(issue),0)).isTrue();assertThat(EvidenceValidator.collisionEventInvalid(r,List.of(issue),1)).isFalse();assertThat(EvidenceValidator.contactTime(r,0).value()).isEqualTo(.01);}
    }
    @Test void nullReasonsArePreservedAndStateConflictIsVisible()throws Exception {
        var doc=document(1,1032,42,"OFF");map(doc,"/outcome/metrics").put("rms_jerk_mps3",null);map(doc,"/evaluation/aeb_result").put("rms_jerk_mps3",null);
        map(doc,"/dataset/objectives").put("rms_jerk_mps3",obj("value",null,"state","NOT_APPLICABLE","reason","AEB_OFF"));map(doc,"/dataset/objectives").put("impact_speed_mps",obj("value",3.,"state","MISSING","reason","BAD_STATE"));
        try(var a=new JsonInputAdapter(write(doc))){var r=a.runs().getFirst();var report=new DiagnosticReport().analyze(r);assertThat(at(report,"/report/objectives/rms_jerk_mps3/declared_metadata/value/reason")).isEqualTo("AEB_OFF");assertThat(at(report,"/report/objectives/rms_jerk_mps3/canonical_value/value")).isNull();assertThat(at(report,"/report/failure_candidates")).isEqualTo(List.of());assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).contains("JSON_OBJECTIVE_STATE_VALUE_CONFLICT");}
    }
    @Test void oversizedPopulationIsRejectedBeforeMemberProcessing()throws Exception {
        var c=collection(List.of(document(1,1032,42,"ON")));var values=list(c,"/runs");for(int i=0;i<256;i++)values.add(values.getFirst());assertThatThrownBy(()->new JsonInputAdapter(write(c))).isInstanceOf(InputRejectedException.class).hasMessageContaining("RUN_COUNT");
    }
    @Test void producerMetadataConflictNeverPromotesCanonicalQuality()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/dataset/objectives").put("metric_version",obj("aggregation","wrong/1","engine","other-producer"));
        map(doc,"/dataset/objectives").put("impact_speed_mps",obj("value",3.,"state","INVALID","reason","PRODUCER_INVALID"));
        try(var a=new JsonInputAdapter(write(doc))){Run r=a.runs().getFirst();assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).contains("METRIC_METADATA_CONFLICT","JSON_OBJECTIVE_PRODUCER_QUALITY_REJECTED");
            var report=new DiagnosticReport().analyze(r);assertThat(at(report,"/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(3.);assertThat(at(report,"/report/objectives/impact_speed_mps/quality/canonical_integrity")).isEqualTo("FAIL");}
    }
    @ParameterizedTest @ValueSource(strings={"aggregation","producer","consistent"})
    void independentContainerPinCannotEraseDeclaredMetadataConflict(String mutation)throws Exception {
        var doc=document(1,1032,42,"ON");
        if(mutation.equals("consistent"))map(doc,"/dataset/objectives").put("impact_speed_mps",obj("value",3.,"consistent",false));
        else if(mutation.equals("aggregation"))map(doc,"/dataset/objectives").put("metric_version",obj("aggregation","wrong/1"));
        else map(doc,"/dataset/provenance").put("engine","wrong-producer");
        Path p=write(doc);try(var a=new JsonInputAdapter(p,InputResourcePolicy.defaults(),sha256(Files.readAllBytes(p)))){var report=new EvidenceReport().analyze(a.runs().getFirst());
            assertThat(at(report,"/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(3.);assertThat(at(report,"/report/objectives/impact_speed_mps/quality/canonical_integrity")).isEqualTo("FAIL");}
    }
    @Test void missingManifestBlocksHandoffEvenWhenDocumentsAreReadable()throws Exception {
        var c=collection(List.of(document(1,1032,42,"ON")));c.remove("manifest");try(var a=new JsonInputAdapter(write(c))){assertThat(a.runs()).hasSize(1);assertThat(a.complete()).isFalse();assertThat(a.manifest().toString()).contains("COLLECTION_MANIFEST_MISSING");}
    }
    @Test void unknownEmbeddedDigestProfileRemainsUnverified()throws Exception {
        var doc=document(1,1032,42,"ON");map(doc,"/dataset/provenance").put("embedded_payloads",obj("spec","unknown-canonicalization","time_series.frames","a".repeat(64)));
        try(var a=new JsonInputAdapter(write(doc))){var view=a.runs().getFirst().artifact("frames");assertThat(view.integrity()).isEqualTo(Integrity.UNVERIFIED);assertThat(at(view.provenance(),"/embedded_digest/status")).isEqualTo("UNKNOWN");assertThat(view.usable()).isTrue();}
    }
    @Test void byteBudgetIsEnforcedByJsonEntryAdapter()throws Exception {
        var p=InputResourcePolicy.defaults();var small=new InputResourcePolicy(p.maxArchiveBytes(),64,p.maxTotalBytes(),p.maxCompressionRatio(),p.maxMembers(),p.maxRuns(),p.maxRecords(),p.maxRunRecords(),p.maxRowChars(),p.maxColumns(),p.maxJsonDepth(),p.maxStringChars(),p.maxTokenChars(),p.maxJsonValues(),p.maxRetainedChargeBytes(),p.maxWork());
        Path path=write(document(1,1032,42,"ON"));assertThatThrownBy(()->new JsonInputAdapter(path,small,null)).isInstanceOf(InputRejectedException.class).hasMessageContaining("RESOURCE_LIMIT_EXCEEDED");
    }
}
