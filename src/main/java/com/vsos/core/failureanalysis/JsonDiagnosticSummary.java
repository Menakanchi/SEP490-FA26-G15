package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Test/review CSV, a projection of stored identity and core output, never a scoring input. */
final class JsonDiagnosticSummary {
    private JsonDiagnosticSummary(){}
    static String csv(List<Run> runs,Map<String,Map<String,Object>> reports){
        List<List<Object>> rows=new ArrayList<>();
        rows.add(new ArrayList<>(List.of("run_key","scenario_id","variant_id","seed","aeb_mode","repetition","attempt","ttc_threshold_s","brake_delay_s","max_decel_mps2","brake_ramp_mps3","physical_outcome","failure_candidate_types","candidate_statuses","rms_jerk_mps3","impact_speed_mps","stopping_distance_m","objective_provenance","evidence_quality","root_cause_certainty","missing_evidence_reasons","report_reference")));
        for(Run r:runs){Map<String,Object> report=reports.get(r.runKey());List<Object> row=new ArrayList<>();row.add(r.runKey());
            for(String k:List.of("scenario_id","variant_id","seed","aeb_mode","repetition","attempt"))row.add(r.get("result","/dataset/identity/"+k));
            for(String k:List.of("ttc_threshold","brake_activation_delay","max_deceleration","brake_buildup_rate"))row.add(r.get("result","/outcome/params/"+k));
            row.add(at(report,"/report/physical_outcome/value"));Object c=at(report,"/report/failure_candidates");
            row.add(join(c,"type"));row.add(join(c,"status"));
            for(String k:CanonicalObjectiveReader.KEYS)row.add(r.get("result","/outcome/metrics/"+k));
            row.add(com.vsos.core.common.MiniJson.write(at(report,"/report/objectives")));
            row.add(com.vsos.core.common.MiniJson.write(at(report,"/report/evidence_sufficiency")));
            row.add(at(report,"/report/confirmed_root_cause/status"));row.add(com.vsos.core.common.MiniJson.write(at(report,"/report/inconclusive_reasons")));
            row.add(r.runKey()+".json");rows.add(row);
        }
        StringBuilder out=new StringBuilder();for(List<Object> row:rows){for(int i=0;i<row.size();i++){if(i>0)out.append(',');out.append('"').append(Objects.toString(row.get(i),"").replace("\"","\"\"")).append('"');}out.append('\n');}return out.toString();
    }
    private static String join(Object x,String key){return x instanceof List<?> list?String.join("|",list.stream().map(v->Objects.toString(at(v,"/"+key),"UNKNOWN")).toList()):"";}
}
