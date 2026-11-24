package com.vsos.core.failureanalysis;

import java.util.*;

/** P01-P04 SI model. Configured caps are assumptions about available force, never achieved deceleration. */
public final class StoppingModel {
    public record Parameters(double cap, double jerk, double delay) {}
    public record Stop(double distanceM, double seconds, boolean duringBuildup) {}
    public record Motion(double distanceM, double speedMps, double decelerationMps2) {}
    public record Envelope(Double cap, Double knownUpperBound, List<String> missing) {}
    public record Requirement(Double requiredCap, String status) {}
    public record StopState(double time, double distanceToBoundary, double speed) {}
    public record Windows(List<GeometryEngine.Interval> intervals, Double latestDecision, boolean rightCensored, boolean complete) {}

    public static Envelope availableDeceleration(Double configured, Double vehicle, Double adapter, Double friction) {
        Double[] inputs={configured,vehicle,adapter,friction}; String[] names={"CONFIGURED_CAP","VEHICLE_CAP","ADAPTER_CAP","FRICTION"};
        List<String> missing=new ArrayList<>(); double upper=Double.POSITIVE_INFINITY;
        for(int i=0;i<inputs.length;i++) {
            Double n=inputs[i];
            if(n==null||!Double.isFinite(n)||n<0) missing.add(names[i]);
            else upper=Math.min(upper,i==3?n*9.81:n);
        }
        return new Envelope(missing.isEmpty()?upper:null,Double.isFinite(upper)?upper:null,List.copyOf(missing));
    }
    public static Stop stop(double v,Parameters p) {
        validate(v,p);
        if(v==0) return new Stop(0,0,true);
        double ramp=p.cap/p.jerk, threshold=p.cap*p.cap/(2*p.jerk);
        if(v<=threshold) {
            double t=Math.sqrt(2*v/p.jerk); return new Stop(v*p.delay+(2.0/3)*v*t,p.delay+t,true);
        }
        double v1=v-threshold;
        return new Stop(v*p.delay+v*ramp-p.jerk*ramp*ramp*ramp/6+v1*v1/(2*p.cap),p.delay+ramp+v1/p.cap,false);
    }
    /** Exact trajectory for initial deceleration zero. Stops at zero speed, no reversing or restart. */
    public static Motion at(double v,Parameters p,double time) {
        validate(v,p); if(!Double.isFinite(time)||time<0)throw new IllegalArgumentException("Time must be finite and nonnegative");
        Stop stop=stop(v,p);
        if(time>=stop.seconds) return new Motion(stop.distanceM,0,0);
        if(time<=p.delay) return new Motion(v*time,v,0);
        double u=time-p.delay,r=p.cap/p.jerk;
        if(u<=r) return new Motion(v*p.delay+v*u-p.jerk*u*u*u/6,v-p.jerk*u*u/2,p.jerk*u);
        double v1=v-p.cap*p.cap/(2*p.jerk),w=u-r;
        return new Motion(v*p.delay+v*r-p.jerk*r*r*r/6+v1*w-p.cap*w*w/2,v1-p.cap*w,p.cap);
    }
    public static Stop ideal(double v,double cap) {
        if(!Double.isFinite(v)||!Double.isFinite(cap)||v<0||cap<=0)throw new IllegalArgumentException("Invalid ideal stop inputs");
        return new Stop(v*v/(2*cap),v/cap,false);
    }
    public static Double requiredIdeal(double v,double distance,double delay) {
        if(!Double.isFinite(v)||!Double.isFinite(distance)||!Double.isFinite(delay)||v<0||delay<0)return null;
        if(v==0)return 0.0;
        return distance>v*delay?v*v/(2*(distance-v*delay)):null;
    }
    /** Bisection on non-increasing P02 distance in a nonnegative declared cap interval (zero is its limit). */
    public static Requirement requiredEnvelope(double v,double distance,double jerk,double delay,double lowCap,double highCap) {
        if(!Double.isFinite(distance)||!Double.isFinite(lowCap)||!Double.isFinite(highCap)||lowCap<0||highCap<=0||highCap<lowCap)throw new IllegalArgumentException("Invalid inverse domain");
        Parameters lo=new Parameters(lowCap,jerk,delay),hi=new Parameters(highCap,jerk,delay);
        if(v==0){stop(v,hi);return distance>=0?new Requirement(0.0,"ALREADY_STOPPED"):new Requirement(null,"BOUNDARY_ALREADY_PASSED");}
        if(stop(v,hi).distanceM>distance)return new Requirement(null,"NO_FEASIBLE_CAP_IN_DECLARED_DOMAIN");
        if(lowCap>0&&stop(v,lo).distanceM<=distance)return new Requirement(lowCap,"LOWER_DOMAIN_BOUND_SUFFICIENT");
        double a=lowCap,b=highCap;
        for(int i=0;i<100;i++){double mid=(a+b)/2;if(stop(v,new Parameters(mid,jerk,delay)).distanceM<=distance)b=mid;else a=mid;}
        return new Requirement(b,"FEASIBLE_CAP_BOUND");
    }
    public static double margin(double distanceToNearBoundary,double stoppingDistance,double safetyMargin) {
        if(!Double.isFinite(distanceToNearBoundary)||!Double.isFinite(stoppingDistance)||!Double.isFinite(safetyMargin)||stoppingDistance<0||safetyMargin<0)
            throw new IllegalArgumentException("Invalid margin inputs");
        return distanceToNearBoundary-stoppingDistance-safetyMargin;
    }
    /** P04: union of concave margin superlevel sets, piecewise linear speed and boundary gap.
     * Caller must provide a declared unbraked path, not use post-braking states as a counterfactual. */
    public static Windows windows(List<StopState> path,Parameters p,double safetyMargin,double maximumGap,boolean unbrakedPath) {
        if(path==null||path.size()<2||!unbrakedPath||!Double.isFinite(maximumGap)||maximumGap<=0||!Double.isFinite(safetyMargin)||safetyMargin<0)
            return new Windows(List.of(),null,true,false);
        if(!valid(path.getFirst())||!valid(path.getLast()))return new Windows(List.of(),null,true,false);
        List<GeometryEngine.Interval> intervals=new ArrayList<>(); boolean complete=true;
        for(int i=1;i<path.size();i++) {
            StopState a=path.get(i-1),b=path.get(i);
            if(!valid(a)||!valid(b)||b.time<=a.time||b.time-a.time>maximumGap+1e-10){complete=false;continue;}
            double dv=b.speed-a.speed,dg=b.distanceToBoundary-a.distanceToBoundary;
            java.util.function.DoubleUnaryOperator f=x->a.distanceToBoundary+dg*x-stop(a.speed+dv*x,p).distanceM-safetyMargin;
            java.util.function.DoubleUnaryOperator derivative=x->dg-dv*distanceDerivative(a.speed+dv*x,p);
            double peak;
            if(derivative.applyAsDouble(0)<=0)peak=0;
            else if(derivative.applyAsDouble(1)>=0)peak=1;
            else {double lo=0,hi=1;for(int j=0;j<80;j++){double mid=(lo+hi)/2;if(derivative.applyAsDouble(mid)>0)lo=mid;else hi=mid;}peak=(lo+hi)/2;}
            if(f.applyAsDouble(peak)<0)continue;
            double enter=0,exit=1;
            if(f.applyAsDouble(0)<0){double lo=0,hi=peak;for(int j=0;j<80;j++){double mid=(lo+hi)/2;if(f.applyAsDouble(mid)<0)lo=mid;else hi=mid;}enter=hi;}
            if(f.applyAsDouble(1)<0){double lo=peak,hi=1;for(int j=0;j<80;j++){double mid=(lo+hi)/2;if(f.applyAsDouble(mid)>=0)lo=mid;else hi=mid;}exit=lo;}
            intervals.add(new GeometryEngine.Interval(a.time+(b.time-a.time)*enter,a.time+(b.time-a.time)*exit));
        }
        double start=path.getFirst().time,end=path.getLast().time;
        List<GeometryEngine.Interval> union=GeometryEngine.merge(intervals,start,end);
        boolean censored=!complete||!union.isEmpty()&&union.getLast().rightCensored();
        return new Windows(union,!complete||censored||union.isEmpty()?null:union.getLast().end(),censored,complete);
    }
    private static double distanceDerivative(double v,Parameters p) {
        return v<=p.cap*p.cap/(2*p.jerk)?p.delay+Math.sqrt(2*v/p.jerk):p.delay+p.cap/(2*p.jerk)+v/p.cap;
    }
    private static boolean valid(StopState s){return s!=null&&Double.isFinite(s.time)&&Double.isFinite(s.speed)&&Double.isFinite(s.distanceToBoundary)&&s.speed>=0;}
    private static void validate(double v,Parameters p) {
        if(p==null||!Double.isFinite(v)||v<0||!Double.isFinite(p.cap)||!Double.isFinite(p.jerk)||!Double.isFinite(p.delay)||p.cap<=0||p.jerk<=0||p.delay<0)
            throw new IllegalArgumentException("P02 needs v>=0, cap>0, jerk>0, delay>=0, all finite");
    }
}
