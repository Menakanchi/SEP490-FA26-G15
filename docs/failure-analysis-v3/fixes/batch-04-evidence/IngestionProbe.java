import com.vsos.core.common.MiniJson;
import com.vsos.core.failureanalysis.*;
import java.nio.file.*;
import java.lang.management.*;
import java.util.*;

class IngestionProbe {
    public static void main(String[] args)throws Exception {
        long start=System.nanoTime();List<Evidence.Run> runs=new ArrayList<>();
        Map<String,Object> counters=new LinkedHashMap<>();
        try(var reader=new RawArtifactAdapter(Path.of(args[0]))){for(String d:reader.runDirectories())runs.add(reader.read(d));
            try{counters.put("counters",RawArtifactAdapter.class.getMethod("resourceCounters").invoke(reader));}catch(NoSuchMethodException ignored){counters.put("counters","NOT_AVAILABLE_BEFORE_FIX");}}
        long heapPeak=ManagementFactory.getMemoryPoolMXBeans().stream().filter(p->p.getType()==MemoryType.HEAP).mapToLong(p->p.getPeakUsage().getUsed()).sum();
        System.out.println(MiniJson.write(Map.of("runs",runs.size(),"elapsed_ms",(System.nanoTime()-start)/1000000,
                "heap_pool_peaks_sum_bytes",heapPeak,"heap_used_bytes",ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed(),
                "resource_counters",counters,"scope","INGEST_ALL_RUNS_RETAINED; SUM_OF_POOL_PEAKS_NOT_CONCURRENT_RSS")));
    }
}
