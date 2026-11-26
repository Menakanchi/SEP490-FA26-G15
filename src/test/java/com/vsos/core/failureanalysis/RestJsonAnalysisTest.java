package com.vsos.core.failureanalysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RestJsonAnalysisTest {
    @Test void unboundHandoffUsesActualBuilderAndValidator()throws Exception {
        var core=new RestJsonAnalysis();var parsed=core.parse(Files.readAllBytes(Path.of("docs/failure-analysis-v3/handover/examples/inputs/result_run2499_full_dataset.json")),InputResourcePolicy.defaults());
        var handoff=core.diagnosticHandoff(parsed,parsed.runs().stream().map(r->new MoboHandoffBuilder.MemberInput(r,core.diagnose(r,parsed))).toList());
        var artifact=new Evidence.Artifact("stored-handoff","external","urn:fa:handoff",Evidence.sha256(com.vsos.core.common.MiniJson.write(handoff)),"application/json",Evidence.Integrity.VERIFIED,handoff,List.of());
        var compatibility=new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(artifact,RestJsonAnalysis.unavailableConsumerProfile(),null,null,null));
        assertThat(compatibility.get("dispatch_allowed")).isEqualTo(false);
    }
}
