package com.vsos.core.failureanalysis;

import java.util.*;

/** G01-G04: exact continuous translation of a disc against a fixed-heading OBB per segment.
 * Numeric tolerances are solver precision, never physical uncertainty. Geometry is not sensor contact. */
public final class GeometryEngine {
    private static final double EPS = 1e-10;
    public record Vec(double x, double y) {
        public Vec minus(Vec other) { return new Vec(x-other.x,y-other.y); }
        public double norm() { return Math.hypot(x,y); }
    }
    public record State(double t, Vec boxCenter, Vec targetCenter, double yawRadians) {}
    public record Body(double length, double width, double radius, String clockId, String frameId, double maximumGap) {}
    public record Interval(double start, double end, boolean leftCensored, boolean rightCensored) {
        public Interval(double start, double end) { this(start,end,false,false); }
    }
    public record Result(Boolean conflict, List<Interval> conflicts, Double minimumSignedIndicator,
                         Double minimumClearance, List<Interval> longitudinal, List<Interval> lateral,
                         boolean complete, List<String> reasons) {}
    public record Pet(Double seconds, String relation, List<String> reasons) {}
    public record Projection(double forward, double left) {}

    public static Projection project(Vec point, Vec origin, double yaw) {
        Vec d=point.minus(origin); return new Projection(d.x*Math.cos(yaw)+d.y*Math.sin(yaw), d.x*Math.sin(yaw)-d.y*Math.cos(yaw));
    }
    public static double kmhToMps(double speed) { return speed/3.6; }
    /** G02 plane arrival only. Null is not a safe/collision verdict. */
    public static Double longitudinalTtc(double gap, double closing) {
        return Double.isFinite(gap) && Double.isFinite(closing) && gap>0 && closing>0 ? gap/closing : null;
    }
    public static double signedIndicator(Vec localDisc, double halfLength, double halfWidth, double radius) {
        return Math.hypot(Math.max(Math.abs(localDisc.x)-halfLength,0),Math.max(Math.abs(localDisc.y)-halfWidth,0))-radius;
    }
    public static Result analyze(List<State> states, Body body) {
        if (body == null || !finite(body.length,body.width,body.radius,body.maximumGap) || body.length<=0 || body.width<=0 || body.radius<0
                || body.maximumGap<=0 || body.clockId==null || body.frameId==null || states==null || states.size()<2)
            return unknown("GEOMETRY_CLOCK_OR_COVERAGE_MISSING");
        if(!valid(states.getFirst())||!valid(states.getLast()))return unknown("GEOMETRY_ENDPOINT_STATE_MISSING");
        List<Interval> conflicts=new ArrayList<>(), longitudinal=new ArrayList<>(), lateral=new ArrayList<>();
        List<String> reasons=new ArrayList<>(); double minimum=Double.POSITIVE_INFINITY; boolean complete=true;
        for (int i=1;i<states.size();i++) {
            State a=states.get(i-1), b=states.get(i);
            if (!valid(a)||!valid(b)||b.t<=a.t||b.t-a.t>body.maximumGap+EPS||Math.abs(b.yawRadians-a.yawRadians)>EPS) {
                complete=false; reasons.add("ROTATION_GAP_OR_STATE_UNRESOLVED"); continue;
            }
            Vec qa=local(a), qb=local(b), dv=qb.minus(qa); double hx=body.length/2, hy=body.width/2;
            List<Double> cuts=new ArrayList<>(List.of(0.0,1.0));
            for (double edge:new double[]{-hx,hx}) cut(cuts,qa.x,dv.x,edge);
            for (double edge:new double[]{-hy,hy}) cut(cuts,qa.y,dv.y,edge);
            cuts.sort(Double::compare);
            for (int j=1;j<cuts.size();j++) {
                double lo=cuts.get(j-1),hi=cuts.get(j),mid=(lo+hi)/2;
                double sx=side(qa.x+dv.x*mid,hx), sy=side(qa.y+dv.y*mid,hy);
                double x0=sx==0?0:sx*qa.x-hx, xv=sx*dv.x;
                double y0=sy==0?0:sy*qa.y-hy, yv=sy*dv.y;
                double A=xv*xv+yv*yv, B=2*(x0*xv+y0*yv), C=x0*x0+y0*y0;
                double at=A>0?Math.max(lo,Math.min(hi,-B/(2*A))):lo;
                minimum=Math.min(minimum,Math.sqrt(Math.max(0,A*at*at+B*at+C))-body.radius);
                double arithmeticTolerance=32*Math.ulp(Math.max(C,body.radius*body.radius));
                for (Interval part:quadraticLeq(A,B,C-body.radius*body.radius,lo,hi,arithmeticTolerance))
                    conflicts.add(new Interval(a.t+(b.t-a.t)*part.start,a.t+(b.t-a.t)*part.end));
            }
            addSlab(longitudinal,qa.x,dv.x,hx+body.radius,a.t,b.t);
            addSlab(lateral,qa.y,dv.y,hy+body.radius,a.t,b.t);
        }
        double start=states.getFirst().t,end=states.getLast().t;
        List<Interval> resolved=merge(conflicts,start,end);
        return new Result(resolved.isEmpty()?(complete?Boolean.FALSE:null):Boolean.TRUE,resolved,
                Double.isFinite(minimum)?minimum:null,Double.isFinite(minimum)?Math.max(0,minimum):null,
                merge(longitudinal,start,end),merge(lateral,start,end),complete,List.copyOf(new LinkedHashSet<>(reasons)));
    }
    private static Result unknown(String code) { return new Result(null,List.of(),null,null,List.of(),List.of(),false,List.of(code)); }
    private static Vec local(State s) {
        Vec q=s.targetCenter.minus(s.boxCenter); double c=Math.cos(s.yawRadians),sin=Math.sin(s.yawRadians);
        return new Vec(q.x*c+q.y*sin,-q.x*sin+q.y*c);
    }
    private static boolean valid(State s) { return s!=null&&s.boxCenter!=null&&s.targetCenter!=null&&finite(s.t,s.yawRadians,s.boxCenter.x,s.boxCenter.y,s.targetCenter.x,s.targetCenter.y); }
    private static boolean finite(double... xs) { return Arrays.stream(xs).allMatch(Double::isFinite); }
    private static double side(double q,double h) { return q>h?1:q< -h?-1:0; }
    private static void cut(List<Double> cuts,double q,double v,double edge) { if (v!=0) { double t=(edge-q)/v;if(t>0&&t<1)cuts.add(t); } }
    private static List<Interval> quadraticLeq(double A,double B,double C,double lo,double hi,double arithmeticTolerance) {
        if (A==0) return C<=arithmeticTolerance?List.of(new Interval(lo,hi)):List.of();
        double disc=B*B-4*A*C;
        double round=32*Math.ulp(Math.max(Math.abs(B*B),Math.abs(4*A*C)));
        if (disc< -round) return List.of();
        disc=Math.sqrt(Math.max(0,disc));
        double q=-.5*(B+Math.copySign(disc,B));
        double r1=q==0?-B/(2*A):q/A,r2=q==0?r1:C/q;
        double a=Math.max(lo,Math.min(r1,r2)),b=Math.min(hi,Math.max(r1,r2));
        return a<=b?List.of(new Interval(a,b)):List.of();
    }
    private static void addSlab(List<Interval> out,double q,double v,double half,double start,double end) {
        if(v==0){if(Math.abs(q)<=half)out.add(new Interval(start,end));return;}
        double a=(-half-q)/v,b=(half-q)/v,lo=Math.max(0,Math.min(a,b)),hi=Math.min(1,Math.max(a,b));
        if(lo<=hi)out.add(new Interval(start+(end-start)*lo,start+(end-start)*hi));
    }
    public static List<Interval> merge(List<Interval> intervals,double horizonStart,double horizonEnd) {
        List<Interval> sorted=intervals.stream().sorted(Comparator.comparingDouble(Interval::start)).toList();
        List<Interval> out=new ArrayList<>();
        for(Interval i:sorted) {
            if(!out.isEmpty()&&i.start<=out.getLast().end+EPS) {
                Interval last=out.removeLast(); out.add(new Interval(last.start,Math.max(last.end,i.end)));
            } else out.add(i);
        }
        return out.stream().map(i->new Interval(i.start,i.end,Math.abs(i.start-horizonStart)<=EPS,Math.abs(i.end-horizonEnd)<=EPS)).toList();
    }
    /** Explicit single encounter in a named area; callers must not combine unrelated passes. */
    public static Pet pet(Interval a,Interval b,String areaId,String clockId) {
        if(a==null||b==null||areaId==null||clockId==null) return new Pet(null,"UNKNOWN",List.of("PET_AREA_CLOCK_OR_INTERVAL_MISSING"));
        if(!finite(a.start,a.end,b.start,b.end)||a.start>a.end||b.start>b.end)return new Pet(null,"UNKNOWN",List.of("PET_INTERVAL_INVALID"));
        if(a.leftCensored||a.rightCensored||b.leftCensored||b.rightCensored) return new Pet(null,"CENSORED",List.of("OCCUPANCY_CENSORED"));
        if(Math.max(a.start,b.start)<=Math.min(a.end,b.end)) return new Pet(null,"OVERLAPPING",List.of("OCCUPANCY_OVERLAP"));
        return new Pet(Math.max(a.start,b.start)-Math.min(a.end,b.end),"DISJOINT",List.of());
    }
}
