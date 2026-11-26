package com.vsos.core.failureanalysis;
import java.nio.file.*;
import com.vsos.core.common.MiniJson;
import static com.vsos.core.failureanalysis.Evidence.*;
class Batch02SchemaDigestProbe {
    public static void main(String[] args)throws Exception{
        // One immutable serialized input in both JVMs. Regenerating a fixture can change raw byte hashes.
        byte[] bytes=Files.readAllBytes(Path.of(args[0]));
        var artifact=HandoffSnapshots.read(Path.of(args[0]),"h",sha256(bytes));
        var c=new ConsumerCompatibilityValidator().validate(artifact,ConsumerSourceInspection.read(Path.of(".")));
        System.out.println(MiniJson.write(obj("input_byte_sha256",sha256(bytes),"handoff_digest",at(artifact.data(),"/content_digest"),
                "compatibility_digest",c.get("content_digest"),"schema",at(c,"/input_validation/schema"),"dispatch_allowed",c.get("dispatch_allowed"))));
    }
}
