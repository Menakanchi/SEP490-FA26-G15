package com.vsos.backend.service.regression;

import com.vsos.backend.dto.regression.RegressionRecords.DecidedRecommendation;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.dto.regression.RegressionRecords.RunInfo;
import com.vsos.backend.dto.regression.RegressionRecords.VehicleInfo;
import com.vsos.backend.dto.regression.RegressionResponses.BaselineItem;
import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionHistory;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionItem;
import com.vsos.backend.dto.regression.RegressionResponses.ExportCandidate;
import com.vsos.backend.dto.regression.RegressionResponses.ExportDecision;
import com.vsos.backend.dto.regression.RegressionResponses.ExportManifest;
import com.vsos.backend.dto.regression.RegressionResponses.ExportPair;
import com.vsos.backend.dto.regression.RegressionResponses.ExportScenario;
import com.vsos.backend.dto.regression.RegressionResponses.ExportVehicle;
import com.vsos.backend.dto.regression.RegressionResponses.ExportVersion;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionExport;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionSummary;
import com.vsos.backend.dto.regression.RegressionResponses.SimulatorCaveat;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.common.Csv;
import com.vsos.backend.common.Vs;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Phần đọc quanh regression của màn 5: nguồn của candidate, cảnh báo bộ mô phỏng, gói kết quả xuất ra (JSON / CSV) và lịch sử quyết
 * định / chuỗi baseline. Chỉ đọc — không ghi DB, không tính lại verdict (verdict do {@link RegressionService}).
 */
@Service
public class RegressionReportService {

    /** Khoá của gói xuất; đổi cấu trúc gói thì tăng phiên bản. */
    public static final String EXPORT_SCHEMA = "vehicsim.regression-export/v1";

    /** Đường tải OpenSCENARIO của một run (route có sẵn); ghi vào gói để tái chạy từng run mà không phải dựng ZIP. */
    static final String XOSC_URL = "/api/v1/vehicsim/runs/%d/xosc";

    /** Cột CSV, cùng tên khoá với {@link ExportPair}; ba mục tiêu ADR-040 ở cuối. */
    private static final List<String> CSV_COLUMNS = List.of("variant", "baseline_run_id", "candidate_run_id", "seed", "baseline_outcome",
            "candidate_outcome", "change", "baseline_false_activation", "candidate_false_activation", "min_ttc_delta_s",
            "baseline_rms_jerk_mps3", "candidate_rms_jerk_mps3", "baseline_impact_speed_mps", "candidate_impact_speed_mps",
            "baseline_stopping_distance_m", "candidate_stopping_distance_m");

    private final RegressionRepository repo;
    private final Queries queries;
    private final RegressionService regression;

    public RegressionReportService(RegressionRepository repo, Queries queries, RegressionService regression) {
        this.repo = repo;
        this.queries = queries;
        this.regression = regression;
    }

    // ------------------------------------------------------------------ nguồn candidate / cảnh báo bộ mô phỏng

    /** Candidate tạo thủ công hay từ một chiến dịch tối ưu (chỉ đọc); version không tồn tại thì null. */
    public CandidateSource candidateSource(long candidateVersionId) {
        return repo.candidateSource(candidateVersionId);
    }

    /** Số CARLA chưa hiệu chuẩn phanh (TD-17): chỉ để quan sát / đối chiếu. Bộ động học thì không có cảnh báo. */
    public static SimulatorCaveat simulatorCaveat(String simulatorVersion) {
        return RunService.isCarla(simulatorVersion) ? new SimulatorCaveat(true, false) : null;
    }

    // ------------------------------------------------------------------ gói kết quả

    private RegressionTestRow completedTest(long testId) {
        RegressionTestRow test = repo.findTest(queries.currentProject().lng("id"), testId);
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        if (!test.completed()) {
            throw new TestNotFinishedException("regression test chưa chạy xong hoặc bị lỗi nên chưa xuất được gói kết quả");
        }
        return test;
    }

