package com.vehicsim.vehicsim;







import com.vehicsim.audit.AuditLog;
import com.vehicsim.core.mobo.MoboEngine;
import com.vehicsim.core.mobo.MoboProposal;
import com.vehicsim.core.mobo.MoboTrial;
import com.vehicsim.core.mobo.ParameterBounds;
import com.vehicsim.service.RegressionService;



import com.vehicsim.vehicsim.Vs.InvalidRequestException;



import com.vehicsim.vehicsim.Vs.NotFoundException;



import org.slf4j.Logger;



import org.slf4j.LoggerFactory;



import org.springframework.beans.factory.annotation.Qualifier;



import org.springframework.core.task.TaskExecutor;



import org.springframework.stereotype.Service;



import org.springframework.transaction.annotation.Transactional;
















import java.math.BigDecimal;



import java.math.RoundingMode;






import java.nio.file.Path;



import java.time.LocalDateTime;



import java.util.*;



import java.util.concurrent.ConcurrentHashMap;










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



            @Qualifier("simulationExecutor") TaskExecutor executor) {



        this.db = db;



        this.queries = queries;



        this.runService = runService;



        this.aebService = aebService;



        this.regressionService = regressionService;



        this.familyService = familyService;



        this.props = props;



        this.executor = executor;



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







        Row project = db.first("SELECT * FROM projects WHERE id = ?", projectId);



        if (project == null) {



            throw new NotFoundException("project");



        }



        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);



        if (scenario == null) {



            throw new NotFoundException("scenario family");



        }







        Row baseVersion = baseAebVersionId != null



                ? db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", baseAebVersionId, projectId)



                : queries.baselineVersion(projectId);



        if (baseVersion == null) {



            throw new NotFoundException("base AEB version (baseline)");



        }







        Row vehicle = queries.activeVehicle(projectId);



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







        String objectiveConfig = (customObjectiveConfigJson != null && !customObjectiveConfigJson.isBlank())



                ? customObjectiveConfigJson



                : Json.write(Map.of(



                        "objectives", List.of("RMS_JERK", "RELATIVE_IMPACT_SPEED", "STOPPING_DISTANCE"),



                        "constraints", Map.of(



                                "collision_rate_pct", Map.of("max", "baseline"),



                                "false_activation_increase_pts", Map.of("max", 5.0))));







        String simVersion = RunService.KINEMATIC_SIMULATOR;







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



            executor.execute(() -> executeOptimization(runId));



        }







        return runId;



    }







    /**



     * Vòng lặp điều phối MOBO chạy ngầm:



     * Candidate proposal -> Run simulations on scenario set -> Objective calculation -> Model update -> Next candidate.



     */



    public void executeOptimization(long runId) {



        Row optRun = db.first("SELECT * FROM optimization_runs WHERE id = ?", runId);



        if (optRun == null || "CANCELLED".equals(optRun.str("status"))) {



            return;



        }







        long projectId = optRun.lng("project_id");



        long scenarioId = optRun.lng("scenario_id");



        long baseAebVersionId = optRun.lng("base_aeb_version_id");



        long vehicleModelId = optRun.lng("carla_vehicle_model_id");



        long userId = optRun.lng("created_by_user_id");



        int maxTrials = (int) optRun.lng("max_trials");



        int nInitialPoints = optRun.getInt("n_initial_points") != null ? optRun.getInt("n_initial_points") : 3;







        db.update("UPDATE optimization_runs SET status = 'RUNNING', started_at = ? WHERE id = ?", Vs.now(), runId);



        AuditLog.event("optimization.start", "running", "run_id", runId);







        try {



            // 1. Tải danh sách biến thể của họ kịch bản



            long baseVersionId = familyService.latestBaseVersionId(scenarioId);



            List<Row> variants = familyService.variantsOf(baseVersionId);



            if (variants.isEmpty()) {



                throw new IllegalStateException("Họ kịch bản không có biến thể nào để kiểm thử");



            }







            // 2. Thu thập kết quả Baseline làm chuẩn đối chiếu ràng buộc



            Map<Long, Row> baselineRunMap = getOrCreateBaselineRuns(projectId, scenarioId, variants, vehicleModelId, baseAebVersionId, userId);



            BaselineStats baselineStats = computeStats(baselineRunMap.values());







            // 3. Vòng lặp các Trials



            for (int trialNum = 1; trialNum <= maxTrials; trialNum++) {



                if (cancelledRunIds.contains(runId) || isCancelled(runId)) {



                    log.info("Optimization run {} đã bị huỷ bởi người dùng", runId);



                    db.update("UPDATE optimization_runs SET status = 'CANCELLED', finished_at = ? WHERE id = ?", Vs.now(), runId);



                    return;



                }







                log.info("Bắt đầu trial {}/{} cho optimization run {}", trialNum, maxTrials, runId);







                // Lấy lịch sử các trial đã hoàn tất trước đó



                List<Row> completedTrials = db.list(



                        "SELECT * FROM optimization_trials WHERE optimization_run_id = ? AND status = 'COMPLETED' ORDER BY trial_number",



                        runId);







                // Gọi MOBO Engine đề xuất candidate tiếp theo



                Map<String, Object> moboResult = proposeCandidate(optRun, completedTrials, nInitialPoints);



                @SuppressWarnings("unchecked")



                Map<String, Double> proposedParams = (Map<String, Double>) moboResult.get("proposed_params");



                String samplingSource = (String) moboResult.getOrDefault("sampling_source", "INITIAL_DESIGN");



                Double acquisitionValue = moboResult.get("acquisition_value") != null ? ((Number) moboResult.get("acquisition_value")).doubleValue() : null;







                // Tránh trường hợp trùng 100% với bản cha



                Map<String, Double> baseValues = queries.aebValues(baseAebVersionId);



                if (isEqualParams(proposedParams, baseValues)) {



                    double currentTtc = proposedParams.getOrDefault("TTC_THRESHOLD", 1.8);



                    proposedParams.put("TTC_THRESHOLD", Math.min(3.5, Math.round((currentTtc + 0.1) * 100.0) / 100.0));



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



                List<Long> runIds = runService.createOptimizationRuns(



                        projectId, scenarioId, variants, vehicleModelId, candidateVersionId,



                        userId, trialId, baselineRunMap);







                for (Long rId : runIds) {



                    runService.executeRun(rId);



                }







                // Thu thập kết quả từ simulation_runs



                List<Row> candidateRuns = db.list("SELECT * FROM simulation_runs WHERE id IN (" + Db.placeholders(runIds.size()) + ")", runIds.toArray());



                CandidateTrialMetrics metrics = evaluateCandidateRuns(candidateRuns, baselineStats);







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



            db.update("UPDATE optimization_runs SET status = 'COMPLETED', finished_at = ? WHERE id = ?", Vs.now(), runId);



            AuditLog.event("optimization.complete", "success", "run_id", runId);







        } catch (Exception e) {



            log.error("Lỗi thực thi optimization run " + runId, e);



            db.update("UPDATE optimization_runs SET status = 'FAILED', error_message = ?, finished_at = ? WHERE id = ?",



                    e.getMessage(), Vs.now(), runId);



            AuditLog.event("optimization.fail", "error", "run_id", runId, "err", e.getMessage());



        } finally {



            cancelledRunIds.remove(runId);



        }



    }







    /**



     * Lấy hoặc chạy baseline runs cho các biến thể kịch bản.



     */



    private Map<Long, Row> getOrCreateBaselineRuns(



            long projectId, long scenarioId, List<Row> variants, long vehicleModelId, long baseAebVersionId, long userId) {



        Map<Long, Row> baselineMap = new LinkedHashMap<>();



        List<Row> existing = db.list(



                "SELECT * FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND aeb_version_id = ? AND status = 'COMPLETED'",



                projectId, scenarioId, baseAebVersionId);







        for (Row r : existing) {



            baselineMap.put(r.lng("scenario_version_id"), r);



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



                    userId, "BASELINE", null, null);



            for (Long rId : newRunIds) {



                runService.executeRun(rId);



                Row finishedRun = db.first("SELECT * FROM simulation_runs WHERE id = ?", rId);



                if (finishedRun != null) {



                    baselineMap.put(finishedRun.lng("scenario_version_id"), finishedRun);



                }



            }



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
    private Map<String, Object> proposeCandidate(Row optRun, List<Row> completedTrials, int nInitialPoints) {
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
        MoboProposal proposal = new MoboEngine(ParameterBounds.defaults(), nInitialPoints, MOBO_SEED).propose(trials);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("proposed_params", proposal.params());
        result.put("sampling_source", proposal.samplingSource());
        result.put("acquisition_value", proposal.acquisitionValue());
        result.put("pareto_trial_numbers", proposal.paretoTrialNumbers());
        return result;
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



    private CandidateTrialMetrics evaluateCandidateRuns(List<Row> runs, BaselineStats baselineStats) {



        if (runs.isEmpty()) {



            return new CandidateTrialMetrics(0.0, 0.0, 0.0, 0.0, 0.0, true);



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



            boolean activated = r.bool("aeb_activated");



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







        // Ràng buộc: Tỷ lệ va chạm không vượt baseline, phanh oan không tăng quá 5 điểm %



        boolean violated = (collisionRate > baselineStats.collisionRatePct() + 0.01)



                || (falseActivationRate - baselineStats.falseActivationRatePct() > 5.01);







        return new CandidateTrialMetrics(



                round(avgJerk, 3),



                round(avgImpactSpeed, 3),



                round(avgStopDist, 3),



                round(collisionRate, 2),



                round(falseActivationRate, 2),



                violated);



    }







    private BaselineStats computeStats(Collection<Row> runs) {



        if (runs.isEmpty()) {



            return new BaselineStats(0.0, 0.0);



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



        cancelledRunIds.add(runId);



        db.update("UPDATE optimization_runs SET status = 'CANCELLED', finished_at = ? WHERE id = ?", Vs.now(), runId);



        AuditLog.event("optimization.cancel", "cancelled", "run_id", runId);



    }







    /**



     * Handoff sang Verification Testing: Kỹ sư chọn một candidate Pareto để tạo Regression Test.



     */



    @Transactional



    public Map<String, Object> selectCandidateForVerification(long projectId, long runId, long trialId, long userId) {



        Row trial = db.first(



                "SELECT * FROM optimization_trials WHERE id = ? AND optimization_run_id = ? AND project_id = ?",



                trialId, runId, projectId);



        if (trial == null) {



            throw new NotFoundException("optimization trial");



        }



        Row optRun = db.first("SELECT * FROM optimization_runs WHERE id = ?", runId);







        long candidateVersionId = trial.lng("candidate_aeb_version_id");



        long scenarioId = optRun.lng("scenario_id");







        // Tạo bài kiểm thử hồi quy (Regression Test)



        long regressionTestId = regressionService.createTest(



                projectId, userId, candidateVersionId, scenarioId, true, true, null,



                "Verification test for MOBO candidate (Run #" + runId + ", Trial #" + ((int) trial.lng("trial_number")) + ")");







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



