package com.vsos.core.failureanalysis;

import java.util.*;

/** P05 interval-enclosure screen for straight brake-only actions and constant-velocity target bounds.
 * Bounds are deterministic sets, not probabilities. No inference of an exhaustive physical action set. */
public final class AvoidabilityAnalyzer {
    public record Range(double low,double high) {
        public Range { if(!Double.isFinite(low)||!Double.isFinite(high)||low>high)throw new IllegalArgumentException("Invalid uncertainty interval"); }
    }
    public record Target(Range x,Range y,Range vx,Range vy) {}
    public record Action(String id,StoppingModel.Parameters braking) {}
    public record Scope(String clockId,String frameId,String geometryId,String actionSetId,
                        List<String> validationRefs,List<String> uncertaintyRefs,boolean completeFiniteActionSet) {
        public Scope { validationRefs=List.copyOf(validationRefs); uncertaintyRefs=List.copyOf(uncertaintyRefs); }
    }
    public record ActionResult(String actionId,String proof,int enclosures) {}
    public record Result(String avoidability,List<ActionResult> actions,String certificate,List<String> missing) {}

    public static Result screen(double initialFront,double speed,double length,double width,double radius,Target target,
                                double horizon,List<Action> actions,Scope scope,double minimumTimeCell,int maximumDepth) {
        if(scope==null||scope.clockId==null||scope.frameId==null||scope.geometryId==null||scope.actionSetId==null||target==null||actions==null||actions.isEmpty()
                ||!Double.isFinite(horizon)||horizon<=0||!Double.isFinite(initialFront)||!Double.isFinite(speed)||speed<0
                ||!Double.isFinite(length)||length<=0||!Double.isFinite(width)||width<=0||!Double.isFinite(radius)||radius<0
                ||!Double.isFinite(minimumTimeCell)||minimumTimeCell<=0||maximumDepth<0||maximumDepth>30)
            return new Result("UNKNOWN",List.of(),null,List.of("P05_SCOPE_GEOMETRY_OR_ACTIONS_MISSING"));
        List<ActionResult> results=new ArrayList<>();
        for(Action action:actions) {
            Counter counter=new Counter();
            String proof=cell(0,horizon,0,maximumDepth,minimumTimeCell,initialFront,speed,length,width,radius,target,action.braking,counter);
            results.add(new ActionResult(action.id,proof,counter.n));
        }
        // This is a floating-point enclosure SCREEN. No verified numerical-error bound or
        // exhaustive continuous-action proof checker is supplied in M1B. Domain metadata
        // alone cannot turn this algorithm into a certified avoidability solver.
        String conclusion="UNKNOWN",certificate=null;
        List<String> missing=new ArrayList<>();
        if(scope.validationRefs.isEmpty())missing.add("MODEL_RESPONSE_UNVALIDATED");
        if(scope.uncertaintyRefs.isEmpty())missing.add("UNCERTAINTY_SET_UNVALIDATED");
        if(!scope.completeFiniteActionSet)missing.add("ACTION_SET_NOT_EXHAUSTIVE");
        missing.add("NUMERICAL_ENCLOSURE_ERROR_UNCERTIFIED");
        missing.add("NO_CERTIFIED_AVOIDABILITY_CONCLUSION");
        return new Result(conclusion,List.copyOf(results),certificate,List.copyOf(missing));
    }
    private static final class Counter { int n; }
    private static String cell(double t0,double t1,int depth,int maxDepth,double dt,double front,double speed,double length,double width,double radius,
                               Target target,StoppingModel.Parameters p,Counter count) {
        count.n++;
        if(count.n>200000)return "UNRESOLVED";
        double e0=front+StoppingModel.at(speed,p,t0).distanceM()-length/2,e1=front+StoppingModel.at(speed,p,t1).distanceM()-length/2;
        Range tx=position(target.x,target.vx,t0,t1),ty=position(target.y,target.vy,t0,t1);
        Range qx=new Range(tx.low-e1,tx.high-e0);
        double minX=outsideMinimum(qx,length/2),minY=outsideMinimum(ty,width/2);
        if(Math.hypot(minX,minY)>radius)return "SCREEN_NO_CONFLICT_FOR_DECLARED_BOUNDS";
        double maxX=Math.max(Math.abs(qx.low),Math.abs(qx.high))-length/2;
        double maxY=Math.max(Math.abs(ty.low),Math.abs(ty.high))-width/2;
        if(Math.hypot(Math.max(0,maxX),Math.max(0,maxY))<=radius)return "SCREEN_CONTACT_FOR_DECLARED_BOUNDS";
        if(depth>=maxDepth||t1-t0<=dt)return "UNRESOLVED";
        double mid=(t0+t1)/2;
        String a=cell(t0,mid,depth+1,maxDepth,dt,front,speed,length,width,radius,target,p,count);
        if(a.equals("SCREEN_CONTACT_FOR_DECLARED_BOUNDS"))return a;
        String b=cell(mid,t1,depth+1,maxDepth,dt,front,speed,length,width,radius,target,p,count);
        if(b.equals("SCREEN_CONTACT_FOR_DECLARED_BOUNDS"))return b;
        return a.equals("SCREEN_NO_CONFLICT_FOR_DECLARED_BOUNDS")&&b.equals(a)?a:"UNRESOLVED";
    }
    private static Range position(Range origin,Range velocity,double t0,double t1) {
        double lo=Math.min(velocity.low*t0,velocity.low*t1),hi=Math.max(velocity.high*t0,velocity.high*t1);
        return new Range(origin.low+lo,origin.high+hi);
    }
    private static double outsideMinimum(Range range,double half) {
        if(range.low<=half&&range.high>=-half)return 0;
        return range.low>half?range.low-half:-half-range.high;
    }
}
