package com.vsos.backend.service.optimization;







import com.vsos.backend.common.audit.AuditLog;
import com.vsos.core.mobo.MoboEngine;
import com.vsos.core.mobo.MoboProposal;
import com.vsos.core.mobo.MoboTrial;
import com.vsos.core.mobo.ParameterBounds;
import com.vsos.backend.service.regression.RegressionService;



import com.vsos.backend.common.Vs.InvalidRequestException;



import com.vsos.backend.common.Vs.NotFoundException;



import org.slf4j.Logger;



import org.slf4j.LoggerFactory;



import org.springframework.beans.factory.annotation.Qualifier;



import org.springframework.core.task.TaskExecutor;



import org.springframework.stereotype.Service;



import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
















import java.math.BigDecimal;



import java.math.RoundingMode;






import java.nio.file.Path;



import java.time.LocalDateTime;



import java.util.*;



import java.util.concurrent.ConcurrentHashMap;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.RunEvidence;
import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.backend.common.Vs;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.aeb.AebService;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.service.analysis.AnalysisService;










/**



 * Service tối ưu hóa đa mục tiêu cho 4 tham số AEB bằng Multi-Objective Bayesian Optimization (MOBO).



 * <p>



 * 4 Decision Variables:



 * 1. TTC_THRESHOLD (s)



 * 2. BRAKE_ACTIVATION_DELAY (s)



 * 3. BRAKE_BUILDUP_RATE (m/s³)



 * 4. MAX_DECELERATION (m/s²)



 * <p>



 * 3 Objectives (tất cả đều MINIMIZE):



 * 1. Braking Comfort: RMS Jerk (m/s³)



 * 2. Collision Mitigation: Relative Impact Speed (m/s)



 * 3. Stopping Performance: Stopping Distance (m)



 */



@Service



public class OptimizationService {







    private static final Logger log = LoggerFactory.getLogger(OptimizationService.class);
    /** Seed cố định của bộ đề xuất MOBO: cùng danh sách trial cho cùng đề xuất. */
    private static final long MOBO_SEED = 42L;







    private final Db db;



    private final Queries queries;



    private final RunService runService;



    private final AebService aebService;



    private final RegressionService regressionService;



    private final FamilyService familyService;



    private final VehicSimProperties props;



    private final TaskExecutor executor;
    private final AnalysisService analysis;







    // Quản lý token huỷ cho các run đang chạy



    private final Set<Long> cancelledRunIds = ConcurrentHashMap.newKeySet();







    public OptimizationService(



            Db db,



            Queries queries,



            RunService runService,



            AebService aebService,



            RegressionService regressionService,



            FamilyService familyService,



            VehicSimProperties props,



            @Qualifier("simulationExecutor") TaskExecutor executor,
            AnalysisService analysis) {



        this.db = db;



        this.queries = queries;



        this.runService = runService;



        this.aebService = aebService;



        this.regressionService = regressionService;



        this.familyService = familyService;



        this.props = props;



        this.executor = executor;
        this.analysis = analysis;



    }







    Path repoRoot() {



        return Path.of(System.getProperty("user.dir"));



    }







    /**



     * Tạo và khởi động một Optimization Run mới.



     */



    @Transactional
    public long createAndStartRun(
            long projectId,
            long userId,
            long scenarioId,
            Long baseAebVersionId,
            Integer maxTrials,
            Integer nInitialPoints,
            String customSearchSpaceJson,
            String customObjectiveConfigJson,
            String name) {
        return createAndStartRun(projectId, userId, scenarioId, baseAebVersionId, maxTrials, nInitialPoints,
                customSearchSpaceJson, customObjectiveConfigJson, name, null);
    }

    @Transactional
    public long createAndStartRun(
            long projectId,
            long userId,
            long scenarioId,
            Long baseAebVersionId,
            Integer maxTrials,
            Integer nInitialPoints,
            String customSearchSpaceJson,
            String customObjectiveConfigJson,
            String name,
            String simulatorType) {
        return createAndStartRun(projectId, userId, scenarioId, baseAebVersionId, maxTrials, nInitialPoints,
                customSearchSpaceJson, customObjectiveConfigJson, name, simulatorType, null, null);
    }

    @Transactional
    public long createAndStartRun(long projectId, long userId, long scenarioId, Long baseAebVersionId,
            Integer maxTrials, Integer nInitialPoints, String customSearchSpaceJson, String customObjectiveConfigJson,
            String name, String simulatorType, Long datasetId, String datasetDigest) {







        Row project = db.first("SELECT * FROM projects WHERE id = ?", projectId);



        if (project == null) {



            throw new NotFoundException("project");



        }



        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);



        if (scenario == null) {



            throw new NotFoundException("scenario family");



        }







        Map<String,Object> handoff = datasetId == null ? null : analysis.handoff(projectId, datasetId);
        if (datasetId == null && datasetDigest != null)
            throw new InvalidRequestException("Analysis dataset ID is required with its digest");
        if (handoff != null) {
            if (!Objects.equals(datasetDigest, handoff.get("dataset_digest")))
                throw new InvalidRequestException("Analysis dataset checksum changed; reload the handoff");
            long frozenScenario = ((Number)Json.asMap(handoff.get("scenario")).get("id")).longValue();
            long frozenBaseline = ((Number)Json.asMap(handoff.get("baseline")).get("id")).longValue();
            if (scenarioId != frozenScenario || baseAebVersionId != null && baseAebVersionId != frozenBaseline)
                throw new InvalidRequestException("Analysis dataset belongs to another scenario or baseline");
            baseAebVersionId = frozenBaseline;
        }
        Row baseVersion = baseAebVersionId != null



                ? db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", baseAebVersionId, projectId)



                : queries.baselineVersion(projectId);



        if (baseVersion == null) {



            throw new NotFoundException("base AEB version (baseline)");



        }







        Row vehicle = handoff == null ? queries.activeVehicle(projectId)
                : queries.vehicleById(((Number)Json.asMap(handoff.get("reference")).get("vehicle_id")).longValue());



        if (vehicle == null) {



            throw new NotFoundException("active vehicle model");



        }







        int trialsCount = (maxTrials != null && maxTrials > 0) ? maxTrials : 10;



        int initialCount = (nInitialPoints != null && nInitialPoints > 0) ? Math.min(nInitialPoints, trialsCount) : Math.min(3, trialsCount);







        String runName = (name != null && !name.isBlank()) ? name.strip() : "MOBO Optimization - " + scenario.str("name");







        String searchSpace = (customSearchSpaceJson != null && !customSearchSpaceJson.isBlank())



                ? customSearchSpaceJson



