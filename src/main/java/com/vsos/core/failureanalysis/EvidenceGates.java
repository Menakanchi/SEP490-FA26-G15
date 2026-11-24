package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** Q01/Q02: claim-local sufficiency and typed, source-backed calibration domain membership. */
public final class EvidenceGates {
    public record Capability(String id,String status,List<String> required,List<String> available,List<String> missing) {
        public Map<String,Object> json(){return obj("id",id,"claim_id",id,"status",status,"required",required,"available",available,"missing",missing,"source_refs",List.of(new SourceRef(SPEC,"Q01").json()));}
    }
    public static Capability capability(String id,Map<String,Boolean> requirements,boolean applicable) {
        List<String> available=new ArrayList<>(),missing=new ArrayList<>();
        requirements.forEach((key,known)->{if(Boolean.TRUE.equals(known))available.add(key);else missing.add(key);});
        return new Capability(id,!applicable?"NOT_APPLICABLE":missing.isEmpty()?"SUFFICIENT":available.isEmpty()?"INSUFFICIENT":"PARTIAL",
                List.copyOf(requirements.keySet()),List.copyOf(available),List.copyOf(missing));
    }
    public record Context(Object value,String unit) {}
    public record Constraint(String path,String operator,Object value,String unit) {}
    public record CalibrationDomain(String id,String version,String sha256,List<String> validationRefs,List<Constraint> constraints) {
        public CalibrationDomain { validationRefs=List.copyOf(validationRefs); constraints=List.copyOf(constraints); }
    }
    public record Applicability(String status,List<String> reasons) {}
    public static Applicability calibration(CalibrationDomain domain,Map<String,Context> context,boolean used,boolean metadataConflict) {
        if(!used)return new Applicability("NOT_APPLICABLE",List.of("CALIBRATION_NOT_USED_BY_CLAIM"));
        if(metadataConflict)return new Applicability("UNKNOWN",List.of("CALIBRATION_METADATA_CONFLICT"));
        if(domain==null||domain.id==null||domain.version==null||domain.sha256==null||!domain.sha256.matches("[a-fA-F0-9]{64}")
                ||domain.validationRefs.isEmpty()||domain.constraints.isEmpty())return new Applicability("UNKNOWN",List.of("CALIBRATION_DOMAIN_UNKNOWN"));
        boolean unknown=false;
        for(Constraint c:domain.constraints) {
            Context actual=context.get(c.path);
            if(actual==null||actual.value==null||!Objects.equals(actual.unit,c.unit)){unknown=true;continue;}
            Boolean match=null;
            if("EQ".equals(c.operator))match=typedEqual(actual.value,c.value);
            else if("IN".equals(c.operator)&&c.value instanceof List<?> choices)match=choices.stream().anyMatch(x->typedEqual(actual.value,x));
            else if("CLOSED_RANGE".equals(c.operator)&&c.value instanceof Map<?,?> bounds&&actual.value instanceof Number n
                    &&bounds.get("min") instanceof Number min&&bounds.get("max") instanceof Number max
                    &&Double.isFinite(n.doubleValue())&&Double.isFinite(min.doubleValue())&&Double.isFinite(max.doubleValue())&&min.doubleValue()<=max.doubleValue())
                match=n.doubleValue()>=min.doubleValue()&&n.doubleValue()<=max.doubleValue();
            if(Boolean.FALSE.equals(match))return new Applicability("OUT_OF_DOMAIN",List.of("CALIBRATION_CONSTRAINT_VIOLATED:"+c.path));
            if(match==null)unknown=true;
        }
        return new Applicability(unknown?"UNKNOWN":"IN_DOMAIN",unknown?List.of("CALIBRATION_CONTEXT_OR_CONSTRAINT_MISSING"):List.of());
    }
    private static boolean typedEqual(Object a,Object b) {
        return a instanceof Number&&b instanceof Number?sameNumber(a,b):a!=null&&b!=null&&a.getClass().equals(b.getClass())&&a.equals(b);
    }
    /** Independent interval uncertainty, no statistical interpretation. */
    public static double[] differenceBounds(double aLow,double aHigh,double bLow,double bHigh) {
        if(!Double.isFinite(aLow)||!Double.isFinite(aHigh)||!Double.isFinite(bLow)||!Double.isFinite(bHigh)||aLow>aHigh||bLow>bHigh)
            throw new IllegalArgumentException("Invalid interval bounds");
        return new double[]{aLow-bHigh,aHigh-bLow};
    }
}
