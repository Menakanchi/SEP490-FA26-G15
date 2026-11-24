package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.InputRejectedException.Kind.*;

/** Bounded RFC4180 records, quoted newlines, recorder CRCRLF and UTF-8 BOM. */
final class ArtifactCsv {
    private ArtifactCsv() {}
    static List<Map<String,Object>> read(String text){return read(text,new BoundedInput(InputResourcePolicy.defaults()),"csv-input");}
    static List<Map<String,Object>> read(String text,BoundedInput budget,String source) {
        if(text.startsWith("\uFEFF"))text=text.substring(1);
        budget.check(text.length(),budget.policy.maxMemberBytes(),"CSV_DOCUMENT_CHARS",source);budget.work(text.length(),source);
        budget.retain(Math.multiplyExact((long)text.length(),8),source);
        List<Map<String,Object>> out=new ArrayList<>();List<String> header=null,row=new ArrayList<>();StringBuilder cell=new StringBuilder();
        boolean quoted=false,closed=false;long rowChars=0;
        for(int i=0;i<=text.length();i++) {
            char c=i==text.length()?'\n':text.charAt(i);
            if(i==text.length()&&quoted)throw new InputRejectedException(INCOMPLETE_INPUT,"CSV_QUOTE_TRUNCATED",source,"Unclosed CSV quote");
            if(i<text.length())budget.check(++rowChars,budget.policy.maxRowChars(),"CSV_ROW_CHARS",source);
            if(quoted) {
                if(c=='"'){if(i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;budget.check(++rowChars,budget.policy.maxRowChars(),"CSV_ROW_CHARS",source);}else{quoted=false;closed=true;}}
                else cell.append(c);
            } else if(c=='"'&&cell.isEmpty()&&!closed)quoted=true;
            else if(c==','||c=='\r'||c=='\n') {
                if(c!=','&&row.isEmpty()&&cell.isEmpty()&&!closed){rowChars=0;continue;}
                budget.check(row.size()+1,budget.policy.maxColumns(),"CSV_COLUMNS",source);row.add(cell.toString());cell.setLength(0);closed=false;
                if(c!=',') {
                    if(header==null){header=List.copyOf(row);if(header.stream().anyMatch(String::isEmpty)||new HashSet<>(header).size()!=header.size())throw new InputRejectedException(PARSE_ERROR,"CSV_HEADER_INVALID",source,"CSV header empty/duplicated");}
                    else {
                        budget.check(out.size()+1,budget.policy.maxRecords(),"CSV_RECORDS",source);
                        if(row.size()!=header.size())throw new InputRejectedException(PARSE_ERROR,"CSV_FIELD_COUNT",source,"CSV field count mismatch");
                        budget.retain(Math.multiplyExact((long)row.size(),128),source);Map<String,Object> item=new LinkedHashMap<>();
                        for(int j=0;j<header.size();j++)item.put(header.get(j),row.get(j).isEmpty()?null:row.get(j));out.add(item);
                    }
                    row=new ArrayList<>();rowChars=0;
                }
            } else {if(closed||c=='"')throw new InputRejectedException(PARSE_ERROR,"CSV_QUOTING_INVALID",source,"Invalid CSV quoting");cell.append(c);}
        }
        if(header==null)throw new InputRejectedException(INCOMPLETE_INPUT,"CSV_HEADER_MISSING",source,"CSV header missing");
        return out;
    }
}
