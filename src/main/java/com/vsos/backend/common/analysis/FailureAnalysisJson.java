package com.vsos.backend.common.analysis;

import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Versioned finite REST budgets. Not a production capacity/SLA certification. */
public final class FailureAnalysisJson {
    private FailureAnalysisJson() {}
    public static final String VERSION = "fa-rest-persistence/1";
    public static final int SOURCE_BYTES = 1 << 20;
    public static final int DB_COLLECTION_BYTES = 2 << 20;
    public static final int RESOURCE_BYTES = 8 << 20;
    public static final int GRAPH_BYTES = 32 << 20;
    public static final int METADATA_BYTES = 256 << 10;
    public static final int MEMBERS = 16;
    public static InputResourcePolicy policy(int maxBytes) {
        return new InputResourcePolicy(maxBytes,maxBytes,maxBytes,1,256,MEMBERS,20000,60000,65536,128,
                48,262144,256,200000,Math.min(128L<<20,Runtime.getRuntime().maxMemory()/2),128L<<20);
    }
    public static byte[] bytes(Object json) {
        byte[] bytes = MiniJson.write(json).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > RESOURCE_BYTES) throw new FailureAnalysisException(413,"OUTPUT_RESOURCE_LIMIT");
        return bytes;
    }
    @SuppressWarnings("unchecked")
    public static Map<String,Object> object(byte[] bytes) {
        if(bytes == null || bytes.length > RESOURCE_BYTES) throw new FailureAnalysisException(409,"STORED_RESOURCE_INVALID");
        Object value = new BoundedInput(policy(RESOURCE_BYTES)).parse(bytes,"application/json","stored-resource");
        if(!(value instanceof Map<?,?>)) throw new FailureAnalysisException(409,"STORED_RESOURCE_INVALID");
        return (Map<String,Object>) value;
    }
    /** Loaded core bytecode, including dependencies in com.vsos.core; not a claimed git revision. */
    public static String coreFingerprint() {
        try {
            Map<String,String> hashes=new TreeMap<>();
            for(var resource:new PathMatchingResourcePatternResolver().getResources("classpath*:com/vsos/core/**/*.class")) {
                String path=resource.getURL().toString();
                String name=path.substring(path.lastIndexOf("com/vsos/core/"));
                byte[] bytes=new BoundedInput(policy(SOURCE_BYTES)).read(resource.getInputStream(),"core-class",-1);
                if(hashes.putIfAbsent(name,Evidence.sha256(bytes))!=null) throw new IllegalStateException("DUPLICATE_CORE_CLASS");
            }
            if(hashes.isEmpty()) throw new IllegalStateException("CORE_NOT_FOUND");
            return Evidence.sha256(bytes(hashes));
        } catch(Exception e) { throw new IllegalStateException("FA_CORE_FINGERPRINT_UNAVAILABLE"); }
    }
}
