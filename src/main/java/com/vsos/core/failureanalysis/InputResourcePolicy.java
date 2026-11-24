package com.vsos.core.failureanalysis;

/** Finite offline test defaults, not approved production limits. Retained charge is
 * a conservative allocation model, NOT a measurement or hard bound on JVM heap/RSS.
 * Limits can only be raised explicitly, and cannot exceed the declared heap envelope. */
public record InputResourcePolicy(long maxArchiveBytes,long maxMemberBytes,long maxTotalBytes,long maxCompressionRatio,
                                  int maxMembers,int maxRuns,int maxRecords,int maxRunRecords,int maxRowChars,int maxColumns,
                                  int maxJsonDepth,int maxStringChars,int maxTokenChars,int maxJsonValues,
                                  long maxRetainedChargeBytes,long maxWork) {
    public InputResourcePolicy {
        if(maxArchiveBytes<=0||maxMemberBytes<=0||maxTotalBytes<=0||maxCompressionRatio<=0||maxMembers<=0||maxRuns<=0||maxRecords<=0||maxRunRecords<=0
                ||maxRowChars<=0||maxColumns<=0||maxJsonDepth<=0||maxJsonDepth>64||maxStringChars<=0||maxTokenChars<=0||maxJsonValues<=0
                ||maxRetainedChargeBytes<=0||maxWork<=0||maxMemberBytes>Integer.MAX_VALUE-8L
                ||maxMemberBytes>Runtime.getRuntime().maxMemory()/16||maxRetainedChargeBytes>Runtime.getRuntime().maxMemory()/2
                ||(long)maxMembers*2048>Runtime.getRuntime().maxMemory()/4||(long)maxRuns*1024>Runtime.getRuntime().maxMemory()/8)
            throw new IllegalArgumentException("Finite positive resource limits within heap envelope are required; JSON depth <=64");
    }
    public static InputResourcePolicy defaults() {
        long heap=Runtime.getRuntime().maxMemory();
        return new InputResourcePolicy(64L<<20,Math.min(8L<<20,heap/64),256L<<20,100,(int)Math.min(4096,heap/8192),256,20000,60000,65536,128,
                48,262144,256,200000,Math.min(1L<<30,heap/2),256L<<20);
    }
}
