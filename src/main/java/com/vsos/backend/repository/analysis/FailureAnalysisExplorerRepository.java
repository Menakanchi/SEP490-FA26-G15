package com.vsos.backend.repository.analysis;

import com.vsos.backend.common.Json;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import org.springframework.stereotype.Repository;

import java.util.*;

/** Read-only explorer. Only current, verified producer-backed reports contribute to classification. */
@Repository
public class FailureAnalysisExplorerRepository {
    private final Db db;

    public FailureAnalysisExplorerRepository(Db db) { this.db = db; }

    private static final String DOC = "CONVERT(rep.payload_bytes USING utf8mb4)";
    private static final String META = "CONVERT(rep.metadata_bytes USING utf8mb4)";
    private static String safeJson(String doc) {
        return "(CASE WHEN JSON_VALID(" + doc + ") THEN " + doc + " ELSE NULL END)";
    }
    private static String field(String doc, String path) {
        return "NULLIF(JSON_UNQUOTE(JSON_EXTRACT(" + safeJson(doc) + ", '$." + path + "')), 'null')";
    }
    private static final String REPORTS = "WITH ranked_reports AS (SELECT r.id AS run_id,rep.id AS report_id,rep.execution_id,"
            + DOC + " AS document, ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY rep.created_at DESC,rep.id DESC) AS rn "
            // Start from reports and look up the identified run by primary key. Joining
            // project runs to every report before extracting the run ID is quadratic.
            + "FROM fa_json_reports rep STRAIGHT_JOIN simulation_runs r ON r.id=CAST(" + field(META, "run_identity.run_id.value") + " AS UNSIGNED) "
            + "AND rep.project_id=r.project_id AND " + field(META, "run_identity.run_id.value") + "=CAST(r.id AS CHAR) "
            + "JOIN fa_json_sources src ON src.project_id=r.project_id "
            + "AND src.dedupe_key=SHA2(CONCAT('module2-result/v1:',r.project_id,':',r.id,':',r.attempt),256) "
            + "JOIN fa_json_sources analyzed ON analyzed.project_id=rep.project_id AND analyzed.id=rep.source_id "
            + "JOIN fa_json_executions ex ON ex.project_id=rep.project_id AND ex.id=rep.execution_id AND ex.source_id=analyzed.id "
            + "WHERE r.project_id=? AND r.status='COMPLETED' AND SHA2(src.payload_bytes,256)=src.payload_sha256 "
            + "AND SHA2(src.metadata_bytes,256)=src.metadata_sha256 AND SHA2(rep.payload_bytes,256)=rep.payload_sha256 "
            + "AND SHA2(rep.metadata_bytes,256)=rep.metadata_sha256 AND SHA2(ex.payload_bytes,256)=ex.payload_sha256 "
            + "AND SHA2(ex.metadata_bytes,256)=ex.metadata_sha256 AND SHA2(analyzed.payload_bytes,256)=analyzed.payload_sha256 "
            + "AND SHA2(analyzed.metadata_bytes,256)=analyzed.metadata_sha256 AND JSON_VALID(" + DOC + ") AND JSON_VALID(" + META + ") "
            + "AND JSON_VALID(CONVERT(analyzed.metadata_bytes USING utf8mb4)) "
            + "AND JSON_VALID(CONVERT(src.metadata_bytes USING utf8mb4)) AND JSON_VALID(CONVERT(ex.metadata_bytes USING utf8mb4)) "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "id") + "=src.id "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "resource_kind") + "='SOURCE' "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "project_id") + "=CAST(r.project_id AS CHAR) "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "byte_sha256") + "=src.payload_sha256 "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "database_input.origin") + "='MODULE2_RESULT_DATABASE' "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "database_input.run_id") + "=CAST(r.id AS CHAR) "
            + "AND " + field("CONVERT(src.metadata_bytes USING utf8mb4)", "database_input.attempt") + "=CAST(r.attempt AS CHAR) "
            + "AND " + field("CONVERT(ex.metadata_bytes USING utf8mb4)", "id") + "=ex.id "
            + "AND " + field("CONVERT(ex.metadata_bytes USING utf8mb4)", "resource_kind") + "='EXECUTION' "
            + "AND " + field("CONVERT(ex.metadata_bytes USING utf8mb4)", "source_id") + "=ex.source_id "
            + "AND " + field("CONVERT(ex.metadata_bytes USING utf8mb4)", "project_id") + "=CAST(r.project_id AS CHAR) "
            + "AND " + field("CONVERT(ex.metadata_bytes USING utf8mb4)", "byte_sha256") + "=ex.payload_sha256 "
            + "AND " + field(META, "id") + "=rep.id AND " + field(META, "source_id") + "=rep.source_id "
            + "AND " + field(META, "execution_id") + "=rep.execution_id AND " + field(META, "resource_kind") + "='REPORT' "
            + "AND " + field(META, "project_id") + "=CAST(r.project_id AS CHAR) AND " + field(META, "byte_sha256") + "=rep.payload_sha256 "
            + "AND " + field("CONVERT(analyzed.metadata_bytes USING utf8mb4)", "byte_sha256") + "=analyzed.payload_sha256 "
            + "AND " + field(META, "source_sha256") + " IN (src.payload_sha256,analyzed.payload_sha256) "
            + "AND (analyzed.id=src.id OR (" + field("CONVERT(analyzed.metadata_bytes USING utf8mb4)", "database_input.origin")
            + "='MODULE2_RESULT_DATABASE' AND (JSON_CONTAINS(JSON_EXTRACT(" + safeJson("CONVERT(analyzed.metadata_bytes USING utf8mb4)") + ",'$.database_input.members'), "
            + "JSON_OBJECT('run_id',r.id,'source_id',src.id,'byte_sha256',src.payload_sha256)) OR ("
            + "JSON_UNQUOTE(JSON_EXTRACT(" + safeJson("CONVERT(analyzed.metadata_bytes USING utf8mb4)") + ",CONCAT('$.database_input.members.\"',r.id,'\".source_id')))=src.id "
            + "AND JSON_UNQUOTE(JSON_EXTRACT(" + safeJson("CONVERT(analyzed.metadata_bytes USING utf8mb4)") + ",CONCAT('$.database_input.members.\"',r.id,'\".source_sha256')))=src.payload_sha256)))) "
            + "AND " + field(META, "run_identity.project_id.value") + "=CAST(r.project_id AS CHAR) "
            + "AND " + field(META, "run_identity.run_id.value") + "=CAST(r.id AS CHAR) "
            + "AND " + field(META, "run_identity.scenario_id.value") + "=CAST(r.scenario_id AS CHAR) "
            + "AND " + field(META, "run_identity.variant_id.value") + "=CAST(r.scenario_version_id AS CHAR) "
            + "AND " + field(META, "run_identity.attempt.value") + "=CAST(r.attempt AS CHAR) "
            + "AND " + field(META, "run_identity.repetition.value") + "=CAST(r.repetition AS CHAR) "
            + "AND " + field(META, "run_identity.seed.value") + "=CAST(r.random_seed AS CHAR) "
            + "AND " + field(META, "run_identity.aeb_mode.value") + "=r.aeb_mode "
            + "AND " + field(META, "run_identity.aeb_version_id.value") + "=CAST(r.aeb_version_id AS CHAR) "
            + "AND " + field(META, "run_identity.carla_vehicle_model_id.value") + "=CAST(r.carla_vehicle_model_id AS CHAR) "
            + "AND " + field(META, "run_identity.purpose.value") + "=r.purpose "
            + "AND JSON_VALID(CONVERT(src.payload_bytes USING utf8mb4)) "
            + "AND " + field("CONVERT(src.payload_bytes USING utf8mb4)", "dataset.identity.simulator") + "=r.simulator_version), "
            + "report_projection AS (SELECT *,'UNVERIFIED' AS context_freshness," + field("document", "report.functional_assessment.value") + " AS assessment, "
            + field("document", "report.functional_assessment.status") + " AS assessment_status, "
            + "CASE WHEN " + field("document", "report.physical_outcome.status") + " IN ('OBSERVED','DERIVED') THEN "
            + field("document", "report.physical_outcome.value") + " ELSE NULL END AS physical_outcome, "
            + "JSON_EXTRACT(document,'$.report.failure_candidates[*].type') AS failure_types, "
            + "JSON_EXTRACT(document,'$.report.failure_candidates[*].status') AS failure_statuses, "
            + "JSON_EXTRACT(document,'$.report.root_cause_hypotheses[*].type') AS cause_types, "
            + "JSON_EXTRACT(document,'$.report.root_cause_hypotheses[*].status') AS cause_statuses "
            + "FROM ranked_reports WHERE rn=1), "
            + "run_projection AS (SELECT r.*,v.version_no,v.weather,v.ego_speed_kmh,v.initial_distance_m,v.road_friction, "
            + "s.code,s.name,s.category,p.report_id,p.execution_id,p.document,p.physical_outcome,p.failure_types,p.failure_statuses,p.cause_types,p.cause_statuses, "
            + "CASE WHEN r.aeb_mode='OFF' THEN 'NOT_APPLICABLE' WHEN p.report_id IS NULL THEN 'NOT_ANALYZED' "
            + "WHEN JSON_CONTAINS(p.failure_statuses,JSON_QUOTE('SUSPECTED')) THEN 'SUSPECTED' ELSE 'UNKNOWN' END AS classification "
            + "FROM simulation_runs r JOIN scenario_versions v ON v.id=r.scenario_version_id AND v.scenario_id=r.scenario_id "
            + "JOIN scenarios s ON s.id=r.scenario_id AND s.project_id=r.project_id LEFT JOIN report_projection p ON p.run_id=r.id "
            + "WHERE r.project_id=? ) ";

    private static String searchScenarios() {
        return " AND (s.name LIKE ? OR s.code LIKE ? OR CAST(s.id AS CHAR)=? OR EXISTS "
                + "(SELECT 1 FROM scenario_versions sv WHERE sv.scenario_id=s.id AND CAST(sv.id AS CHAR)=?) OR EXISTS "
                + "(SELECT 1 FROM simulation_runs sr WHERE sr.project_id=s.project_id AND sr.scenario_id=s.id AND CAST(sr.id AS CHAR)=?))";
    }

    public Map<String,Object> scenarios(long project, String q, int limit, int offset, String sort) {
        paging(limit, offset, sort);
        String where = " WHERE s.project_id=?";
        List<Object> args = new ArrayList<>(List.of(project,project,project));
        if (q != null && !q.isBlank()) {
            where += searchScenarios();
            String term=q.trim(); args.add("%"+term+"%"); args.add("%"+term+"%"); args.add(term); args.add(term); args.add(term);
        }
        String grouped = "SELECT s.id AS scenario_id,s.code,s.name,s.category, "
                + "(SELECT COUNT(*) FROM scenario_versions v WHERE v.scenario_id=s.id AND v.source='GENERATED') AS variant_count, "
                + "COUNT(p.report_id) AS analyzed_count,NULL AS confirmed_count, "
                + "COALESCE(SUM(p.classification='SUSPECTED'),0) AS suspected_count,NULL AS no_failure_count, "
                + "COALESCE(SUM(p.classification='UNKNOWN'),0) AS unknown_count FROM scenarios s "
                + "LEFT JOIN run_projection p ON p.scenario_id=s.id AND p.aeb_mode='ON' AND p.report_id IS NOT NULL "
                + where + " GROUP BY s.id,s.code,s.name,s.category";
        List<Object> pageArgs = new ArrayList<>(args); pageArgs.add(limit); pageArgs.add(offset);
        String aggregate="SELECT grouped_scenarios.*, COUNT(*) OVER () AS summary_scenario_count, "
                + "SUM(variant_count) OVER () AS summary_variant_count, SUM(analyzed_count) OVER () AS summary_analyzed_count, "
                + "SUM(suspected_count) OVER () AS summary_suspected_count, SUM(unknown_count) OVER () AS summary_unknown_count "
                + "FROM ("+grouped+") grouped_scenarios";
        List<Row> rows=db.list(REPORTS+aggregate+" ORDER BY scenario_id " + order(sort) + " LIMIT ? OFFSET ?",pageArgs.toArray());
        List<Map<String,Object>> items=rows.stream().map(r -> {
            Map<String,Object> item=new LinkedHashMap<>(r.asMap());
            item.keySet().removeIf(key -> key.startsWith("summary_"));
            return item;
        }).toList();
        List<Object> countArgs = new ArrayList<>(); countArgs.add(project);
        if (q != null && !q.isBlank()) {String term=q.trim(); countArgs.add("%"+term+"%");countArgs.add("%"+term+"%");countArgs.add(term);countArgs.add(term);countArgs.add(term);}
        long total=((Number)db.scalar("SELECT COUNT(*) FROM scenarios s"+where,countArgs.toArray())).longValue();
        Row summary=rows.isEmpty() && total>0 ? db.first(REPORTS+"SELECT COUNT(*) AS scenario_count,COALESCE(SUM(variant_count),0) AS variant_count, "
                +"COALESCE(SUM(analyzed_count),0) AS analyzed_count,NULL AS confirmed_count, "
                +"COALESCE(SUM(suspected_count),0) AS suspected_count,NULL AS no_failure_count, "
                +"COALESCE(SUM(unknown_count),0) AS unknown_count FROM ("+grouped+") grouped_scenarios",args.toArray()) : null;
        Map<String,Object> totals=new LinkedHashMap<>();
        for(String key:List.of("scenario_count","variant_count","analyzed_count","suspected_count","unknown_count"))
            totals.put(key,!rows.isEmpty()?rows.get(0).get("summary_"+key):summary!=null?summary.get(key):0L);
        totals.put("confirmed_count",null);totals.put("no_failure_count",null);
        Map<String,Object> response=envelope(project, items,total,limit,offset);response.put("summary",totals);return response;
    }

    public Map<String,Object> runs(long project,long scenario,String q,Long variant,Long run,String mode,String classification,
                                   String type,String cause,String physical,int limit,int offset,String sort) {
        return runs(project,scenario,q,variant,run,mode,classification,type,cause,physical,limit,offset,sort,null,null,null,null,null);
    }

    public Map<String,Object> runs(long project,long scenario,String q,Long variant,Long run,String mode,String classification,
                                   String type,String cause,String physical,int limit,int offset,String sort,String weather,
                                   Double egoMin,Double egoMax,Double distanceMin,Double distanceMax) {
        paging(limit,offset,sort);
        if (db.first("SELECT id FROM scenarios WHERE project_id=? AND id=?",project,scenario)==null)
            throw new FailureAnalysisException(404,"DB_SELECTION_NOT_FOUND");
        String where=" WHERE p.scenario_id=?"; List<Object> args=new ArrayList<>(List.of(project,project,scenario));
        if(q!=null&&!q.isBlank()) {String term=q.trim();where+=" AND (p.name LIKE ? OR p.code LIKE ? OR CAST(p.scenario_id AS CHAR)=? OR CAST(p.scenario_version_id AS CHAR)=? OR CAST(p.id AS CHAR)=?)";
            args.add("%"+term+"%");args.add("%"+term+"%");args.add(term);args.add(term);args.add(term);}
        if(variant!=null){where+=" AND p.scenario_version_id=?";args.add(variant);}
        if(run!=null){where+=" AND p.id=?";args.add(run);}
        if(mode!=null&&!mode.isBlank()){if(!Set.of("ON","OFF").contains(mode))throw new FailureAnalysisException(400,"FA_REQUEST_ARGUMENT_INVALID");where+=" AND p.aeb_mode=?";args.add(mode);}
        if(classification!=null&&!classification.isBlank()){
            if("CONFIRMED".equals(classification))throw new FailureAnalysisException(409,"FA_CONTEXT_CURRENTNESS_UNAVAILABLE");
            if(!Set.of("SUSPECTED","UNKNOWN","NOT_APPLICABLE","NOT_ANALYZED").contains(classification))throw new FailureAnalysisException(400,"FA_REQUEST_ARGUMENT_INVALID");where+=" AND p.classification=?";args.add(classification);}
        if(type!=null&&!type.isBlank()){where+=" AND JSON_CONTAINS(p.failure_types,JSON_QUOTE(?))";args.add(type);}
        if(cause!=null&&!cause.isBlank()){where+=" AND JSON_CONTAINS(p.cause_types,JSON_QUOTE(?))";args.add(cause);}
        if(physical!=null&&!physical.isBlank()){where+=" AND COALESCE(p.physical_outcome,'UNKNOWN')=?";args.add(physical);}
        if(weather!=null&&!weather.isBlank()) {
            if(!Set.of("CLEAR","CLOUDY","RAIN","HEAVY_RAIN","FOG").contains(weather))throw new FailureAnalysisException(400,"FA_REQUEST_ARGUMENT_INVALID");
            where+=" AND JSON_UNQUOTE(JSON_EXTRACT(p.run_config_json,'$.weather'))=?";args.add(weather);
        }
        if((egoMin!=null&&!Double.isFinite(egoMin))||(egoMax!=null&&!Double.isFinite(egoMax))
                ||(distanceMin!=null&&!Double.isFinite(distanceMin))||(distanceMax!=null&&!Double.isFinite(distanceMax))
                ||(egoMin!=null&&egoMax!=null&&egoMin>egoMax)||(distanceMin!=null&&distanceMax!=null&&distanceMin>distanceMax))
            throw new FailureAnalysisException(400,"FA_REQUEST_ARGUMENT_INVALID");
        for(var bound:List.of(new Object[]{"ego_speed_kmh",">=",egoMin},new Object[]{"ego_speed_kmh","<=",egoMax},
                new Object[]{"initial_distance_m",">=",distanceMin},new Object[]{"initial_distance_m","<=",distanceMax})) {
            if(bound[2]!=null) {
                String expr="JSON_EXTRACT(p.run_config_json,'$."+bound[0]+"')";
                where+=" AND JSON_TYPE("+expr+") IN ('INTEGER','DOUBLE','DECIMAL') AND "+expr+" "+bound[1]+" ?";args.add(bound[2]);
            }
        }
        String select="SELECT p.id AS run_id,p.project_id,p.scenario_id,p.scenario_version_id,p.version_no,p.random_seed,p.repetition,p.attempt,p.aeb_mode,p.status,p.simulator_type,p.simulator_version, "
                + "p.report_id,p.execution_id,p.classification,COALESCE(p.physical_outcome,'UNKNOWN') AS physical_outcome,p.failure_types,p.failure_statuses,p.cause_types,p.cause_statuses";
        for(String metric:List.of("rms_jerk_mps3","impact_speed_mps","stopping_distance_m")) {
            String base="report.objectives."+metric;
            select+=","+field("p.document",base+".canonical_value.value")+" AS "+metric+"_value";
            select+=","+field("p.document",base+".canonical_value.status")+" AS "+metric+"_status";
            select+=","+field("p.document",base+".canonical_value.unit")+" AS "+metric+"_unit";
            select+=","+field("p.document",base+".canonical_applicability")+" AS "+metric+"_applicability";
        }
        List<Object> pageArgs=new ArrayList<>(args);pageArgs.add(limit);pageArgs.add(offset);
        List<Map<String,Object>> items=db.list(REPORTS+select+" FROM run_projection p"+where+" ORDER BY p.id "+order(sort)+" LIMIT ? OFFSET ?",pageArgs.toArray())
                .stream().map(FailureAnalysisExplorerRepository::runItem).toList();
        long total=((Number)db.scalar(REPORTS+"SELECT COUNT(*) FROM run_projection p"+where,args.toArray())).longValue();
        return envelope(project,items,total,limit,offset);
    }

    public Map<String,Object> variants(long project,long scenario,String q,boolean withoutRuns,int limit,int offset,String sort) {
        paging(limit,offset,sort);
        if(db.first("SELECT id FROM scenarios WHERE project_id=? AND id=?",project,scenario)==null)
            throw new FailureAnalysisException(404,"DB_SELECTION_NOT_FOUND");
        String from=" FROM scenario_versions v WHERE v.scenario_id=? AND v.source='GENERATED'";
        List<Object> args=new ArrayList<>(List.of(scenario));
        if(q!=null&&!q.isBlank()) {
            String term=q.trim();
            from+=" AND (CAST(v.id AS CHAR)=? OR CAST(v.version_no AS CHAR)=? OR EXISTS "
                    +"(SELECT 1 FROM scenarios s WHERE s.id=v.scenario_id AND s.project_id=? "
                    +"AND (s.name LIKE ? OR s.code LIKE ? OR CAST(s.id AS CHAR)=?)))";
            args.add(term);args.add(term);args.add(project);args.add("%"+term+"%");args.add("%"+term+"%");args.add(term);
        }
        if(withoutRuns)from+=" AND NOT EXISTS (SELECT 1 FROM simulation_runs r WHERE r.project_id=? AND r.scenario_id=v.scenario_id AND r.scenario_version_id=v.id)";
        if(withoutRuns)args.add(project);
        long total=((Number)db.scalar("SELECT COUNT(*)"+from,args.toArray())).longValue();
        List<Object> pageArgs=new ArrayList<>();pageArgs.add(project);pageArgs.addAll(args);pageArgs.add(limit);pageArgs.add(offset);
        var items=db.list("SELECT v.id AS scenario_version_id,v.scenario_id,v.version_no,v.weather,v.ego_speed_kmh,v.road_friction,v.initial_distance_m, "
                +"(SELECT COUNT(*) FROM simulation_runs r WHERE r.project_id=? AND r.scenario_id=v.scenario_id AND r.scenario_version_id=v.id) AS run_count"
                +from+" ORDER BY v.id "+order(sort)+" LIMIT ? OFFSET ?",pageArgs.toArray()).stream().map(r -> (Map<String,Object>)new LinkedHashMap<>(r.asMap())).toList();
        return envelope(project,items,total,limit,offset);
    }

    private static Map<String,Object> runItem(Row row) {
        Map<String,Object> result=new LinkedHashMap<>(row.asMap());
        result.put("analysis_status",row.str("report_id")==null?"NOT_ANALYZED":"ANALYZED");
        result.put("currentness_scope","PRODUCER_IDENTITY_ATTEMPT_AND_BYTES");
        result.put("context_freshness",row.str("report_id")==null?"NOT_AVAILABLE":"UNVERIFIED");
        result.put("failure_candidates",claims(row.str("failure_types"),row.str("failure_statuses")));
        result.put("root_cause_hypotheses",claims(row.str("cause_types"),row.str("cause_statuses")));
        for(String raw:List.of("failure_types","failure_statuses","cause_types","cause_statuses"))result.remove(raw);
        Map<String,Object> objectives=new LinkedHashMap<>();
        for(String key:List.of("rms_jerk_mps3","impact_speed_mps","stopping_distance_m")) {
            String value=row.str(key+"_value");
            Double number=null;try {if(value!=null)number=Double.valueOf(value);}catch(NumberFormatException ignored){/* Invalid stays unavailable. */}
            Map<String,Object> o=new LinkedHashMap<>();o.put("value",number);
            o.put("status",row.str(key+"_status"));o.put("unit",row.str(key+"_unit"));o.put("applicability",row.str(key+"_applicability"));
            objectives.put(key,o);for(String suffix:List.of("_value","_status","_unit","_applicability"))result.remove(key+suffix);
        }
        result.put("objectives",objectives);return result;
    }
    private static List<Map<String,Object>> claims(String types,String statuses) {
        if(types==null)return List.of();
        List<?> t=Json.parseList(types);List<?> s=statuses==null?List.of():Json.parseList(statuses);
        List<Map<String,Object>> out=new ArrayList<>();for(int i=0;i<t.size();i++) {Map<String,Object> item=new LinkedHashMap<>();item.put("type",t.get(i));item.put("status",i<s.size()?s.get(i):null);out.add(item);}return out;
    }
    private static Map<String,Object> envelope(long project,List<Map<String,Object>> items,long total,int limit,int offset){Map<String,Object> out=new LinkedHashMap<>();out.put("project_id",project);out.put("items",items);out.put("total",total);out.put("limit",limit);out.put("offset",offset);return out;}
    private static void paging(int limit,int offset,String sort){if(limit<1||limit>100||offset<0||offset>100000||!Set.of("id_asc","id_desc").contains(sort))throw new FailureAnalysisException(400,"PAGINATION_INVALID");}
    private static String order(String sort){return "id_asc".equals(sort)?"ASC":"DESC";}
}
