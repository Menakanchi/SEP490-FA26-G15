package com.vsos.core.failureanalysis;
import java.nio.file.*;import java.util.*;import com.vsos.core.common.MiniJson;
class InspectBatch02 {public static void main(String[] x)throws Exception{var f=M1CFixture.create();var h=M1CFixture.build(f);for(var v:HandoffSchemaValidator.validate(h))System.out.println(v);Files.writeString(Path.of("docs/failure-analysis-v3/fixes/batch-02-evidence/synthetic-handoff-after-initial.json"),MiniJson.write(h));}}
