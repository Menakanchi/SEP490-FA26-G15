package com.vsos.core.failureanalysis;

import java.util.Map;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Controlled ingestion rejection, never an AEB diagnosis or partial canonical score. */
public final class InputRejectedException extends IllegalArgumentException {
    public enum Kind { RESOURCE_LIMIT_EXCEEDED, INVALID_ARTIFACT, INTEGRITY_MISMATCH, PARSE_ERROR, INCOMPLETE_INPUT }
    private final Kind kind;
    private final String reason;
    private final SourceRef source;
    public InputRejectedException(Kind kind,String reason,String artifact,String detail) {
        super(com.vsos.core.common.MiniJson.write(obj("category",kind.name(),"reason_code",reason,"source_ref",new SourceRef(artifact,"").json(),
                "detail",detail.length()>512?detail.substring(0,512):detail)));
        this.kind=kind;this.reason=reason;this.source=new SourceRef(artifact,"");
    }
    public Kind kind(){return kind;}
    public String reason(){return reason;}
    public SourceRef source(){return source;}
    public Map<String,Object> json(){return obj("category",kind.name(),"reason_code",reason,"source_ref",source.json());}
}
