package com.vsos.core.failureanalysis;

import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.InputRejectedException.Kind.*;

/** Bounds the central directory BEFORE ZipFile allocates its index. ZIP64,
 * multi-disk and encrypted inputs are explicitly unsupported, never guessed. */
final class ArchiveIndex {
    private ArchiveIndex() {}
    static void safe(String name) {
        if(name==null||name.isEmpty()||name.length()>1024||name.startsWith("/")||name.contains("\\")||name.contains(":")||name.chars().anyMatch(c->c<32||c==127))bad("UNSAFE_MEMBER_NAME",Objects.toString(name,"unknown"));
        String[] parts=name.split("/",-1);
        for(int i=0;i<parts.length;i++)if((parts[i].isEmpty()&&i!=parts.length-1)||parts[i].equals(".")||parts[i].equals("..")||parts[i].endsWith(".")||parts[i].endsWith(" "))bad("UNSAFE_MEMBER_NAME",name);
    }
    static void bad(String reason,String source){throw new InputRejectedException(INVALID_ARTIFACT,reason,source,"Unsafe or unsupported archive structure");}
    static long u32(byte[] b,int off){return Integer.toUnsignedLong(ByteBuffer.wrap(b,off,4).order(ByteOrder.LITTLE_ENDIAN).getInt());}
    static int u16(byte[] b,int off){return Short.toUnsignedInt(ByteBuffer.wrap(b,off,2).order(ByteOrder.LITTLE_ENDIAN).getShort());}
    static Set<String> read(Path file,BoundedInput budget)throws IOException {
        String source=file.getFileName().toString();long length=Files.size(file);budget.check(length,budget.policy.maxArchiveBytes(),"ARCHIVE_BYTES",source);
        try(var in=new RandomAccessFile(file.toFile(),"r")) {
            if(length<22)bad("ZIP_TRUNCATED",source);
            byte[] tail=new byte[(int)Math.min(length,65557)];in.seek(length-tail.length);in.readFully(tail);int end=-1;
            for(int i=tail.length-22;i>=0;i--)if(u32(tail,i)==0x06054b50L&&i+22+u16(tail,i+20)==tail.length){end=i;break;}
            if(end<0)bad("ZIP_END_RECORD_MISSING",source);
            int entries=u16(tail,end+10);long size=u32(tail,end+12),offset=u32(tail,end+16);
            if(u16(tail,end+4)!=0||u16(tail,end+6)!=0||u16(tail,end+8)!=entries||entries==65535||size==0xffffffffL||offset==0xffffffffL)bad("ZIP64_OR_MULTIDISK_UNSUPPORTED",source);
            budget.check(entries,budget.policy.maxMembers(),"ZIP_MEMBER_COUNT",source);
            if(BoundedInput.checkedAdd(offset,size,source)!=length-tail.length+end)bad("ZIP_DIRECTORY_EXTENT_INVALID",source);
            // Extra fields/comments are bounded too, before any central-directory allocation by ZipFile.
            budget.check(size,Math.multiplyExact((long)budget.policy.maxMembers(),2048),"ZIP_DIRECTORY_BYTES",source);
            budget.retain(BoundedInput.checkedAdd(size*4,(long)entries*256,source),source);
            in.seek(offset);Set<String> names=new TreeSet<>();Map<String,Boolean> folded=new HashMap<>();long total=0;
            for(int n=0;n<entries;n++) {
                byte[] h=new byte[46];in.readFully(h);if(u32(h,0)!=0x02014b50L)bad("ZIP_DIRECTORY_HEADER_INVALID",source);
                int nameLength=u16(h,28),extra=u16(h,30),comment=u16(h,32);
                if(nameLength==0||nameLength>1024||extra>1024||comment>1024)bad("ZIP_DIRECTORY_FIELD_LENGTH",source);
                if((u16(h,8)&1)!=0)bad("ZIP_ENCRYPTION_UNSUPPORTED",source);
                long packed=u32(h,20),unpacked=u32(h,24),local=u32(h,42);
                if(packed==0xffffffffL||unpacked==0xffffffffL||local==0xffffffffL)bad("ZIP64_UNSUPPORTED",source);
                byte[] nameBytes=new byte[nameLength];in.readFully(nameBytes);String name;
                try{name=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(nameBytes)).toString();}
                catch(CharacterCodingException e){bad("ZIP_NAME_UTF8_INVALID",source);return Set.of();}
                safe(name);String key=(name.endsWith("/")?name.substring(0,name.length()-1):name).toLowerCase(Locale.ROOT);
                if(!names.add(name)||folded.putIfAbsent(key,name.endsWith("/"))!=null)bad("ZIP_DUPLICATE_OR_COLLIDING_NAME",name);
                budget.check(unpacked,budget.policy.maxMemberBytes(),"DECLARED_MEMBER_BYTES",name);
                total=BoundedInput.checkedAdd(total,unpacked,name);budget.check(total,budget.policy.maxTotalBytes(),"DECLARED_CUMULATIVE_BYTES",name);
                if(unpacked/(double)Math.max(1,packed)>budget.policy.maxCompressionRatio())budget.check(1,0,"DECLARED_COMPRESSION_RATIO",name);
                if(BoundedInput.checkedAdd(local,BoundedInput.checkedAdd(30,packed,name),name)>offset)bad("ZIP_MEMBER_EXTENT_INVALID",name);
                in.seek(BoundedInput.checkedAdd(in.getFilePointer(),extra+comment,name));
                if(in.getFilePointer()>offset+size)bad("ZIP_DIRECTORY_TRUNCATED",name);
            }
            if(in.getFilePointer()!=offset+size)bad("ZIP_DIRECTORY_COUNT_MISMATCH",source);
            for(String path:folded.keySet())for(int i=path.indexOf('/');i>=0;i=path.indexOf('/',i+1))if(Boolean.FALSE.equals(folded.get(path.substring(0,i))))bad("ZIP_FILE_DIRECTORY_COLLISION",path);
            return names;
        }catch(EOFException e){throw new InputRejectedException(INCOMPLETE_INPUT,"ZIP_TRUNCATED",source,"Truncated ZIP directory");}
    }
}
