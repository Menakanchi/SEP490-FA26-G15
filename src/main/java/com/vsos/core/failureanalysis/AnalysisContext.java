package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.time.Instant;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Offline acceptance boundary, not an authentication service. Trust anchors must come
 * from the caller's independent review policy, NEVER from a package's APPROVED field.
 * Both byte and parsed-content hashes are pinned to prevent in-memory substitution.
 * No operational authority is supplied by the default path. */
public record AnalysisContext(String schemaVersion,List<Artifact> packages,List<Artifact> sources,
                              List<ReviewAuthority> authorities,Instant asOf,Artifact baselineBinding) {
    public static final String VERSION="vehicsim.analysis-context/v1";
    public static final String PACKAGE="vehicsim.analysis-context-package/v1";
    public static final String REVIEW="vehicsim.analysis-context-review/v1";
    public record ReviewAuthority(String authorityId,String reviewerId,String reviewSha256,String reviewDataSha256) {}
    public AnalysisContext {
        packages=List.copyOf(packages);sources=List.copyOf(sources);authorities=List.copyOf(authorities);
    }
    public static AnalysisContext empty(){return new AnalysisContext(VERSION,List.of(),List.of(),List.of(),null,null);}
    /** Compact UTF-8 MiniJson parsed-content hash; distinct from original file-byte SHA256. */
    public static String dataHash(Artifact a){return sha256(MiniJson.write(a.data()));}
}