                : Json.write(Map.of(



                        "TTC_THRESHOLD", List.of(0.5, 3.5),



                        "BRAKE_ACTIVATION_DELAY", List.of(0.05, 0.45),



                        "BRAKE_BUILDUP_RATE", List.of(5.0, 20.0),



                        "MAX_DECELERATION", List.of(5.0, 10.0)));







        searchBounds(Json.parseMap(searchSpace));
        String objectiveConfig = (customObjectiveConfigJson != null && !customObjectiveConfigJson.isBlank())



                ? customObjectiveConfigJson



                : Json.write(Map.of(



                        "objectives", List.of("RMS_JERK", "RELATIVE_IMPACT_SPEED", "STOPPING_DISTANCE"),



                        "constraints", Map.of(



                                "collision_rate_pct", Map.of("max", "baseline"),



                                "false_activation_increase_pts", Map.of("max", com.vsos.backend.service.regression.RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS))));







        validateObjectiveConfig(Json.parseMap(objectiveConfig));
        // Simulator: Hỗ trợ chọn KINEMATIC (siêu tốc) hoặc CARLA (3D sensor); mặc định theo cấu hình backend
        String simVersion;
        if ("CARLA".equalsIgnoreCase(simulatorType) || (simulatorType != null && simulatorType.startsWith("carla-"))) {
            if ("carla".equals(props.simulator())) {
                throw new InvalidRequestException("VEHICSIM_SIMULATOR=carla (runner JSON trực tiếp) đã gỡ ở ADR-042: dùng carla-xosc (scripts/dev-carla.ps1)");
            }
            if (!runService.isCarlaConfigured()) {
                throw new InvalidRequestException("Mô phỏng CARLA chưa sẵn sàng. Hãy khởi động CARLA với scripts/dev-carla.ps1 hoặc chọn Mô phỏng Động học (Kinematic).");
            }
            simVersion = runService.configuredSimulator();
        } else if ("KINEMATIC".equalsIgnoreCase(simulatorType) || (simulatorType != null && simulatorType.startsWith("vehicsim-kinematic"))) {
            simVersion = RunService.KINEMATIC_SIMULATOR;
        } else {
            simVersion = runService.simulatorForNewRuns();
        }







        if (handoff != null) {
            String frozenSimulator = String.valueOf(Json.asMap(handoff.get("reference")).get("simulator"));
            if (simulatorType == null) simVersion = frozenSimulator;
            if (!simVersion.equals(frozenSimulator)
                    || simulatorType != null && (simulatorType.startsWith("carla-") || simulatorType.startsWith("vehicsim-kinematic"))
                    && !simulatorType.equals(frozenSimulator)
                    || !(RunService.KINEMATIC_SIMULATOR.equals(simVersion) || runService.configuredSimulator().equals(simVersion)))
                throw new InvalidRequestException("Analysis dataset simulator differs from this campaign or current simulator profile");
            Map<String,Object> config = new LinkedHashMap<>(Json.parseMap(objectiveConfig));
            config.put("dataset_ref", Json.obj("dataset_id", datasetId, "dataset_digest", datasetDigest,
                    "optimization_run_ids", handoff.get("optimization_run_ids"), "validation_run_ids", handoff.get("validation_run_ids")));
            objectiveConfig = Json.write(config);
        }
        long runId = db.insert(



                "INSERT INTO optimization_runs ("



                        + "project_id, scenario_id, base_aeb_version_id, carla_vehicle_model_id, simulator_version, "



                        + "name, algorithm, acquisition_function, n_initial_points, search_space_json, objective_config_json, "



                        + "max_trials, status, created_by_user_id, created_date) "



                        + "VALUES (?,?,?,?,?,?,'MOBO','qEHVI',?,?,?,?,?,?,?)",



                projectId, scenarioId, baseVersion.lng("id"), vehicle.lng("id"), simVersion,



                runName, initialCount, searchSpace, objectiveConfig, trialsCount, "PENDING", userId, Vs.now());







        AuditLog.event("optimization.create", "success", "run_id", runId, "trials", trialsCount);







        if ("inline".equalsIgnoreCase(props.runMode())) {



            executeOptimization(runId);



        } else {



            startAfterCommit(runId);



        }







