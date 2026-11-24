package com.vsos.core.failureanalysis;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.controller.optimization.OptimizationController;
import com.vsos.backend.service.optimization.OptimizationService;
import com.vsos.core.mobo.*;
import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

class M1DConsumerCharacterizationTest {
    private static ConsumerSourceInspection.Profile source;private static Artifact probe;
    @BeforeAll static void actual()throws Exception{source=ConsumerSourceInspection.read(Path.of("."));probe=M1DConsumerProbe.execute(source);}
    @TestFactory Stream<DynamicTest> oa10ActualHelperCasesHaveCanonicalReferences(){return list(at(probe.data(),"/cases")).stream().map(x->DynamicTest.dynamicTest(str(at(x,"/id")),()->{
        assertThat(at(x,"/consumer_exception")).isNull();assertThat(at(x,"/consumer_objectives")).isInstanceOf(Map.class);
        var samples=list(at(x,"/samples")).stream().map(CanonicalAggregation::readSample).toList();
        assertThat(CanonicalAggregation.aggregate(samples)).isEqualTo(at(x,"/canonical"));
    }));}
    @Test void hf09ActualRequestHasNoFrozenDatasetPartitionInput()throws Exception{Set<String> actual=new LinkedHashSet<>();
        for(var component:OptimizationController.OptimizationRequest.class.getRecordComponents()){
            JsonProperty property=OptimizationController.OptimizationRequest.class.getDeclaredField(component.getName()).getAnnotation(JsonProperty.class);
            actual.add(property==null?component.getName():property.value());
        }
        assertThat(actual).containsExactlyInAnyOrderElementsOf(source.requestFields());assertThat(actual).doesNotContain("dataset_id","optimization_run_ids","validation_run_ids","parameter_hints");}
    @Test void baselineStatsRecordHasOnlyRates(){assertThat(Arrays.stream(OptimizationService.BaselineStats.class.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName))
            .containsExactly("collisionRatePct","falseActivationRatePct");}
    @Test void typedEngineTrialDoesNotCarryDatasetIdentity(){assertThat(Arrays.stream(MoboTrial.class.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName))
            .containsExactly("number","params","rmsJerk","impactSpeed","stoppingDistance","constraintViolated");}
    @Test void existingTrialValidDoesNotGuardNan(){var trial=new MoboTrial(1,Map.of(),Double.NaN,1.,1.,false);assertThat(trial.valid()).isTrue();}
    @Test void existingBoundsValidDoesNotGuardNan(){Map<String,Double> values=new TreeMap<>();for(String code:ParameterBounds.PARAM_KEYS)values.put(code,ParameterBounds.defaults().lower(code));
        values.put("TTC_THRESHOLD",Double.NaN);assertThat(ParameterBounds.defaults().isValid(values)).isTrue();}
    @Test void hf10SourceBoundMutationCounterexampleIsNotAProposal(){assertThat(source.audited()).isTrue();
        double parent=1.5,approvedUpper=1.55;double sourceBranchResult=Math.min(3.5,Math.round((parent+.1)*100.)/100.);
        assertThat(sourceBranchResult).isGreaterThan(approvedUpper);
        assertThat(source.texts().get("OptimizationService")).contains("Math.min(3.5, Math.round((currentTtc + 0.1) * 100.0) / 100.0)");}
    @Test void allProbeExecutionIsExplicitlySyntheticAndNoDispatch(){assertThat(at(probe.data(),"/evidence_scope")).isEqualTo("SYNTHETIC_TEST_ONLY");
        assertThat(at(probe.data(),"/engine_called")).isEqualTo(false);assertThat(at(probe.data(),"/database_accessed")).isEqualTo(false);assertThat(at(probe.data(),"/campaign_executed")).isEqualTo(false);}
}
