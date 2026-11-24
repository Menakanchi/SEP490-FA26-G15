import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import jakarta.validation.Validation;
import com.vsos.backend.controller.optimization.OptimizationController.OptimizationRequest;
import com.vsos.backend.service.analysis.CollectionDatasetExport;
import com.vsos.backend.service.optimization.OptimizationService;
import com.vsos.backend.repository.common.Row;
import com.vsos.core.failureanalysis.*;
import com.vsos.core.mobo.MoboTrial;
import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Actual checked-out request DTO, no Spring server, service invocation or optimizer. */
public final class ConsumerDtoProbe {
    public static void main(String[] args)throws Exception {
        Path file=Path.of(args[0]);var budget=new BoundedInput(InputResourcePolicy.defaults());byte[] bytes=budget.read(file,file.toString());
        var decoded=budget.parse(bytes,"application/json",file.toString());
        ObjectMapper springBuilder=Jackson2ObjectMapperBuilder.json().build();
        OptimizationRequest request=springBuilder.readValue(bytes,OptimizationRequest.class);
        var components=OptimizationRequest.class.getRecordComponents();List<String> fields=new ArrayList<>();
        for(var component:components){JsonProperty prop=component.getAccessor().getAnnotation(JsonProperty.class);fields.add(prop==null?component.getName():prop.value());}
        int violations;try(var factory=Validation.buildDefaultValidatorFactory()){violations=factory.getValidator().validate(request).size();}
        String strict;try{new ObjectMapper().readValue(bytes,OptimizationRequest.class);strict="ACCEPTED";}
        catch(UnrecognizedPropertyException e){strict="REJECTED_UNKNOWN_FIELD:"+e.getPropertyName();}
        Map<String,Object> roundtrip=springBuilder.readValue(springBuilder.writeValueAsString(request),Map.class);
        var input=(Map<?,?>)decoded;List<String> critical=List.of("optimization_run_ids","validation_run_ids","variant_ids","collection_dataset","members","content_digest","handoff_ready");
        List<String> lost=critical.stream().filter(input::containsKey).filter(k->!roundtrip.containsKey(k)).toList();
        Map<Long,Row> exportedRows=new TreeMap<>();
        for(Object collection:(List<?>)at(decoded,"/collection_dataset/source_collections"))for(Object item:(List<?>)at(collection,"/runs"))
            exportedRows.put(((Number)at(item,"/run_id")).longValue(),CollectionDatasetExport.exportedRow((Map<String,Object>)at(item,"/result")));
        List<Row> proposedRows=((List<?>)input.get("optimization_run_ids")).stream().map(x->exportedRows.get(((Number)x).longValue())).toList();
        var constructor=OptimizationService.class.getConstructors()[0];
        var service=(OptimizationService)constructor.newInstance(new Object[constructor.getParameterCount()]);
        var statsMethod=OptimizationService.class.getDeclaredMethod("computeStats",Collection.class);statsMethod.setAccessible(true);
        var referenceRates=(OptimizationService.BaselineStats)statsMethod.invoke(service,proposedRows);
        var helper=OptimizationService.class.getDeclaredMethod("evaluateCandidateRuns",List.class,OptimizationService.BaselineStats.class);helper.setAccessible(true);
        var metrics=(OptimizationService.CandidateTrialMetrics)helper.invoke(service,proposedRows,referenceRates);
        Map<String,Object> result=obj("scope","OFFLINE_ACTUAL_REQUEST_DTO_DESERIALIZATION_NOT_API_DISPATCH",
            "input_sha256_bytes",sha256(bytes),"request_class",OptimizationRequest.class.getName(),"declared_request_json_fields",fields,
            "strict_default_object_mapper",strict,"spring_builder_default_unknown_properties_disabled",!springBuilder.isEnabled(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES),
            "spring_builder_deserialization","ACCEPTED_KNOWN_REQUEST_FIELDS_ONLY","bean_validation_violations",violations,
            "scenario_id_received",request.scenarioId(),"base_aeb_version_id_received",request.baseAebVersionId(),"search_space_received",request.searchSpace(),
            "critical_dataset_fields_discarded",lost,"dataset_id_supported",fields.contains("dataset_id"),"frozen_partition_supported",fields.contains("optimization_run_ids")&&fields.contains("validation_run_ids"),
            "engine_input",Arrays.stream(MoboTrial.class.getRecordComponents()).map(x->x.getName()+":"+x.getType().getSimpleName()).toList(),
            "actual_consumer_aggregation_probe",obj("scope","SAME_EXPORTED_ROWS_OFFLINE_COMPARISON_NOT_BASELINE_OR_TRIAL_OBSERVATION",
                "run_ids",input.get("optimization_run_ids"),"consumer_helper_values",metrics.asMap(),
                "canonical_values",at(decoded,"/collection_dataset/proposed_selection/optimization_recorded_aggregate"),
                "exact_canonical_parity",false,"divergence","Consumer rounds means to3 decimals; canonical means retained unchanged"),
            "exact_cohort_consumed",false,"dispatch_allowed",false,"optimizer_called",false,"database_accessed",false);
        Files.writeString(Path.of(args[1]),MiniJson.write(result),StandardOpenOption.CREATE_NEW);System.out.println(MiniJson.write(result));
        if(violations!=0||!Long.valueOf(26).equals(request.scenarioId())||lost.size()!=critical.size())throw new AssertionError("Unexpected current consumer contract");
    }
}
