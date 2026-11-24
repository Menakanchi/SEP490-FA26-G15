package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;

/** Offline source and handoff conformance only. A missing reference bundle/probe remains UNKNOWN. */
public final class OfflineConsumerCompatibility {
    private OfflineConsumerCompatibility() {}
    public static void main(String[] args)throws Exception {
        if(args.length!=4&&args.length!=6)throw new IllegalArgumentException("Usage: handoff.json expected-byte-sha256 repository-root NEW-output.json [probe.json expected-probe-byte-sha256]");
        Path handoff=Path.of(args[0]).toAbsolutePath().normalize(),repository=Path.of(args[2]).toAbsolutePath().normalize(),output=Path.of(args[3]).toAbsolutePath().normalize();
        if(Files.exists(output)||output.equals(handoff)||args.length==6&&output.equals(Path.of(args[4]).toAbsolutePath().normalize()))throw new IllegalArgumentException("OUTPUT_EXISTS_OR_OVERLAPS_INPUT");
        var artifact=HandoffSnapshots.read(handoff,"handoff-json",args[1]);
        var probe=args.length==6?HandoffSnapshots.read(Path.of(args[4]),"consumer-helper-probe",args[5]):null;
        var result=new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(artifact,ConsumerSourceInspection.read(repository),probe,null,null));
        if(output.getParent()!=null)Files.createDirectories(output.getParent());Files.writeString(output,MiniJson.write(result),StandardOpenOption.CREATE_NEW);
        System.out.println("M1D compatibility="+result.get("overall")+" dispatch=false output="+output);
    }
}
