package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;

/** Offline M1B runner. Optional exact run key; pairs only with an OFF artifact in this input corpus. */
public final class OfflineDiagnosticAnalysis {
    private OfflineDiagnosticAnalysis() {}
    public static void main(String[] args) throws Exception {
        if(args.length<2||args.length>3)throw new IllegalArgumentException("Usage: <raw ZIP/directory> <new output directory> [run_key]");
        Path raw=Path.of(args[0]).toRealPath(),out=Path.of(args[1]).toAbsolutePath().normalize(),ancestor=out;
        while(!Files.exists(ancestor))ancestor=ancestor.getParent();
        Path resolved=ancestor.toRealPath().resolve(ancestor.relativize(out)).normalize();
        if(resolved.startsWith(raw)||raw.startsWith(resolved))throw new IllegalArgumentException("Output overlaps raw input");
        Map<String,Evidence.Run> controls=new HashMap<>();List<Evidence.Run> selected=new ArrayList<>();
        try(var adapter=new RawArtifactAdapter(raw)) {
            for(String directory:adapter.runDirectories()) {
                var run=adapter.read(directory);
                if("OFF".equals(EvidenceReport.mode(run).value())) {
                    if(controls.putIfAbsent(run.caseKey(),run)!=null)throw new IllegalArgumentException("Ambiguous OFF comparator; explicit selection required");
                }
                if(args.length==2||run.runKey().equals(args[2]))selected.add(run);
            }
        }
        if(selected.isEmpty())throw new IllegalArgumentException("No matching input runs");
        Files.createDirectories(out);
        for(var run:selected) {
            var report=new DiagnosticReport().analyze(run,"ON".equals(EvidenceReport.mode(run).value())?controls.get(run.caseKey()):null);
            Files.writeString(out.resolve(run.runKey()+".json"),MiniJson.write(report)+System.lineSeparator(),StandardOpenOption.CREATE_NEW);
        }
        System.out.println("M1B Diagnostic Reports written: "+selected.size());
    }
}
