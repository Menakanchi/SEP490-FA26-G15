package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;

/** Offline M1B runner. Optional exact run key; pairs only with an OFF artifact in this input corpus. */
public final class OfflineDiagnosticAnalysis {
    private OfflineDiagnosticAnalysis() {}
    public static void main(String[] args) throws Exception {
        if(args.length<2||args.length>3)throw new IllegalArgumentException("Usage: <JSON/raw ZIP/directory> <new output directory> [run_key]");
        Path raw=Path.of(args[0]).toRealPath(),out=Path.of(args[1]).toAbsolutePath().normalize(),ancestor=out;
        while(!Files.exists(ancestor))ancestor=ancestor.getParent();
        Path resolved=ancestor.toRealPath().resolve(ancestor.relativize(out)).normalize();
        if(resolved.startsWith(raw)||raw.startsWith(resolved))throw new IllegalArgumentException("Output overlaps raw input");
        try(var adapter=new FailureAnalysisInput(raw)) {
            List<Evidence.Run> runs=adapter.runs(),selected=runs.stream().filter(r->args.length==2||r.runKey().equals(args[2])).toList();
            // Preserve the legacy CLI's explicit rejection of ambiguous controls.
            if(!adapter.json()){Set<String> keys=new HashSet<>();for(var run:runs)if("OFF".equals(EvidenceReport.mode(run).value())&&!keys.add(run.caseKey()))
                throw new IllegalArgumentException("Ambiguous OFF comparator; explicit selection required");}
            if(Files.exists(out)&&adapter.json())throw new IllegalArgumentException("OUTPUT_EXISTS");
            Files.createDirectories(out);
            if(adapter.json())Files.writeString(out.resolve("_input_manifest.json"),MiniJson.write(adapter.manifest()),StandardOpenOption.CREATE_NEW);
            if(selected.isEmpty())throw new IllegalArgumentException("No matching analyzable input runs; inspect input manifest");
            Map<String,Map<String,Object>> reports=new LinkedHashMap<>();
            for(var run:selected) {
                var report=new DiagnosticReport().analyze(run,"ON".equals(EvidenceReport.mode(run).value())?FailureAnalysisInput.comparator(run,runs):null);
                Files.writeString(out.resolve(run.runKey()+".json"),MiniJson.write(report)+System.lineSeparator(),StandardOpenOption.CREATE_NEW);reports.put(run.runKey(),report);
            }
            if(adapter.json())Files.writeString(out.resolve("FUNCTIONAL_TEST_SUMMARY.csv"),JsonDiagnosticSummary.csv(selected,reports),StandardOpenOption.CREATE_NEW);
            System.out.println("Diagnostic Reports written: "+selected.size()+" input="+(adapter.complete()?"COMPLETE":"PARTIAL_OR_BLOCKED"));
        }
    }
}
