package com.vsos.core.failureanalysis;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Intake dispatch only; both formats enter the same evidence/diagnosis core. */
final class FailureAnalysisInput implements AutoCloseable {
    private final RawArtifactAdapter raw;
    private final JsonInputAdapter json;
    FailureAnalysisInput(Path input) throws IOException {
        boolean isJson=Files.isRegularFile(input)&&input.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json");
        json=isJson?new JsonInputAdapter(input):null;raw=isJson?null:new RawArtifactAdapter(input);
    }
    List<Run> runs() throws IOException {
        if(json!=null)return json.runs();
        List<Run> out=new ArrayList<>();for(String directory:raw.runDirectories())out.add(raw.read(directory));return out;
    }
    boolean json(){return json!=null;}
    boolean complete(){return json==null||json.complete();}
    Map<String,Object> manifest(){return json==null?Map.of():json.manifest();}
    /** JSON comparators are unique within the declared variant/seed/vehicle/profile tuple.
     * ImpactAnalyzer still verifies comparability; this lookup grants no causal authority. */
    static Run comparator(Run on,List<Run> runs) {
        List<Run> controls=runs.stream().filter(r->"OFF".equals(EvidenceReport.mode(r).value())&&r.caseKey().equals(on.caseKey()))
            .filter(r->!JsonInputAdapter.supports(on)||sameContext(on,r)).toList();
        return controls.size()==1?controls.getFirst():null;
    }
    private static boolean sameContext(Run a,Run b){
        for(String field:List.of("seed","simulator","carla_vehicle_model_id","aeb_version_id"))
            if(a.get("result","/dataset/identity/"+field)==null||!Objects.equals(a.get("result","/dataset/identity/"+field),b.get("result","/dataset/identity/"+field)))return false;
        return Objects.equals(a.get("result","/outcome/params"),b.get("result","/outcome/params"));
    }
    @Override public void close() throws IOException {if(json!=null)json.close();if(raw!=null)raw.close();}
}