        return runId;



    }







    /**



     * Vòng lặp điều phối MOBO chạy ngầm:



     * Candidate proposal -> Run simulations on scenario set -> Objective calculation -> Model update -> Next candidate.



     */



    public void executeOptimization(long runId) {



        Row optRun = db.first("SELECT * FROM optimization_runs WHERE id = ?", runId);



        if (optRun == null || !"PENDING".equals(optRun.str("status"))) {



            return;



        }







        long projectId = optRun.lng("project_id");



        long scenarioId = optRun.lng("scenario_id");



        long baseAebVersionId = optRun.lng("base_aeb_version_id");



        long vehicleModelId = optRun.lng("carla_vehicle_model_id");



        long userId = optRun.lng("created_by_user_id");



        int maxTrials = (int) optRun.lng("max_trials");



        int nInitialPoints = optRun.getInt("n_initial_points") != null ? optRun.getInt("n_initial_points") : 3;







        // Only one executor may claim a pending campaign; cancellation and terminal results remain intact.
        if (db.update("UPDATE optimization_runs SET status = 'RUNNING', started_at = ? WHERE id = ? AND status = 'PENDING'", Vs.now(), runId) != 1) {
            return;
        }



        AuditLog.event("optimization.start", "running", "run_id", runId);







        try {



            // 0. Không được đổi bộ mô phỏng giữa lúc tạo và lúc chạy: baseline và trial phải cùng một bộ (không ghép động học với CARLA).
            String optSimulator = optRun.str("simulator_version");
            if (RunService.isCarla(optSimulator) && !optSimulator.equals(runService.configuredSimulator())) {
                throw new IllegalStateException("Đợt tối ưu tạo cho " + optSimulator + " nhưng backend đang chạy " + runService.configuredSimulator()
                        + "; khởi động lại backend đúng chế độ hoặc tạo đợt mới");
            }

            // 1. Tải danh sách biến thể của họ kịch bản



            FrozenCohort frozen = frozenCohort(optRun);
            long baseVersionId = frozen == null ? familyService.latestBaseVersionId(scenarioId) : 0;



            List<Row> variants = frozen == null ? familyService.variantsOf(baseVersionId) : frozen.variants(frozen.optimization());



            if (variants.isEmpty()) {



                throw new IllegalStateException("Họ kịch bản không có biến thể nào để kiểm thử");



            }







            // 2. Thu thập kết quả Baseline làm chuẩn đối chiếu ràng buộc



            Map<Long, Row> baselineRunMap = frozen == null
                    ? getOrCreateBaselineRuns(projectId, scenarioId, variants, vehicleModelId, baseAebVersionId, userId, optSimulator)
                    : frozen.optimization().stream().collect(java.util.stream.Collectors.toMap(r -> r.lng("id"), r -> r, (a,b) -> a, LinkedHashMap::new));



            for (Row b : baselineRunMap.values()) {
                if (!"COMPLETED".equals(b.str("status"))) {  // run baseline lỗi (vd. CARLA tắt) sẽ làm ràng buộc va chạm/phanh oan sai
                    throw new IllegalStateException("Run baseline " + b.lng("id") + " không hoàn thành (" + b.str("status") + "): " + b.str("error_message"));
                }
            }
            BaselineStats baselineStats = computeStats(baselineRunMap.values());







            // 3. Vòng lặp các Trials



            for (int trialNum = 1; trialNum <= maxTrials; trialNum++) {



                if (cancelledRunIds.contains(runId) || isCancelled(runId)) {



                    log.info("Optimization run {} đã bị huỷ bởi người dùng", runId);



                    db.update("UPDATE optimization_runs SET status = 'CANCELLED', finished_at = ? WHERE id = ?", Vs.now(), runId);



                    return;



                }







                log.info("Bắt đầu trial {}/{} cho optimization run {}", trialNum, maxTrials, runId);
                if (frozen != null) frozenCohort(optRun);







                // Lấy lịch sử các trial đã hoàn tất trước đó



                List<Row> completedTrials = db.list(



                        "SELECT * FROM optimization_trials WHERE optimization_run_id = ? AND status = 'COMPLETED' ORDER BY trial_number",



                        runId);







                // Gọi MOBO Engine đề xuất candidate tiếp theo



                if (frozen != null) {
                    for (Row trial : completedTrials) {
                        List<Row> evidence = db.list("SELECT * FROM simulation_runs WHERE project_id = ? AND optimization_trial_id = ? ORDER BY id",
                                projectId, trial.lng("id"));
                        validateFrozenCandidateRuns(evidence, frozen.optimization(), trial.lng("candidate_aeb_version_id"), trial.lng("id"));
                        CandidateTrialMetrics recorded = evaluateCandidateRuns(evidence, baselineStats);
                        if (!Objects.equals(recorded.rmsJerk(), trial.dbl("rms_jerk_mps3"))
                                || !Objects.equals(recorded.impactSpeed(), trial.dbl("impact_speed_mps"))
                                || !Objects.equals(recorded.stoppingDistance(), trial.dbl("stopping_distance_m"))
                                || recorded.constraintViolated() != trial.bool("constraint_violated"))
                            throw new InvalidRequestException("Optimization trial evidence changed before GP fitting");
                    }
                }
                Map<String, Object> moboResult = proposeCandidate(optRun, completedTrials, nInitialPoints);



                @SuppressWarnings("unchecked")



                Map<String, Double> proposedParams = (Map<String, Double>) moboResult.get("proposed_params");



                String samplingSource = (String) moboResult.getOrDefault("sampling_source", "INITIAL_DESIGN");



                Double acquisitionValue = moboResult.get("acquisition_value") != null ? ((Number) moboResult.get("acquisition_value")).doubleValue() : null;







                // Tránh trường hợp trùng 100% với bản cha



                Map<String, Double> baseValues = queries.aebValues(baseAebVersionId);



                if (isEqualParams(proposedParams, baseValues)) {



                    differentiateFromParent(proposedParams, baseValues, searchBounds(optRun.json("search_space_json")));






                }







                // Tạo Version AEB ứng viên trong cơ sở dữ liệu



                long candidateVersionId = aebService.createCandidate(



                        projectId, userId, baseAebVersionId, proposedParams,



                        "opt-r" + runId + "-t" + trialNum,



                        "Trial " + trialNum + " (" + samplingSource + ")",



                        "OPTIMIZATION");







                // Ghi nhận bản ghi trial trạng thái RUNNING



                long trialId = db.insert(



                        "INSERT INTO optimization_trials ("



                                + "project_id, optimization_run_id, trial_number, candidate_aeb_version_id, "



                                + "sampling_source, acquisition_value, status, created_date) "



                                + "VALUES (?,?,?,?,?,?,?,?)",



                        projectId, runId, trialNum, candidateVersionId,



                        samplingSource, acquisitionValue, "RUNNING", Vs.now());







                // Chạy mô phỏng cho candidate trên cùng biến thể và seed của baseline



                List<Long> runIds = new ArrayList<>();
                if (frozen == null) {
                    runIds.addAll(runService.createOptimizationRuns(projectId, scenarioId, variants, vehicleModelId, candidateVersionId,
                            userId, trialId, baselineRunMap));
                } else {
                    for (Row source : frozen.optimization()) {
                        runIds.addAll(runService.createOptimizationRuns(projectId, scenarioId,
                                List.of(frozen.variant(source)), vehicleModelId, candidateVersionId, userId, trialId,
                                Map.of(source.lng("scenario_version_id"), source)));
                    }
                }







                for (Long rId : runIds) {
                    if (cancelledRunIds.contains(runId) || isCancelled(runId)) {  // trial CARLA kéo dài vài phút: dừng giữa các run, không đợi hết trial
                        db.update("UPDATE simulation_runs SET status = 'STOPPED', error_message = 'Cancelled by user', ended_at = ? "
                                + "WHERE optimization_trial_id = ? AND status = 'PENDING'", Vs.now(), trialId);
                        db.update("UPDATE optimization_trials SET status = 'PRUNED', completed_at = ? WHERE id = ?", Vs.now(), trialId);
                        db.update("UPDATE optimization_runs SET status = 'CANCELLED', finished_at = ? WHERE id = ?", Vs.now(), runId);
                        return;
                    }



                    runService.executeRun(rId);



                }







                // A cancellation may arrive while the final simulation of the final trial is running.
                if (cancelledRunIds.contains(runId) || isCancelled(runId)) {
                    db.update("UPDATE optimization_trials SET status = 'PRUNED', completed_at = ? WHERE id = ?", Vs.now(), trialId);
                    return;
                }
                // Thu thập kết quả từ simulation_runs



                List<Row> candidateRuns = db.list("SELECT * FROM simulation_runs WHERE id IN (" + Db.placeholders(runIds.size()) + ")", runIds.toArray());
                if (candidateRuns.size() != variants.size()
                        || !candidateRuns.stream().map(r -> r.lng("id")).collect(java.util.stream.Collectors.toSet()).equals(new java.util.HashSet<>(runIds))) {
                    db.update("UPDATE optimization_trials SET status = 'FAILED', completed_at = ? WHERE id = ?", Vs.now(), trialId);
                    throw new IllegalStateException("Optimization candidate is missing selected variant runs");
                }
                for (Row cr : candidateRuns) {
                    if (!"COMPLETED".equals(cr.str("status"))) {
                        // Run lỗi không có kết quả: chấm như "không va chạm" sẽ đẩy một trial hỏng lên Pareto. Dừng cả đợt và nói rõ lý do.
                        db.update("UPDATE optimization_trials SET status = 'FAILED', completed_at = ? WHERE id = ?", Vs.now(), trialId);
                        throw new IllegalStateException("Trial " + trialNum + ": run " + cr.lng("id") + " không hoàn thành (" + cr.str("status") + "): " + cr.str("error_message"));
                    }
                }



                CandidateTrialMetrics metrics;
                if (frozen != null) {
                    frozenCohort(optRun);
                    validateFrozenCandidateRuns(candidateRuns, frozen.optimization(), candidateVersionId, trialId);
                }
                try {
                    metrics = evaluateCandidateRuns(candidateRuns, baselineStats);
                } catch (IllegalStateException incomplete) {
                    db.update("UPDATE optimization_trials SET status = 'FAILED', completed_at = ? WHERE id = ?", Vs.now(), trialId);
                    throw incomplete;
                }







                // Cập nhật kết quả trial vào DB



                db.update(



                        "UPDATE optimization_trials SET "



                                + "rms_jerk_mps3 = ?, impact_speed_mps = ?, stopping_distance_m = ?, collision_rate_pct = ?, "



                                + "objective_values_json = ?, constraint_violated = ?, status = 'COMPLETED', completed_at = ? "



                                + "WHERE id = ?",



                        metrics.rmsJerk(), metrics.impactSpeed(), metrics.stoppingDistance(), metrics.collisionRatePct(),



                        Json.write(metrics.asMap()), metrics.constraintViolated(), Vs.now(), trialId);







                // Đánh giá và cập nhật cờ is_pareto_optimal cho toàn bộ các trial hợp lệ



                updateParetoFront(runId);



            }







            // Hoàn tất optimization run



            int completed = db.update("UPDATE optimization_runs SET status = 'COMPLETED', finished_at = ? WHERE id = ? AND status = 'RUNNING'", Vs.now(), runId);



            if (completed == 1) AuditLog.event("optimization.complete", "success", "run_id", runId);







        } catch (Exception e) {



            log.error("Lỗi thực thi optimization run " + runId, e);
            db.update("UPDATE optimization_trials SET status = 'FAILED', completed_at = ? "
                    + "WHERE optimization_run_id = ? AND status IN ('PENDING','RUNNING')", Vs.now(), runId);
            db.update("UPDATE simulation_runs r JOIN optimization_trials t ON t.id = r.optimization_trial_id "
                    + "SET r.status = 'STOPPED', r.error_message = 'Optimization campaign failed', r.ended_at = ? "
                    + "WHERE t.optimization_run_id = ? AND r.status = 'PENDING'", Vs.now(), runId);



            db.update("UPDATE optimization_runs SET status = 'FAILED', error_message = ?, finished_at = ? WHERE id = ? AND status = 'RUNNING'",



                    e.getMessage(), Vs.now(), runId);



            AuditLog.event("optimization.fail", "error", "run_id", runId, "err", e.getMessage());



        } finally {



            cancelledRunIds.remove(runId);



        }



    }







    /**



     * Lấy hoặc chạy baseline runs cho các biến thể kịch bản.



     */



    private record FrozenCohort(Map<String,Object> snapshot, List<Row> optimization, List<Row> validation,
                                Map<Long,Row> scenarioVersions) {
        Row variant(Row source) {
            Map<String,Object> variant = new LinkedHashMap<>(scenarioVersions.get(source.lng("scenario_version_id")).asMap());
            // Run creation must replay the sealed configuration even after a family was edited or regenerated.
            variant.put("scenario_ir_json", Json.write(source.json("run_config_json")));
            return new Row(variant);
        }
        List<Row> variants(List<Row> sources) { return sources.stream().map(this::variant).toList(); }
    }

    private FrozenCohort frozenCohort(Row campaign) {
        Map<String,Object> reference = Json.asMap(campaign.json("objective_config_json").get("dataset_ref"));
        if (reference.isEmpty()) return null;
        if (!(reference.get("dataset_id") instanceof Number id) || !(reference.get("dataset_digest") instanceof String))
            throw new InvalidRequestException("Analysis campaign dataset reference is invalid");
        Map<String,Object> saved = analysis.handoff(campaign.lng("project_id"), id.longValue());
        Map<String,Object> identity = Json.asMap(saved.get("reference"));
        if (!Objects.equals(reference.get("dataset_digest"), saved.get("dataset_digest"))
                || ((Number)Json.asMap(saved.get("scenario")).get("id")).longValue() != campaign.lng("scenario_id")
                || ((Number)Json.asMap(saved.get("baseline")).get("id")).longValue() != campaign.lng("base_aeb_version_id")
                || ((Number)identity.get("vehicle_id")).longValue() != campaign.lng("carla_vehicle_model_id")
                || !Objects.equals(identity.get("simulator"), campaign.str("simulator_version")))
            throw new InvalidRequestException("Analysis campaign dataset identity or checksum changed");
        List<Row> optimization = frozenRuns(campaign, saved, "optimization_run_ids");
        List<Row> validation = frozenRuns(campaign, saved, "validation_run_ids");
        Map<Long,Row> versions = new LinkedHashMap<>();
        for (Row source : java.util.stream.Stream.concat(optimization.stream(), validation.stream()).toList()) {
            long variantId = source.lng("scenario_version_id");
            if (!versions.containsKey(variantId)) {
                Row variant = db.first("SELECT * FROM scenario_versions WHERE id = ? AND scenario_id = ?", variantId, campaign.lng("scenario_id"));
                if (variant == null) throw new InvalidRequestException("Analysis dataset scenario version is unavailable");
                versions.put(variantId, variant);
            }
        }
        return new FrozenCohort(saved, optimization, validation, versions);
    }

    private List<Row> frozenRuns(Row campaign, Map<String,Object> saved, String partition) {
        List<Long> ids = Json.asList(saved.get(partition)).stream().map(v -> ((Number)v).longValue()).toList();
        List<Object> args = new ArrayList<>(List.of(campaign.lng("project_id"))); args.addAll(ids);
        List<Row> rows = db.list("SELECT * FROM simulation_runs WHERE project_id = ? AND id IN (" + Db.placeholders(ids.size()) + ")", args.toArray());
        if (rows.size() != ids.size() || !rows.stream().map(r -> r.lng("id")).collect(java.util.stream.Collectors.toSet()).equals(new HashSet<>(ids))
                || rows.stream().anyMatch(r -> !RunEvidence.completeAebOn(r)
                || r.lng("aeb_version_id") != campaign.lng("base_aeb_version_id")
                || r.lng("scenario_id") != campaign.lng("scenario_id")
                || r.lng("carla_vehicle_model_id") != campaign.lng("carla_vehicle_model_id")
                || !Objects.equals(r.str("simulator_version"), campaign.str("simulator_version"))))
            throw new InvalidRequestException("Analysis dataset source runs are incomplete or changed");
        Map<String,Double> parameters = queries.aebValues(campaign.lng("base_aeb_version_id"));
        if (rows.stream().anyMatch(row -> !parametersMatch(row, parameters)))
            throw new InvalidRequestException("Analysis baseline parameter values changed or source parameters are incomplete");
        Map<Long,Row> byId = rows.stream().collect(java.util.stream.Collectors.toMap(r -> r.lng("id"), r -> r));
        return ids.stream().map(byId::get).toList();
    }

    private static boolean parametersMatch(Row row, Map<String,Double> parameters) {
        if (!parameters.keySet().equals(new HashSet<>(com.vsos.core.aeb.AebParams.CODES))) return false;
        Map<String,Object> actual = Json.asMap(row.json("telemetry_json").get("params"));
        return parameters.entrySet().stream().allMatch(entry -> actual.get(entry.getKey().toLowerCase(Locale.ROOT)) instanceof Number n
                && Double.isFinite(n.doubleValue()) && entry.getValue() != null && Double.compare(n.doubleValue(), entry.getValue()) == 0);
    }

    private void validateFrozenCandidateRuns(List<Row> candidates, List<Row> baseline, long candidateVersionId, long trialId) {
        Map<Long,Row> sources = baseline.stream().collect(java.util.stream.Collectors.toMap(r -> r.lng("id"), r -> r));
        Map<String,Double> parameters = queries.aebValues(candidateVersionId);
        Set<Long> matched = new HashSet<>();
        for (Row candidate : candidates) {
            Row source = sources.get(candidate.getLong("baseline_run_id"));
            if (source == null || !matched.add(source.lng("id")) || candidate.lng("aeb_version_id") != candidateVersionId
                    || candidate.lng("optimization_trial_id") != trialId || candidate.lng("project_id") != source.lng("project_id")
                    || candidate.lng("scenario_id") != source.lng("scenario_id")
                    || candidate.lng("scenario_version_id") != source.lng("scenario_version_id")
                    || candidate.lng("random_seed") != source.lng("random_seed")
                    || candidate.lng("carla_vehicle_model_id") != source.lng("carla_vehicle_model_id")
                    || !Objects.equals(candidate.str("simulator_version"), source.str("simulator_version"))
                    || !parametersMatch(candidate, parameters)
                    || Double.compare(candidate.dbl("fixed_delta_seconds"), source.dbl("fixed_delta_seconds")) != 0
                    || !AnalysisService.datasetDigest(Map.of("config",candidate.json("run_config_json")))
                    .equals(AnalysisService.datasetDigest(Map.of("config",source.json("run_config_json")))))
                throw new InvalidRequestException("Optimization candidate differs from its frozen run identity");
        }
        if (!matched.equals(sources.keySet())) throw new InvalidRequestException("Optimization candidate is missing frozen source runs");
    }

    private Map<Long, Row> getOrCreateBaselineRuns(
            long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long baseAebVersionId, long userId, String optSimulator) {



        Map<Long, Row> baselineMap = new LinkedHashMap<>();
        Set<Long> selectedVariantIds = variants.stream().map(v -> v.lng("id")).collect(java.util.stream.Collectors.toSet());



        List<Row> existing = db.list(



                "SELECT * FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND aeb_version_id = ? AND status = 'COMPLETED' AND aeb_mode = 'ON' "
                        + "AND simulator_version = ? AND carla_vehicle_model_id = ? ORDER BY id",  // cùng bộ mô phỏng + xe; run mới nhất của biến thể thắng



                projectId, scenarioId, baseAebVersionId, optSimulator, vehicleModelId);







        for (Row r : existing) {



            // Older generations remain in the database; only this trial's selected variants belong to the cohort.
            if (selectedVariantIds.contains(r.lng("scenario_version_id"))) {
                baselineMap.put(r.lng("scenario_version_id"), r);
            }



        }







        // Nếu thiếu biến thể nào thì chạy thêm cho đủ



        List<Row> missingVariants = new ArrayList<>();



        for (Row v : variants) {



            if (!baselineMap.containsKey(v.lng("id"))) {



                missingVariants.add(v);



            }



        }







        if (!missingVariants.isEmpty()) {



            List<Long> newRunIds = runService.createRuns(
                    projectId, scenarioId, missingVariants, vehicleModelId, baseAebVersionId,
                    userId, "BASELINE", null, null, optSimulator);



            for (Long rId : newRunIds) {



                runService.executeRun(rId);



                Row finishedRun = db.first("SELECT * FROM simulation_runs WHERE id = ?", rId);



                if (finishedRun != null) {



                    baselineMap.put(finishedRun.lng("scenario_version_id"), finishedRun);



                }



            }



        }



        if (!baselineMap.keySet().equals(selectedVariantIds)) {
            throw new IllegalStateException("Optimization baseline is missing selected variant runs");
        }
        return baselineMap;



    }







    private boolean isCancelled(long runId) {



        String status = (String) db.scalar("SELECT status FROM optimization_runs WHERE id = ?", runId);



        return "CANCELLED".equals(status);



    }







    private boolean isEqualParams(Map<String, Double> a, Map<String, Double> b) {



        if (a == null || b == null) return false;



        for (String k : List.of("TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "BRAKE_BUILDUP_RATE", "MAX_DECELERATION")) {



            Double v1 = a.get(k);



            Double v2 = b.get(k);



            if (v1 == null || v2 == null || Math.abs(v1 - v2) > 1e-4) {



                return false;



            }



        }



        return true;



    }







    /**
     * Đề xuất cấu hình AEB tiếp theo bằng lõi MOBO Java ({@link MoboEngine}, qEHVI); không còn tiến trình Python.
     * Kết quả có {@code proposed_params}, {@code sampling_source}, {@code acquisition_value} và {@code pareto_trial_numbers}.
     */
    Map<String, Object> proposeCandidate(Row optRun, List<Row> completedTrials, int nInitialPoints) {
        ParameterBounds bounds = searchBounds(optRun.json("search_space_json"));
        List<MoboTrial> trials = new ArrayList<>();
        for (Row t : completedTrials) {
            trials.add(new MoboTrial(
                    (int) t.lng("trial_number"),
                    queries.aebValues(t.lng("candidate_aeb_version_id")),
                    t.dbl("rms_jerk_mps3"),
                    t.dbl("impact_speed_mps"),
                    t.dbl("stopping_distance_m"),
                    t.bool("constraint_violated")));
        }
        if (trials.stream().anyMatch(trial -> !bounds.isValid(trial.params()))) {
            throw new IllegalStateException("Stored trial parameters are outside the campaign search space");
        }
        MoboProposal proposal = new MoboEngine(bounds, nInitialPoints, MOBO_SEED).propose(trials);
        // Sampling rounds to three decimals; keep narrow/non-grid requested endpoints inside their stored bounds.
        for (String key : ParameterBounds.PARAM_KEYS) {
            proposal.params().put(key, Math.max(bounds.lower(key), Math.min(bounds.upper(key), proposal.params().get(key))));
        }
        if (proposal.params().values().stream().anyMatch(value -> value == null || !Double.isFinite(value)) || !bounds.isValid(proposal.params())) {
            throw new IllegalStateException("Optimization proposed invalid parameters");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("proposed_params", proposal.params());
        result.put("sampling_source", proposal.samplingSource());
        result.put("acquisition_value", proposal.acquisitionValue());
        result.put("pareto_trial_numbers", proposal.paretoTrialNumbers());
        return result;
    }

    static ParameterBounds searchBounds(Map<String, Object> space) {
        if (space.isEmpty()) return ParameterBounds.defaults(); // Older records without a stored custom range.
        Map<String,double[]> domain = Map.of("TTC_THRESHOLD",new double[]{.5,4},"BRAKE_ACTIVATION_DELAY",new double[]{0,.5},
                "BRAKE_BUILDUP_RATE",new double[]{5,20},"MAX_DECELERATION",new double[]{3,10});
        if (!space.keySet().equals(domain.keySet())) throw new InvalidRequestException("Invalid optimization search space: specify all four AEB parameters");
        Map<String,double[]> bounds = new LinkedHashMap<>();
        for (String key : ParameterBounds.PARAM_KEYS) {
            List<Object> pair = Json.asList(space.get(key));
            if (pair.size()!=2 || !(pair.get(0) instanceof Number low) || !(pair.get(1) instanceof Number high)
                    || !Double.isFinite(low.doubleValue()) || !Double.isFinite(high.doubleValue())
                    || low.doubleValue()>high.doubleValue() || low.doubleValue()<domain.get(key)[0] || high.doubleValue()>domain.get(key)[1]) {
                throw new InvalidRequestException("Invalid optimization search space: " + key);
            }
            bounds.put(key,new double[]{low.doubleValue(),high.doubleValue()});
        }
        return new ParameterBounds(bounds);
    }

    static void differentiateFromParent(Map<String, Double> proposal, Map<String, Double> parent, ParameterBounds bounds) {
        for (String key : ParameterBounds.PARAM_KEYS) {
            double value = parent.get(key);
            double other = Math.min(bounds.upper(key), value + .1);
            if (Math.abs(other-value)<=1e-4) other = Math.max(bounds.lower(key), value - .1);
            if (Math.abs(other-value)>1e-4) { proposal.put(key,other); return; }
        }
        throw new InvalidRequestException("Optimization search space cannot produce a candidate different from its parent");
    }

    static void validateObjectiveConfig(Map<String,Object> config) {
        Map<String,Object> constraints=Json.asMap(config.get("constraints"));
        Map<String,Object> collision=Json.asMap(constraints.get("collision_rate_pct"));
        Map<String,Object> falseActivation=Json.asMap(constraints.get("false_activation_increase_pts"));
        if (!config.keySet().equals(Set.of("objectives","constraints"))
                || !Json.asList(config.get("objectives")).equals(List.of("RMS_JERK","RELATIVE_IMPACT_SPEED","STOPPING_DISTANCE"))
                || !constraints.keySet().equals(Set.of("collision_rate_pct","false_activation_increase_pts"))
                || !collision.equals(Map.of("max","baseline")) || !falseActivation.keySet().equals(Set.of("max"))
                || !(falseActivation.get("max") instanceof Number n)
                || n.doubleValue()!=com.vsos.backend.service.regression.RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS) {
            throw new InvalidRequestException("Unsupported optimization objective configuration: use the three canonical objectives and fixed constraints");
        }
    }

    /** Chỉ giao việc cho executor sau khi transaction tạo run đã commit; nếu không luồng nền có thể không thấy dòng vừa insert và bỏ qua run. */
    private void startAfterCommit(long runId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(() -> executeOptimization(runId));
                }
            });
        } else {
            executor.execute(() -> executeOptimization(runId));
        }
    }

    private double round(double val, int decimals) {



        return BigDecimal.valueOf(val).setScale(decimals, RoundingMode.HALF_UP).doubleValue();



    }







    /**



     * Tổng hợp các metrics của một candidate theo đúng Business Rules:



     * - RMS Jerk: Trung bình các run có phanh (aeb_activated = true)



     * - Relative Impact Speed: Trung bình trên MỌI run (không va chạm = 0)



     * - Stopping Distance: Trung bình các run có phanh



     */



    CandidateTrialMetrics evaluateCandidateRuns(List<Row> runs, BaselineStats baselineStats) {
        if (runs.isEmpty() || runs.stream().anyMatch(r -> !RunEvidence.completeAebOn(r))
                || !AnalysisMetrics.objectivesAvailable(runs.stream().map(RunEvidence::sample).toList())) {
            throw new IllegalStateException("Optimization candidate has incomplete run evidence or objectives");
        }










        double totalJerk = 0.0;



        int jerkCount = 0;







        double totalImpactSpeed = 0.0;







        double totalStopDist = 0.0;



        int stopCount = 0;







        int collisionCount = 0;



        int falseActivationCount = 0;







        for (Row r : runs) {



            boolean collision = r.bool("collision_occurred");



            boolean activated = Boolean.TRUE.equals(RunEvidence.sample(r).braked());



            boolean falsePositive = r.bool("is_false_positive");







            if (collision) {



                collisionCount++;



                Double impactSpeed = r.dbl("impact_speed_mps");



                totalImpactSpeed += (impactSpeed != null ? impactSpeed : 0.0);



            }







            if (falsePositive) {



                falseActivationCount++;



            }







            if (activated) {



                Double jerk = r.dbl("rms_jerk_mps3");



                if (jerk != null) {



                    totalJerk += jerk;



                    jerkCount++;



                }







                Double stopDist = r.dbl("stopping_distance_m");



                if (stopDist != null) {



                    totalStopDist += stopDist;



                    stopCount++;



                }



            }



        }







        double avgJerk = jerkCount > 0 ? totalJerk / jerkCount : 0.0;



        double avgImpactSpeed = totalImpactSpeed / runs.size(); // Trung bình trên mọi run



        double avgStopDist = stopCount > 0 ? totalStopDist / stopCount : 0.0;







        double collisionRate = ((double) collisionCount / runs.size()) * 100.0;



        double falseActivationRate = ((double) falseActivationCount / runs.size()) * 100.0;







        // Ràng buộc: Tỷ lệ va chạm không vượt baseline, phanh oan không tăng quá RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS (5 điểm %) —
        // cùng một hằng và cùng phép so (≤ ngưỡng + 1e-9) với regression (ADR-044, TD-48; chốt 13/11/2026).



        boolean violated = (collisionRate > baselineStats.collisionRatePct() + 0.01)



                || (falseActivationRate - baselineStats.falseActivationRatePct() > com.vsos.backend.service.regression.RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS + 1e-9);







        return new CandidateTrialMetrics(



                round(avgJerk, 3),



                round(avgImpactSpeed, 3),



                round(avgStopDist, 3),



                round(collisionRate, 2),



                round(falseActivationRate, 2),



                violated);



    }







    BaselineStats computeStats(Collection<Row> runs) {
        if (runs.isEmpty() || runs.stream().anyMatch(r -> !RunEvidence.completeAebOn(r))) {
            throw new IllegalStateException("Optimization baseline has incomplete run evidence");
        }






        int collisions = 0;



        int falsePositives = 0;



        for (Row r : runs) {



            if (r.bool("collision_occurred")) collisions++;



            if (r.bool("is_false_positive")) falsePositives++;



        }



        double colRate = ((double) collisions / runs.size()) * 100.0;



        double fpRate = ((double) falsePositives / runs.size()) * 100.0;



        return new BaselineStats(colRate, fpRate);



    }







    /**



     * Cập nhật nhãn is_pareto_optimal cho toàn bộ các trial trong run:



     * Một trial hợp lệ A dominate trial B nếu A <= B trên cả 3 mục tiêu và A < B ở ít nhất 1 mục tiêu.



     */



    @Transactional



    public void updateParetoFront(long runId) {



        List<Row> trials = db.list("SELECT * FROM optimization_trials WHERE optimization_run_id = ? AND status = 'COMPLETED'", runId);



        List<Row> valid = trials.stream().filter(t -> !t.bool("constraint_violated")



                && t.dbl("rms_jerk_mps3") != null



                && t.dbl("impact_speed_mps") != null



                && t.dbl("stopping_distance_m") != null).toList();







        Set<Long> paretoIds = new HashSet<>();



        for (Row t : valid) {



            double j1 = t.dbl("rms_jerk_mps3");



            double v1 = t.dbl("impact_speed_mps");



            double s1 = t.dbl("stopping_distance_m");







            boolean dominated = false;



            for (Row other : valid) {



                if (other.lng("id") == t.lng("id")) continue;



                double j2 = other.dbl("rms_jerk_mps3");



                double v2 = other.dbl("impact_speed_mps");



                double s2 = other.dbl("stopping_distance_m");







                boolean notWorse = (j2 <= j1 && v2 <= v1 && s2 <= s1);



                boolean strictlyBetter = (j2 < j1 || v2 < v1 || s2 < s1);



                if (notWorse && strictlyBetter) {



                    dominated = true;



                    break;



                }



            }



            if (!dominated) {



                paretoIds.add(t.lng("id"));



            }



        }







        for (Row t : trials) {



            boolean isPareto = paretoIds.contains(t.lng("id"));



            if (t.bool("is_pareto_optimal") != isPareto) {



                db.update("UPDATE optimization_trials SET is_pareto_optimal = ? WHERE id = ?", isPareto, t.lng("id"));



            }



        }



    }







    // ==========================================



    // CÁC HÀM TRUY VẤN VÀ THAO TÁC CỦA API



    // ==========================================







    public Map<String, Object> getRun(long projectId, long runId) {



        Row r = db.first("SELECT * FROM optimization_runs WHERE id = ? AND project_id = ?", runId, projectId);



        if (r == null) {



            throw new NotFoundException("optimization run");



        }



        int total = (int) r.lng("max_trials");



        int completed = ((Number) db.scalar("SELECT COUNT(*) FROM optimization_trials WHERE optimization_run_id = ? AND status = 'COMPLETED'", runId)).intValue();



        int paretoCount = ((Number) db.scalar("SELECT COUNT(*) FROM optimization_trials WHERE optimization_run_id = ? AND is_pareto_optimal = TRUE", runId)).intValue();







        Map<String, Object> res = new LinkedHashMap<>();



        res.put("id", r.lng("id"));



        res.put("project_id", r.lng("project_id"));



        res.put("scenario_id", r.lng("scenario_id"));



        res.put("name", r.str("name"));



        res.put("algorithm", r.str("algorithm"));



        res.put("status", r.str("status"));



        res.put("max_trials", total);



        res.put("completed_trials", completed);



        res.put("pareto_count", paretoCount);



        res.put("started_at", r.str("started_at"));



        res.put("finished_at", r.str("finished_at"));



        res.put("error_message", r.str("error_message"));



        res.put("search_space", r.json("search_space_json"));



        res.put("objective_config", r.json("objective_config_json"));
        Map<String,Object> dataset = Json.asMap(r.json("objective_config_json").get("dataset_ref"));
        if (!dataset.isEmpty()) res.putAll(dataset);



        return res;



    }







    public List<Map<String, Object>> listRuns(long projectId) {



        List<Row> rows = db.list("SELECT * FROM optimization_runs WHERE project_id = ? ORDER BY id DESC", projectId);



        List<Map<String, Object>> list = new ArrayList<>();



        for (Row r : rows) {



            list.add(getRun(projectId, r.lng("id")));



        }



        return list;



    }







    public List<Map<String, Object>> listTrials(long projectId, long runId) {



        Row r = db.first("SELECT * FROM optimization_runs WHERE id = ? AND project_id = ?", runId, projectId);



        if (r == null) {



            throw new NotFoundException("optimization run");



        }



        List<Row> rows = db.list("SELECT * FROM optimization_trials WHERE optimization_run_id = ? ORDER BY trial_number", runId);



        List<Map<String, Object>> list = new ArrayList<>();



        for (Row t : rows) {



            Map<String, Object> m = new LinkedHashMap<>();



            m.put("id", t.lng("id"));



            m.put("trial_number", (int) t.lng("trial_number"));



            m.put("candidate_aeb_version_id", t.lng("candidate_aeb_version_id"));



            m.put("sampling_source", t.str("sampling_source"));



            m.put("acquisition_value", t.dbl("acquisition_value"));



            m.put("rms_jerk_mps3", t.dbl("rms_jerk_mps3"));



            m.put("impact_speed_mps", t.dbl("impact_speed_mps"));



            m.put("stopping_distance_m", t.dbl("stopping_distance_m"));



            m.put("collision_rate_pct", t.dbl("collision_rate_pct"));



            m.put("constraint_violated", t.bool("constraint_violated"));



            m.put("is_pareto_optimal", t.bool("is_pareto_optimal"));



            m.put("status", t.str("status"));



            m.put("parameters", queries.aebValues(t.lng("candidate_aeb_version_id")));



            list.add(m);



        }



        return list;



    }







    public List<Map<String, Object>> getParetoFront(long projectId, long runId) {



        List<Map<String, Object>> all = listTrials(projectId, runId);



        return all.stream().filter(t -> Boolean.TRUE.equals(t.get("is_pareto_optimal"))).toList();



    }







    @Transactional



    public void cancelRun(long projectId, long runId, long userId) {



        Row r = db.first("SELECT * FROM optimization_runs WHERE id = ? AND project_id = ?", runId, projectId);



        if (r == null) {



            throw new NotFoundException("optimization run");



        }



        if (!Set.of("PENDING", "RUNNING").contains(r.str("status"))) {
            throw new InvalidRequestException("Đợt tối ưu đã kết thúc, không thể hủy.");
        }



        if (db.update("UPDATE optimization_runs SET status = 'CANCELLED', finished_at = ? WHERE id = ? AND project_id = ? AND status IN ('PENDING','RUNNING')",
                Vs.now(), runId, projectId) != 1) {
            throw new InvalidRequestException("Đợt tối ưu đã kết thúc, không thể hủy.");
        }
        cancelledRunIds.add(runId);



        AuditLog.event("optimization.cancel", "cancelled", "run_id", runId);



    }







    /**



     * Handoff sang Verification Testing: Kỹ sư chọn một candidate Pareto để tạo Regression Test.



     */



    @Transactional



    public Map<String, Object> selectCandidateForVerification(long projectId, long runId, long trialId, long userId) {



        Row trial = db.first(



                "SELECT * FROM optimization_trials WHERE id = ? AND optimization_run_id = ? AND project_id = ? FOR UPDATE",



                trialId, runId, projectId);



        if (trial == null) {



            throw new NotFoundException("optimization trial");



        }



        Row optRun = db.first("SELECT * FROM optimization_runs WHERE id = ?", runId);







        if (!"COMPLETED".equals(trial.str("status")) || !trial.bool("is_pareto_optimal") || trial.bool("constraint_violated")
                || java.util.stream.Stream.of(trial.dbl("rms_jerk_mps3"), trial.dbl("impact_speed_mps"), trial.dbl("stopping_distance_m"))
                .anyMatch(value -> value == null || !Double.isFinite(value) || value < 0)) {
            throw new InvalidRequestException("Chỉ chọn trial Pareto đã hoàn tất, đủ số đo và thỏa ràng buộc để kiểm chứng.");
        }
        long candidateVersionId = trial.lng("candidate_aeb_version_id");



        long scenarioId = optRun.lng("scenario_id");







        // Tạo bài kiểm thử hồi quy (Regression Test)



        FrozenCohort frozen = frozenCohort(optRun);
        String testName = "Verification test for MOBO candidate (Run #" + runId + ", Trial #" + ((int) trial.lng("trial_number")) + ")";
        Row existing = db.first("SELECT * FROM regression_tests WHERE project_id = ? AND candidate_aeb_version_id = ? "
                + "AND baseline_aeb_version_id = ? AND scenario_id = ? "
                + "AND JSON_EXTRACT(pass_criteria_json, '$.verification_ref.optimization_run_id') = ? "
                + "AND JSON_EXTRACT(pass_criteria_json, '$.verification_ref.trial_id') = ? "
                + "AND execution_status NOT IN ('FAILED','CANCELLED') ORDER BY id DESC LIMIT 1",
                projectId, candidateVersionId, optRun.lng("base_aeb_version_id"), scenarioId, runId, trialId);
        if (existing != null && frozen != null) {
            Map<String,Object> selection = Json.asMap(existing.json("pass_criteria_json").get("scenario_set"));
            if (!Objects.equals(Json.asMap(selection.get("dataset_ref")).get("dataset_digest"), frozen.snapshot().get("dataset_digest"))
                    || !AnalysisService.datasetDigest(Map.of("ids", Json.asList(selection.get("baseline_run_ids"))))
                    .equals(AnalysisService.datasetDigest(Map.of("ids", frozen.validation().stream().map(r -> r.lng("id")).toList()))))
                existing = null;
        }
        long regressionTestId = existing != null ? existing.lng("id")
                : frozen == null ? regressionService.createTest(projectId, userId, candidateVersionId, scenarioId, true, true, null, testName)
                : regressionService.createFrozenTest(projectId, userId, candidateVersionId, scenarioId,
                        optRun.lng("base_aeb_version_id"), optRun.lng("carla_vehicle_model_id"), optRun.str("simulator_version"),
                        frozen.variants(frozen.validation()), frozen.validation(),
                        Json.asMap(optRun.json("objective_config_json").get("dataset_ref")), testName);
        if (existing == null) {
            db.update("UPDATE regression_tests SET pass_criteria_json = JSON_SET(pass_criteria_json, '$.verification_ref', CAST(? AS JSON)) "
                    + "WHERE id = ? AND project_id = ?",
                    Json.write(Json.obj("optimization_run_id",runId,"trial_id",trialId)), regressionTestId, projectId);
        }







        AuditLog.event("optimization.select_candidate", "success", "run_id", runId, "trial_id", trialId, "regression_id", regressionTestId);







        Map<String, Object> res = new LinkedHashMap<>();



        res.put("optimization_run_id", runId);



        res.put("trial_id", trialId);



        res.put("candidate_aeb_version_id", candidateVersionId);



        res.put("parameters", queries.aebValues(candidateVersionId));



        res.put("objectives", Map.of(



                "rms_jerk_mps3", trial.dbl("rms_jerk_mps3"),



                "impact_speed_mps", trial.dbl("impact_speed_mps"),



                "stopping_distance_m", trial.dbl("stopping_distance_m")));



        res.put("regression_test_id", regressionTestId);



        res.put("status", "VERIFICATION_CREATED");



        return res;



    }







    public record CandidateTrialMetrics(



            Double rmsJerk,



            Double impactSpeed,



            Double stoppingDistance,



            Double collisionRatePct,



            Double falseActivationRatePct,



            boolean constraintViolated) {



        public Map<String, Object> asMap() {



            return Map.of(



                    "rms_jerk_mps3", rmsJerk,



                    "impact_speed_mps", impactSpeed,



                    "stopping_distance_m", stoppingDistance,



                    "collision_rate_pct", collisionRatePct,



                    "false_activation_rate_pct", falseActivationRatePct);



        }



    }







    public record BaselineStats(double collisionRatePct, double falseActivationRatePct) {}



}



