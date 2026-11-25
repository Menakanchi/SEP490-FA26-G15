package com.vsos.backend.exception.analysis;

/** FA-specific controlled boundary error. Never carries input text, SQL or server paths. */
public final class FailureAnalysisException extends RuntimeException {
    public final int status;
    public final String code;
    public FailureAnalysisException(int status,String code) {super(code);this.status=status;this.code=code;}
}