    /** Gói JSON: manifest tái lập + tham số + tiêu chí + từng cặp run + quyết định. Không có email người dùng. */
    public RegressionExport export(long testId) {
        RegressionTestRow test = completedTest(testId);
        Row baseline = repo.findVersion(test.baselineVersionId());
        Row candidate = repo.findVersion(test.candidateVersionId());
        Row scenario = repo.findScenario(test.scenarioId());
        VehicleInfo vehicle = repo.vehicleInfo(test.vehicleModelId());
        RecommendationRow rec = regression.recommendationFor(testId);
        RegressionSummary summary = regression.summary(test);

        List<Long> nameIds = new ArrayList<>();
        nameIds.add(test.createdBy());
        nameIds.add(rec == null ? null : rec.reviewedBy());
        Map<Long, String> names = queries.displayNames(nameIds);

        Map<Long, RunInfo> runInfo = repo.runInfo(summary.pairs().stream().map(PairResult::candidateRunId).toList());
        List<ExportPair> pairs = summary.pairs().stream().map(p -> exportPair(p, runInfo.get(p.candidateRunId()))).toList();
        // Mọi cặp của một test cùng bộ mô phỏng nên cùng bước thời gian; lấy từ run thật thay vì hằng của phiên bản code đang chạy.
        RunInfo firstRun = runInfo.values().stream().findFirst().orElse(null);

        ExportManifest manifest = new ExportManifest(
                EXPORT_SCHEMA,
                Vs.iso(Vs.now()),
                RegressionCodes.testCode(testId),
                RegressionCodes.recommendationCode(testId),
                test.simulatorVersion(),
                simulatorCaveat(test.simulatorVersion()),
                vehicle == null ? null : new ExportVehicle(vehicle.carlaBlueprintId(), vehicle.displayName(), vehicle.massKg(), vehicle.maxBrakeDecelMps2()),
                firstRun == null ? null : firstRun.fixedDeltaSeconds(),
                firstRun == null ? null : firstRun.maxDurationS(),
                RunService.VARIANT_FORMAT,
                // Chưa có cấu hình build ghi commit vào ứng dụng (cần sửa pom.xml dùng chung): để null, không đoán.
                null,
                new ExportScenario(scenario.lng("id"), scenario.str("code"), scenario.str("name")),
                test.scenarioSet(),
                new ExportVersion(test.baselineVersionId(), Vs.versionLabel(baseline)),
                new ExportCandidate(test.candidateVersionId(), Vs.versionLabel(candidate), candidateSource(test.candidateVersionId())),
                RegressionCodes.displayStatus(test),
                names.get(test.createdBy()),
                Vs.iso(test.createdDate()),
                test.finishedAt() == null ? null : Vs.iso(test.finishedAt()));

        ExportDecision decision = new ExportDecision(
                RegressionCodes.displayDecision(rec),
                rec == null ? null : names.get(rec.reviewedBy()),
                rec != null && rec.reviewedAt() != null ? Vs.iso(rec.reviewedAt()) : null,
                rec == null ? null : rec.reviewNotes(),
                rec == null ? null : rec.reviewConditions());

        return new RegressionExport(manifest, regression.parameterDiff(test.baselineVersionId(), test.candidateVersionId()),
                summary.criteria(), summary.counts(), summary.rates(), summary.medianMinTtc(), pairs, decision);
    }

    private static ExportPair exportPair(PairResult p, RunInfo info) {
        return new ExportPair(
                p.variantId(), p.label(), p.baselineRunId(), p.candidateRunId(),
                // Seed của run candidate bằng seed của run baseline (FK ép ở MySQL).
                info == null ? null : info.randomSeed(),
                p.baselineOutcome(), p.candidateOutcome(), p.change(), p.baselineFalseActivation(), p.candidateFalseActivation(),
                p.minTtcDeltaS(),
                String.format(Locale.ROOT, XOSC_URL, p.baselineRunId()),
                String.format(Locale.ROOT, XOSC_URL, p.candidateRunId()),
                p.baselineRmsJerkMps3(), p.candidateRmsJerkMps3(), p.baselineImpactSpeedMps(), p.candidateImpactSpeedMps(),
                p.baselineStoppingDistanceM(), p.candidateStoppingDistanceM());
    }

