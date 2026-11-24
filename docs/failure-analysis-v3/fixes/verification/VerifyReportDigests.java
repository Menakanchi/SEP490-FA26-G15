import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import java.nio.file.*;
import java.util.*;

class VerifyReportDigests {
    public static void main(String[] args)throws Exception{
        Path dir=Path.of("docs/failure-analysis-v3/fixes/batch-01-evidence/final-replay");int verified=0;
        try(var files=Files.list(dir.resolve("diagnostics"))){for(Path p:files.filter(x->x.toString().endsWith(".json")).toList()){
            var report=MiniJson.parseObject(Files.readString(p));if(!EvidenceReport.contentDigest(report).equals(report.get("content_digest")))throw new AssertionError(p);
            verified++;}}
        var handoff=MiniJson.parseObject(Files.readString(dir.resolve("GOLDEN18-audited-handoff.json")));
        if(!HandoffSnapshots.digest(handoff).equals(handoff.get("content_digest")))throw new AssertionError("handoff digest");verified++;
        var compatibility=MiniJson.parseObject(Files.readString(dir.resolve("GOLDEN18-audited-compatibility.json")));
        if(!ConsumerCompatibilityValidator.contentDigest(compatibility).equals(compatibility.get("content_digest")))throw new AssertionError("compatibility digest");verified++;
        if(!Boolean.FALSE.equals(compatibility.get("dispatch_allowed")))throw new AssertionError("dispatch");
        Files.writeString(dir.resolve("digest-verification.json"),MiniJson.write(Map.of("documents",verified,"status","PASS","dispatch_allowed",false)));
        System.out.println("Verified "+verified+" report/handoff/compatibility digests; dispatch=false");
    }
}
