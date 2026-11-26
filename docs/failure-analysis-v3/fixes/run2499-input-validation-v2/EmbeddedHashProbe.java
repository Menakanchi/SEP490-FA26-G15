import com.vsos.core.failureanalysis.*;
import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
/** Checks serializer compatibility, not authenticity. Python profile is the declared authority. */
public final class EmbeddedHashProbe {
    @SuppressWarnings("unchecked") public static void main(String[] args)throws Exception {
        Path input=Path.of(args[0]);var budget=new BoundedInput(InputResourcePolicy.defaults());
        Object root=budget.parse(budget.read(input,input.toString()),"application/json",input.toString());
        List<Object> rows=new ArrayList<>();
        for(String name:List.of("time_series.frames","time_series.ground_truth","collisions.events","sensors.summary")){
            Object value=at(root,"/dataset/"+name.replace('.','/'));
            if(name.startsWith("time_series"))value=obj("columns",at(value,"/columns"),"rows",at(value,"/rows"));
            String actual=sha256(MiniJson.write(value)),expected=(String)at(root,"/dataset/provenance/embedded_payloads/"+name);
            rows.add(obj("payload",name,"declared_python_digest",expected,"existing_minijson_digest",actual,"existing_java_serializer_matches",actual.equals(expected)));
        }
        String text=MiniJson.write(obj("scope","SERIALIZER_COMPATIBILITY_NOT_FILE_VALIDITY","payloads",rows));
        Files.writeString(Path.of(args[1]),text,StandardOpenOption.CREATE_NEW);System.out.println(text);
    }
}