    /** Một dòng mỗi cặp baseline–candidate; mọi ô qua {@link Csv#cell} (chống công thức), CRLF như failures.csv. */
    public String exportCsv(long testId) {
        StringBuilder csv = new StringBuilder(String.join(",", CSV_COLUMNS)).append("\r\n");
        for (ExportPair p : export(testId).pairs()) {
            List<Object> cells = Arrays.asList(p.variant(), p.baselineRunId(), p.candidateRunId(), p.seed(), p.baselineOutcome(),
                    p.candidateOutcome(), p.change(), p.baselineFalseActivation(), p.candidateFalseActivation(), p.minTtcDeltaS(),
                    p.baselineRmsJerkMps3(), p.candidateRmsJerkMps3(), p.baselineImpactSpeedMps(), p.candidateImpactSpeedMps(),
                    p.baselineStoppingDistanceM(), p.candidateStoppingDistanceM());
            csv.append(cells.stream().map(Csv::cell).collect(Collectors.joining(","))).append("\r\n");
        }
        return csv.toString();
    }

    // ------------------------------------------------------------------ lịch sử quyết định / chuỗi baseline

    public DecisionHistory decisionHistory() {
        long projectId = queries.currentProject().lng("id");
        Map<Long, Row> versions = new LinkedHashMap<>();
        queries.versions(projectId, false).forEach(v -> versions.put(v.lng("id"), v));
        List<DecidedRecommendation> decided = repo.decidedRecommendations(projectId);
        Map<Long, String> names = queries.displayNames(decided.stream().map(DecidedRecommendation::reviewedBy).toList());

        List<DecisionItem> decisions = new ArrayList<>();
        Map<Long, DecisionItem> promotions = new LinkedHashMap<>();
        for (DecidedRecommendation d : decided) {
            DecisionItem item = new DecisionItem(
                    RegressionCodes.recommendationCode(d.testId()),
                    RegressionCodes.testCode(d.testId()),
                    d.testId(),
                    label(versions, d.baselineVersionId()),
                    label(versions, d.candidateVersionId()),
                    RegressionCodes.decisionOf(d.status()),
                    names.get(d.reviewedBy()),
                    d.reviewedAt() == null ? null : Vs.iso(d.reviewedAt()),
                    d.reviewNotes(),
                    d.reviewConditions());
            decisions.add(item);
            if ("ACCEPTED".equals(d.status())) {
                promotions.put(d.candidateVersionId(), item);
            }
        }

        List<BaselineItem> baselines = new ArrayList<>();
        for (Row v : versions.values()) {
            String status = v.str("status");
            if (!"BASELINE".equals(status) && !"ARCHIVED".equals(status)) {
                continue;
            }
            // Không có quyết định Accept nào nâng bản này = baseline khởi tạo của project (bootstrap).
            DecisionItem promotion = promotions.get(v.lng("id"));
            baselines.add(new BaselineItem(v.lng("id"), v.lng("version_no"), Vs.versionLabel(v), status,
                    promotion == null ? null : promotion.reviewedBy(),
                    promotion == null ? null : promotion.reviewedAt(),
                    promotion == null ? null : promotion.regressionCode(),
                    promotion == null ? null : promotion.reason()));
        }
        return new DecisionHistory(decisions, baselines);
    }

    private static String label(Map<Long, Row> versions, long id) {
        Row v = versions.get(id);
        return v == null ? "#" + id : Vs.versionLabel(v);
    }
}
