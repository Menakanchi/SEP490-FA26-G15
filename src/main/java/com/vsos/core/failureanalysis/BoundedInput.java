package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.InputRejectedException.Kind.*;

/** Session budgets include failed reads and repeated work. No raw-byte cache. JSON is
 * buffered under strict bounds; lexical preflight protects the existing MiniJson parser. */
public final class BoundedInput {
    private static final java.util.regex.Pattern NUMBER=java.util.regex.Pattern.compile("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?");
    public final InputResourcePolicy policy;
    private long bytes,work,retained;
    private boolean exhausted;
    public BoundedInput(InputResourcePolicy policy){this.policy=Objects.requireNonNull(policy);}
    public static long checkedAdd(long current,long amount,String source) {
        try {if(current<0||amount<0)throw new ArithmeticException();return Math.addExact(current,amount);}
        catch(ArithmeticException e){throw limit("SIZE_COUNTER_OVERFLOW",source);}
    }
    public static InputRejectedException limit(String reason,String source){return new InputRejectedException(RESOURCE_LIMIT_EXCEEDED,reason,source,"Input resource budget exceeded");}
    public void check(long amount,long maximum,String reason,String source){if(exhausted||amount>maximum){exhausted=true;throw limit(reason,source);}}
    public void work(long amount,String source){work=checkedAdd(work,amount,source);check(work,policy.maxWork(),"PARSING_WORK",source);}
    public void retain(long amount,String source){retained=checkedAdd(retained,amount,source);check(retained,policy.maxRetainedChargeBytes(),"RETAINED_ALLOCATION_CHARGE",source);}
    public Map<String,Object> counters(){return Evidence.obj("actual_read_bytes",bytes,"parsing_work",work,"retained_allocation_charge_bytes",retained);}
    public byte[] read(InputStream stream,String source,long compressedBytes) throws IOException {
        try(var input=stream;var output=new ByteArrayOutputStream(8192)) {
            if(exhausted)throw limit("SESSION_ALREADY_EXHAUSTED",source);
            byte[] buffer=new byte[8192];long count=0;
            for(int n;(n=input.read(buffer))!=-1;) {
                count=checkedAdd(count,n,source);check(count,policy.maxMemberBytes(),"MEMBER_BYTES",source);
                bytes=checkedAdd(bytes,n,source);check(bytes,policy.maxTotalBytes(),"CUMULATIVE_ACTUAL_BYTES",source);
                if(compressedBytes>=0&&count/(double)Math.max(1,compressedBytes)>policy.maxCompressionRatio())check(1,0,"ACTUAL_COMPRESSION_RATIO",source);
                work(n,source);output.write(buffer,0,n);
            }
            return output.toByteArray();
        }
    }
    public byte[] read(Path path,String source)throws IOException {
        check(Files.size(path),policy.maxMemberBytes(),"MEMBER_BYTES",source);
        return read(Files.newInputStream(path),source,-1);
    }
    public String utf8(byte[] data,String source) {
        try {String s=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(data)).toString();return s.startsWith("\uFEFF")?s.substring(1):s;}
        catch(CharacterCodingException e){throw new InputRejectedException(PARSE_ERROR,"UTF8_INVALID",source,"Malformed UTF-8");}
    }
    private static final class Frame {final char kind;boolean key,element=true;long count;final Set<String> keys;
        Frame(char c){kind=c;key=c=='{';keys=key?new HashSet<>():Set.of();}}
    /** Structural/token limits and duplicate keys before recursive allocation. MiniJson still owns grammar/semantic parsing. */
    public Object json(String text,String source) {
        check(text.length(),policy.maxMemberBytes(),"JSON_DOCUMENT_CHARS",source);work(text.length(),source);
        retain(Math.multiplyExact((long)text.length(),8),source);
        Deque<Frame> stack=new ArrayDeque<>();long values=0;
        for(int i=0;i<text.length();) {
            char c=text.charAt(i);if(Character.isWhitespace(c)||c==':'){i++;continue;}
            if(c==',' ){if(!stack.isEmpty()){Frame f=stack.peek();f.key=f.kind=='{';f.element=true;}i++;continue;}
            if(c=='}'||c==']'){if(stack.isEmpty()||stack.peek().kind!=(c=='}'?'{':'['))throw new InputRejectedException(PARSE_ERROR,"JSON_STRUCTURE_INVALID",source,"Mismatched container");stack.pop();i++;continue;}
            Frame parent=stack.peek();boolean key=c=='"'&&parent!=null&&parent.kind=='{'&&parent.key;
            retain(128,source);
            if(!key){check(++values,policy.maxJsonValues(),"JSON_VALUES",source);if(parent!=null&&parent.kind=='['&&parent.element){check(++parent.count,policy.maxRecords(),"JSON_ARRAY_RECORDS",source);parent.element=false;}}
            if(c=='{'||c=='['){check(stack.size()+1,policy.maxJsonDepth(),"JSON_DEPTH",source);stack.push(new Frame(c));i++;continue;}
            if(c=='"') {
                int start=i++;boolean closed=false;
                while(i<text.length()) {
                    char s=text.charAt(i++);if(s=='"'){closed=true;break;}
                    if(s<32)throw new InputRejectedException(PARSE_ERROR,"JSON_STRING_CONTROL_INVALID",source,"Unescaped control character");
                    if(s=='\\'&&i<text.length())i++;
                    check(i-start-1,policy.maxStringChars(),"JSON_STRING_CHARS",source);
                }
                if(!closed)throw new InputRejectedException(INCOMPLETE_INPUT,"JSON_STRING_TRUNCATED",source,"Unterminated string");
                if(key){String decoded;try{decoded=(String)MiniJson.parse(text.substring(start,i));}
                    catch(IllegalArgumentException e){throw new InputRejectedException(PARSE_ERROR,"JSON_KEY_ESCAPE_INVALID",source,"Invalid key escape");}
                    if(!parent.keys.add(decoded))throw new InputRejectedException(PARSE_ERROR,"JSON_DUPLICATE_KEY",source,"Duplicate object key");parent.key=false;}
            } else {
                int start=i;while(i<text.length()&&!Character.isWhitespace(text.charAt(i))&&",]}:".indexOf(text.charAt(i))<0)i++;
                if(i==start)throw new InputRejectedException(PARSE_ERROR,"JSON_TOKEN_INVALID",source,"Invalid token");
                check(i-start,policy.maxTokenChars(),"JSON_TOKEN_CHARS",source);
                String token=text.substring(start,i);
                if(c=='-'||Character.isDigit(c)) {
                    if(!NUMBER.matcher(token).matches())throw new InputRejectedException(PARSE_ERROR,"JSON_NUMBER_INVALID",source,"Invalid number grammar");
                    if((token.contains(".")||token.contains("e")||token.contains("E"))&&!Double.isFinite(Double.parseDouble(token)))throw new InputRejectedException(PARSE_ERROR,"JSON_NUMBER_NONFINITE",source,"Nonfinite numeric value");
                }
            }
        }
        if(!stack.isEmpty())throw new InputRejectedException(INCOMPLETE_INPUT,"JSON_CONTAINER_TRUNCATED",source,"Unterminated container");
        // Includes parser tree, immutable Evidence copy and input characters; accounting model, not exact object layout.
        try{return MiniJson.parse(text);}catch(IllegalArgumentException e){throw new InputRejectedException(PARSE_ERROR,"SCHEMA_PARSE_ERROR",source,"Malformed JSON grammar");}
    }
    public Object parse(byte[] data,String type,String source) {
        if(type.equals("application/java-archive"))return null;
        String text=utf8(data,source);
        if(type.equals("text/csv"))return ArtifactCsv.read(text,this,source);
        if(type.equals("application/x-ndjson")) {
            List<Object> out=new ArrayList<>();int start=0;
            for(int i=0;i<=text.length();i++)if(i==text.length()||text.charAt(i)=='\n'||text.charAt(i)=='\r') {
                check(i-start,policy.maxRowChars(),"JSONL_ROW_CHARS",source);
                if(i>start&&!text.substring(start,i).isBlank()){check(out.size()+1,policy.maxRecords(),"JSONL_RECORDS",source);Object row=json(text.substring(start,i),source);
                    if(!(row instanceof Map<?,?>))throw new InputRejectedException(PARSE_ERROR,"JSONL_OBJECT_REQUIRED",source,"Expected object record");out.add(row);}start=i+1;
            } else check(i-start+1,policy.maxRowChars(),"JSONL_ROW_CHARS",source);
            return out;
        }
        return json(text,source);
    }
}
