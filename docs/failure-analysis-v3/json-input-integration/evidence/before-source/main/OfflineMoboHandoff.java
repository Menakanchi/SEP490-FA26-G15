package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Golden/offline review export from existing reports. Never freezes a dataset or generates baseline samples. */
public final class OfflineMoboHandoff {
    private OfflineMoboHandoff() {}
    public static void main(String[] args) throws Exception {
        if(args.length!=4)throw new IllegalArgumentException("Usage: raw.zip|directory diagnostic-report-directory NEW-output.json repository-root");
        Path raw=Path.of(args[0]).toAbsolutePath().normalize(),reports=Path.of(args[1]).toAbsolutePath().normalize(),
                output=Path.of(args[2]).toAbsolutePath().normalize(),repository=Path.of(args[3]).toAbsolutePath().normalize();
        if(Files.exists(output)||output.startsWith(reports)||output.equals(raw)||Files.isDirectory(raw)&&output.startsWith(raw))
            throw new IllegalArgumentException("OUTPUT_OVERLAPS_INPUT_OR_EXISTS");
        List<MoboHandoffBuilder.MemberInput> members=new ArrayList<>();
        BoundedInput reportInput=new BoundedInput(InputResourcePolicy.defaults());
        try(var adapter=new RawArtifactAdapter(raw)){
            for(String directory:adapter.runDirectories()){
                Run run=adapter.read(directory);Path report=reports.resolve(run.runKey()+".json").normalize();
                if(!report.startsWith(reports)||!Files.isRegularFile(report))throw new IllegalArgumentException("DIAGNOSTIC_REPORT_MISSING:"+run.runKey());
                Artifact loaded=HandoffSnapshots.read(report,run.runKey()+":diagnostic",null,reportInput);
                if(!loaded.usable())throw new InputRejectedException(InputRejectedException.Kind.INVALID_ARTIFACT,"DIAGNOSTIC_REPORT_INVALID",loaded.id(),"Invalid report input");
                members.add(new MoboHandoffBuilder.MemberInput(run,HandoffSnapshots.map(loaded.data())));
            }
        }
        List<Artifact> sources=new ArrayList<>();for(String path:List.of("src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java",
                "src/main/java/com/vsos/backend/service/analysis/AnalysisService.java","src/main/java/com/vsos/backend/service/optimization/OptimizationService.java",
                "src/main/java/com/vsos/core/mobo/MoboEngine.java","src/main/java/com/vsos/core/mobo/ParameterBounds.java"))
            sources.add(HandoffSnapshots.source(repository.resolve(path),path));
        var result=new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(members,null,null,SearchRangeResolver.repositorySources(repository),
                HandoffSnapshots.source(repository.resolve("src/main/java/com/vsos/core/aeb/AebStack.java"),"aeb-mechanism-source"),sources));
        if(output.getParent()!=null)Files.createDirectories(output.getParent());
        Files.writeString(output,MiniJson.write(result),StandardOpenOption.CREATE_NEW);
        System.out.println("M1C offline members="+members.size()+" baseline=UNKNOWN consumer=NOT_DIRECTLY_CONSUMABLE output="+output);
    }
}
