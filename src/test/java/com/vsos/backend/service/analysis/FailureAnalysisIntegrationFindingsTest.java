package com.vsos.backend.service.analysis;

import com.vsos.backend.common.analysis.FailureAnalysisJson;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.*;
import com.vsos.backend.security.ReviewerScope;
import com.vsos.core.failureanalysis.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Reproduces integration findings; characterization PASS does not mean the legacy bug is fixed. */
class FailureAnalysisIntegrationFindingsTest {
    @Test void legacyFreezeStillMislabelsCurrentCarlaImpactProvenance()throws Exception {
        var legacy=new AnalysisServiceTest();legacy.setup();
        legacy.rows=legacy.rows.stream().map(r->{var m=new LinkedHashMap<>(r.asMap());m.put("simulator_version","carla-0.9.16-xosc15");return new Row(m);}).toList();
        when(legacy.db.list(startsWith(AnalysisService.SELECT),any(Object[].class))).thenReturn(legacy.rows);
        var snapshot=legacy.service.freeze(legacy.selection(),7L);
        assertThat(at(snapshot,"/evaluation/impact")).isEqualTo("EGO_SPEED_NOT_RELATIVE");
        var input=new RestJsonAnalysis().parse(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json"),InputResourcePolicy.defaults());
        var provenance=new MetricProvenanceResolver().resolve(input.runs().getFirst());
        assertThat(provenance.fields().get("impact_basis").value()).isEqualTo("RELATIVE_SPEED_CORE_COLLISION_TICK");
        // FOLLOW_UP: AnalysisService is expressly outside the permitted production edits.
    }
    @Test void sharedWorkspaceResolverReturnsArchivedProjectForHistoricalReads() {
        Db db=mock(Db.class);Row archived=new Row(obj("id",99L,"status","ACTIVE","workspace_id",9L,"workspace_status","ARCHIVED"));
        when(db.first(contains("AND p.id = ?"),any(Object[].class))).thenReturn(archived);
        assertThat(new ReviewerScope(db).project(7,99L)).isEqualTo(archived);
        // Membership resolution is not a write-lifecycle gate. New FA routes gate writes separately.
    }
    @Test void olderResultWithoutDatasetIsBlockedAtBoundaryWithoutReconstruction()throws Exception {
        var json=FailureAnalysisJson.object(FailureAnalysisServiceTest.input("result_run2499_full_dataset.json"));json.remove("dataset");
        var input=new RestJsonAnalysis().parse(FailureAnalysisJson.bytes(json),InputResourcePolicy.defaults());
        assertThat(input.runs()).isEmpty();assertThat(input.complete()).isFalse();
        assertThat(input.entries().getFirst().issues()).extracting(Issue::code).contains("DATASET_REQUIRED");
    }
    @Test void oldButInternallyValidCollectionIsNotPresentedAsCurrent()throws Exception {
        var json=FailureAnalysisJson.object(FailureAnalysisServiceTest.input("vsos-collections-2026-11-24/vehicsim-variant-1032-collection.json"));
        @SuppressWarnings("unchecked") var collection=(Map<String,Object>)json.get("collection");collection.put("generated_at_utc","2020-01-01T00:00:00Z");
        byte[] raw=FailureAnalysisJson.bytes(json);var store=new FailureAnalysisMemoryStore();var service=new FailureAnalysisService(store);
        var source=service.ingest(1,7,new java.io.ByteArrayInputStream(raw),raw.length,null);
        assertThat(source).containsEntry("status","COMPLETE").containsEntry("freshness","UNKNOWN_NO_AUTHORITATIVE_COHORT");
        assertThat(at(source,"/input_manifest/declared_collection/generated_at_utc")).isEqualTo("2020-01-01T00:00:00Z");
        var execution=service.analyze(1,source.get("id").toString(),null);
        assertThat(service.metadata(com.vsos.backend.repository.analysis.FailureAnalysisStore.Kind.HANDOFF,1,execution.get("handoff_id").toString()))
                .containsEntry("status","DIAGNOSTIC_ONLY").containsEntry("dispatch_allowed",false);
    }
}
