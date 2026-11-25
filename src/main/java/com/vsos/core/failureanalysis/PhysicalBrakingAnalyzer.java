package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** T01/T02 recorder-only diagnostics. Never replaces producer jerk or stopping distance. */
public final class PhysicalBrakingAnalyzer {
    public record Sample(double time,Double value) {}
    public record Rms(Double value,double coveredSeconds,int unresolvedIntervals) {}
    public record Position(double time,Double x,Double y,Double z) {}
    public record Travel(Double totalM,Double partialM,int missingIntervals) {}
    /** T01 measured path length on an explicitly selected recorded window; gaps remain missing. */
    public static Travel travel(List<Position> positions,double maximumGap,boolean horizontal) {
        double distance=0;int missing=0,covered=0;
        if(!Double.isFinite(maximumGap)||maximumGap<=0)return new Travel(null,null,1);
        for(int i=1;i<positions.size();i++) {
            Position a=positions.get(i-1),b=positions.get(i);double dt=b.time-a.time;
            if(!Double.isFinite(dt)||dt<=0||dt>maximumGap+1e-10||a.x==null||a.y==null||b.x==null||b.y==null
                    ||!Double.isFinite(a.x)||!Double.isFinite(a.y)||!Double.isFinite(b.x)||!Double.isFinite(b.y)
                    ||!horizontal&&(a.z==null||b.z==null||!Double.isFinite(a.z)||!Double.isFinite(b.z))){missing++;continue;}
            distance+=horizontal?Math.hypot(b.x-a.x,b.y-a.y):Math.hypot(Math.hypot(b.x-a.x,b.y-a.y),b.z-a.z);covered++;
        }
        return new Travel(missing==0&&covered>0?distance:null,covered>0?distance:null,missing);
    }
    public static Rms jerk(List<Sample> acceleration,double maximumGap) {
        if(!Double.isFinite(maximumGap)||maximumGap<=0)return new Rms(null,0,1);
        double sum=0,duration=0;int unresolved=0;
        for(int i=1;i<acceleration.size();i++) {
            Sample a=acceleration.get(i-1),b=acceleration.get(i);double dt=b.time-a.time;
            if(a.value==null||b.value==null||!Double.isFinite(a.value)||!Double.isFinite(b.value)||!Double.isFinite(dt)||dt<=0||dt>maximumGap+1e-10){unresolved++;continue;}
            double j=(b.value-a.value)/dt;sum+=j*j*dt;duration+=dt;
        }
        return new Rms(duration>0?Math.sqrt(sum/duration):null,duration,unresolved);
    }
    /** Exact integral of squared piecewise-linear tracking error, duration weighted. */
    public static Rms trackingError(List<Sample> reference,List<Sample> measured,double maximumGap) {
        if(!Double.isFinite(maximumGap)||maximumGap<=0)return new Rms(null,0,1);
        if(reference.size()!=measured.size())return new Rms(null,0,1);
        double sum=0,time=0;int missing=0;
        for(int i=1;i<reference.size();i++) {
            Sample a=reference.get(i-1),b=reference.get(i),c=measured.get(i-1),d=measured.get(i);double dt=b.time-a.time;
            if(a.time!=c.time||b.time!=d.time||a.value==null||b.value==null||c.value==null||d.value==null||!Double.isFinite(dt)||dt<=0||dt>maximumGap
                    ||!Double.isFinite(a.value)||!Double.isFinite(b.value)||!Double.isFinite(c.value)||!Double.isFinite(d.value)){missing++;continue;}
            double e0=a.value-c.value,e1=b.value-d.value;sum+=dt*(e0*e0+e0*e1+e1*e1)/3;time+=dt;
        }
        return new Rms(time>0?Math.sqrt(sum/time):null,time,missing);
    }
    /** Peak over actual timestamp windows, with piecewise-linear speed between valid samples. */
    public static Double peakDeceleration(List<Sample> speed,double window,double maximumGap) {
        if(speed.size()<2||!Double.isFinite(window)||window<=0||!Double.isFinite(maximumGap)||maximumGap<=0)return null;
        TreeSet<Double> starts=new TreeSet<>();
        for(Sample s:speed){starts.add(s.time);starts.add(s.time-window);}
        Double peak=null;
        for(double t:starts) {
            if(t<speed.getFirst().time-1e-10||t+window>speed.getLast().time+1e-10)continue;
            boolean covered=true;
            for(int i=1;i<speed.size();i++) {
                Sample a=speed.get(i-1),b=speed.get(i);
                if(b.time>t&&a.time<t+window&&(a.value==null||b.value==null||!Double.isFinite(a.value)||!Double.isFinite(b.value)||b.time<=a.time||b.time-a.time>maximumGap+1e-10)) {covered=false;break;}
            }
            if(!covered)continue;
            Double a=interpolate(speed,t),b=interpolate(speed,t+window);
            if(a!=null&&b!=null)peak=peak==null?(a-b)/window:Math.max(peak,(a-b)/window);
        }
        return peak;
    }
    private static Double interpolate(List<Sample> samples,double t) {
        for(int i=1;i<samples.size();i++) {
            Sample a=samples.get(i-1),b=samples.get(i);
            if(t>=a.time-1e-10&&t<=b.time+1e-10&&a.value!=null&&b.value!=null&&b.time>a.time)
                return a.value+(b.value-a.value)*Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time)));
        }
        return null;
    }
    public Map<String,Object> analyze(Run r,List<Issue> issues,ImpactAnalyzer.Contact contact) {
        List<Sample> speed=new ArrayList<>(),acceleration=new ArrayList<>();List<Position> positions=new ArrayList<>();
        List<Map<String,Object>> gt=rows(r,"ground_truth","");
        Double dt=num(r,"result","/outcome/case/carla/fixed_delta_seconds");
        boolean blocked=blocked(r,issues,"ground_truth");
        List<String> limitations=new ArrayList<>(List.of("Snapshot kinematics from simulator, not independently calibrated road measurement",
                "No attribution to AEB, no requested/applied/consumed command trace",
                "Contact/startup/velocity-override artifacts are not silently clipped; per-tick override mask missing"));
        if(!blocked)for(var row:gt) {
            if(!"ego".equals(row.get("role")))continue;
            Double t=n(row.get("sim_time_s")),vx=n(row.get("vx_ms")),vy=n(row.get("vy_ms"));
            if(t==null||contact.time()!=null&&t>=contact.time())continue;
            speed.add(new Sample(t,vx!=null&&vy!=null?Math.hypot(vx,vy):null));
            acceleration.add(new Sample(t,n(row.get("a_along_v_ms2"))));
            positions.add(new Position(t,n(row.get("x_m")),n(row.get("y_m")),n(row.get("z_m"))));
        }
        double maxGap=dt!=null&&dt>0?dt:0;
        Rms jerk=maxGap>0?jerk(acceleration,maxGap):new Rms(null,0,1);
        Double peak=maxGap>0?peakDeceleration(speed,.1,maxGap):null;
        Travel travel=travel(positions,maxGap,true);
        List<SourceRef> source=List.of(r.ref("ground_truth",""));
        return obj("signal","GT_HORIZONTAL_VELOCITY_AND_RECORDED_A_ALONG_V","filter","NONE","clock_id","recorder","frame_id","CARLA_WORLD_HORIZONTAL",
                "window",obj("start_s",speed.isEmpty()?null:speed.getFirst().time,"end_s",speed.isEmpty()?null:speed.getLast().time,"kind","RECORDED_PRECONTACT_OR_CENSORED_EPISODE"),
                "peak_window_s",.1,"peak_decel",calculated(peak,"T02","m/s\u00b2","recorder","CARLA_WORLD_HORIZONTAL",source,limitations,"DESCRIPTIVE_RESPONSE_ONLY"),
                "jerk_rms",calculated(jerk.value,"T02","m/s\u00b3","recorder","CARLA_WORLD_HORIZONTAL",source,limitations,"DIAGNOSTIC_SIGNAL_NOT_CANONICAL"),
                "jerk_covered_seconds",jerk.coveredSeconds,"unresolved_jerk_intervals",jerk.unresolvedIntervals,
                "measured_episode_horizontal_travel",calculated(travel.totalM,"T01","m","recorder","CARLA_WORLD_HORIZONTAL",source,
                        List.of("Recorded precontact/censored episode, not command-aligned stopping distance"),travel.totalM==null?"RECORDED_TRAVEL_COVERAGE_INCOMPLETE":"RECORDED_EPISODE_TRAVEL_ONLY"),
                "partial_horizontal_travel",calculated(travel.partialM,"T01","m","recorder","CARLA_WORLD_HORIZONTAL",source,
                        List.of("Sum of resolved position increments only; does not bridge missing intervals"),"PARTIAL_RECORDED_WINDOW_ONLY"),"missing_travel_intervals",travel.missingIntervals,
                "tracking_rmse",missing("ALIGNED_FEASIBLE_DEMAND_TRACE_MISSING","m/s\u00b2"),
                "physical_onset",missing("APPROVED_ONSET_BASELINE_FILTER_THRESHOLD_MISSING","s"),
                "command_to_physical_delay",missing("CLOCK_AND_PHYSICAL_ONSET_UNRESOLVED","s"),
                "velocity_override_frames",r.read("result","/outcome/case/carla/low_speed_override_frames",null,null).json(),"limitations",limitations);
    }
}
