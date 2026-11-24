package com.vsos.core.failureanalysis;

import com.vsos.core.evaluation.AnalysisMetrics;
import org.junit.jupiter.api.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;

class CanonicalAggregationTest {
    @Test void oa08ExactThreeRunExample(){
        var a=CanonicalAggregation.aggregate(M1CFixture.samples());
        assertThat(at(a,"/rms_jerk_mps3/value")).isEqualTo(3.);assertThat(at(a,"/impact_speed_mps/value")).isEqualTo(2.);
        assertThat(at(a,"/stopping_distance_m/value")).isEqualTo(15.);
        assertThat(at(a,"/rms_jerk_mps3/notApplicable")).isEqualTo(1);assertThat(at(a,"/impact_speed_mps/samples")).isEqualTo(3);
    }
    @TestFactory Stream<DynamicTest> oa09ParityOnOrderedMissingNaAndInvalidValues(){
        List<List<AnalysisMetrics.Sample>> fixtures=new ArrayList<>();fixtures.add(List.of());fixtures.add(M1CFixture.samples());
        for(Boolean braked:Arrays.asList(true,false,null))for(Boolean hit:Arrays.asList(true,false,null))
            fixtures.add(List.of(M1CFixture.sample(braked,hit,null,null,null)));
        for(double value:new double[]{-1,Double.NaN,Double.POSITIVE_INFINITY,0,1.23456789})
            fixtures.add(List.of(M1CFixture.sample(true,true,value,value,value)));
        for(String status:List.of("COMPLETED","FAILED","STOPPED","RUNNING","INCOMPLETE"))for(String end:List.of("TIMEOUT","ERROR","TARGET_CLEARED"))
            fixtures.add(List.of(new AnalysisMetrics.Sample(status,end,false,false,false,"PASS",true,2.,null,10.)));
        return java.util.stream.IntStream.range(0,fixtures.size()).mapToObj(i->DynamicTest.dynamicTest("canonical-parity-"+i,()->{
            var source=AnalysisMetrics.aggregate(fixtures.get(i));var actual=CanonicalAggregation.aggregate(fixtures.get(i));
            assertThat(actual.get("invalid_runs")).isEqualTo(source.get("invalid_runs"));assertThat(actual.get("version")).isEqualTo(AnalysisMetrics.VERSION);
            for(String key:CanonicalObjectiveReader.KEYS){var expected=(AnalysisMetrics.Objective)source.get(key);
                assertThat(at(actual,"/"+key+"/value")).isEqualTo(expected.value());assertThat(at(actual,"/"+key+"/status")).isEqualTo(expected.status());
                assertThat(at(actual,"/"+key+"/samples")).isEqualTo(expected.samples());assertThat(at(actual,"/"+key+"/missing")).isEqualTo(expected.missing());
                assertThat(at(actual,"/"+key+"/notApplicable")).isEqualTo(expected.notApplicable());}
        }));
    }
    @Test void notApplicableCompleteDoesNotMeanThreeNumericObjectivesAvailable(){
        var list=List.of(M1CFixture.sample(false,false,null,null,null));
        assertThat(AnalysisMetrics.evidenceComplete(list)).isTrue();assertThat(AnalysisMetrics.objectivesAvailable(list)).isFalse();
        assertThat(at(CanonicalAggregation.aggregate(list),"/rms_jerk_mps3/value")).isNull();
    }
    @Test void noAdditionalOptimizerRounding(){var a=CanonicalAggregation.aggregate(List.of(M1CFixture.sample(true,false,1.,null,1.),M1CFixture.sample(true,false,2.,null,2.),M1CFixture.sample(true,false,2.,null,2.)));
        assertThat(at(a,"/rms_jerk_mps3/value")).isEqualTo(5./3.);}
    @Test void nullIsNotZeroAndAbsentFieldIsNotExplicitNull(){var s=CanonicalAggregation.sampleJson(M1CFixture.sample(true,true,2.,null,10.));
        assertThat(CanonicalAggregation.readSample(s).impact()).isNull();s.remove("impact");assertThatThrownBy(()->CanonicalAggregation.readSample(s)).hasMessageContaining("SAMPLE_FIELD_MISSING:impact");}
    @Test void stringNumberAndTruthyFlagAreRejected(){var s=CanonicalAggregation.sampleJson(M1CFixture.samples().getFirst());s.put("jerk","2.0");
        assertThatThrownBy(()->CanonicalAggregation.readSample(s)).hasMessageContaining("SAMPLE_NUMBER_TYPE");s.put("jerk",2.);s.put("collision",1);
        assertThatThrownBy(()->CanonicalAggregation.readSample(s)).hasMessageContaining("SAMPLE_FIELD_TYPE:collision");}
    @Test void overflowBlocksSerializationWithoutChangingCanonicalAlgorithm(){var samples=List.of(M1CFixture.sample(true,true,Double.MAX_VALUE,1.,1.),M1CFixture.sample(true,true,Double.MAX_VALUE,1.,1.));
        assertThat(((AnalysisMetrics.Objective)AnalysisMetrics.aggregate(samples).get("rms_jerk_mps3")).value()).isInfinite();
        assertThatThrownBy(()->CanonicalAggregation.aggregate(samples)).hasMessageContaining("CANONICAL_AGGREGATE_NONFINITE");}
}
