package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;

/** Minimal offline runner: input ZIP/directory, output directory, optional exact run key. */
public final class OfflineFailureAnalysis {
    private OfflineFailureAnalysis() {}
    public static void main(String[] args) throws Exception {
        if (args.length < 2 || args.length > 3) throw new IllegalArgumentException("Usage: <raw ZIP/directory> <new output directory> [run_key]");
        Path input = Path.of(args[0]).toRealPath(), output = Path.of(args[1]).toAbsolutePath().normalize();
        if (output.startsWith(input) || input.startsWith(output)) throw new IllegalArgumentException("Output must be separate from raw input");
        // Resolve the existing ancestor to reject symlinks/junctions back into raw input.
        Path ancestor = output;
        while (!Files.exists(ancestor)) ancestor = ancestor.getParent();
        Path actualOutput = ancestor.toRealPath().resolve(ancestor.relativize(output)).normalize();
        if (actualOutput.startsWith(input) || input.startsWith(actualOutput)) throw new IllegalArgumentException("Output overlaps raw input");
        Files.createDirectories(output);
        int count = 0;
        try (RawArtifactAdapter adapter = new RawArtifactAdapter(input)) {
            for (String directory : adapter.runDirectories()) {
                Evidence.Run run = adapter.read(directory);
                if (args.length == 3 && !args[2].equals(run.runKey())) continue;
                String report = MiniJson.write(new EvidenceReport().analyze(run));
                Files.writeString(output.resolve(run.runKey() + ".json"), report + System.lineSeparator(), StandardOpenOption.CREATE_NEW);
                count++;
            }
        }
        if (count == 0) throw new IllegalArgumentException("No matching real input runs");
        System.out.println("M1A reports written: " + count);
    }
}
