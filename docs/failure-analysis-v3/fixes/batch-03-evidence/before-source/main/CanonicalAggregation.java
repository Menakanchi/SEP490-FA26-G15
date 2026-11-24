package com.vsos.core.failureanalysis;

import com.vsos.core.evaluation.AnalysisMetrics;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** JSON projection only: denominator, ordered missing/NA rules and mean belong to AnalysisMetrics. */
public final class CanonicalAggregation {
    private CanonicalAggregation() {}
    public static Map<String,Object> aggregate(List<AnalysisMetrics.Sample> samples){
        Map<String,Object> out=new LinkedHashMap<>(AnalysisMetrics.aggregate(List.copyOf(samples)));
        for(String key:CanonicalObjectiveReader.KEYS){
            AnalysisMetrics.Objective o=(AnalysisMetrics.Objective)out.get(key);
            // The canonical algorithm can overflow a sum of finite inputs. Do not serialize Infinity,
            // change its mean, or pretend it is a usable score.
            if(o.value()!=null&&!Double.isFinite(o.value()))throw new IllegalArgumentException("CANONICAL_AGGREGATE_NONFINITE:"+key);
            out.put(key,obj("value",o.value(),"samples",o.samples(),"missing",o.missing(),"notApplicable",o.notApplicable(),"unit",o.unit(),"status",o.status()));
        }
        return out;
    }
    public static Map<String,Object> sampleJson(AnalysisMetrics.Sample s){
        return obj("status",s.status(),"endReason",s.endReason(),"collision",s.collision(),"falsePositive",s.falsePositive(),
                "falseNegative",s.falseNegative(),"verdict",s.verdict(),"braked",s.braked(),"jerk",s.jerk(),"impact",s.impact(),"stopping",s.stopping());
    }
    /** Strict normalized export; explicit null is retained, absent or wrong-typed fields reject the export. */
    public static AnalysisMetrics.Sample readSample(Object x){
        Map<String,Object> m=HandoffSnapshots.map(x);
        for(String k:List.of("status","endReason","collision","falsePositive","falseNegative","verdict","braked","jerk","impact","stopping"))
            if(!m.containsKey(k))throw new IllegalArgumentException("SAMPLE_FIELD_MISSING:"+k);
        for(String k:List.of("status","endReason","verdict"))if(m.get(k)!=null&&!(m.get(k) instanceof String))throw new IllegalArgumentException("SAMPLE_FIELD_TYPE:"+k);
        for(String k:List.of("collision","falsePositive","falseNegative","braked"))if(m.get(k)!=null&&!(m.get(k) instanceof Boolean))throw new IllegalArgumentException("SAMPLE_FIELD_TYPE:"+k);
        return new AnalysisMetrics.Sample((String)m.get("status"),(String)m.get("endReason"),(Boolean)m.get("collision"),(Boolean)m.get("falsePositive"),
                (Boolean)m.get("falseNegative"),(String)m.get("verdict"),(Boolean)m.get("braked"),number(m.get("jerk")),number(m.get("impact")),number(m.get("stopping")));
    }
    private static Double number(Object x){if(x==null)return null;if(!(x instanceof Number n))throw new IllegalArgumentException("SAMPLE_NUMBER_TYPE");return n.doubleValue();}
}
