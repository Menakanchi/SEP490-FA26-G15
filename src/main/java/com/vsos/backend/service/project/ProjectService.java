package com.vsos.backend.service.project;

import com.vsos.backend.common.Vs;
import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.project.ProjectDtos.AdoptRequest;
import com.vsos.backend.dto.project.ProjectDtos.JourneyCounts;
import com.vsos.backend.dto.project.ProjectDtos.JourneyStatus;
import com.vsos.backend.dto.project.ProjectDtos.JourneyStep;
import com.vsos.backend.dto.project.ProjectDtos.JourneyStepKey;
import com.vsos.backend.dto.project.ProjectDtos.ProjectItem;
import com.vsos.backend.dto.project.ProjectDtos.ProjectJourney;
import com.vsos.backend.dto.project.ProjectDtos.ProjectList;
import com.vsos.backend.dto.project.ProjectDtos.ProjectRequest;
import com.vsos.backend.dto.project.ProjectDtos.VehicleOption;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.regression.RegressionCodes;
import com.vsos.backend.service.simulation.RunService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.vsos.backend.dto.project.ProjectDtos.JourneyStatus.DONE;
import static com.vsos.backend.dto.project.ProjectDtos.JourneyStatus.FAILED;
import static com.vsos.backend.dto.project.ProjectDtos.JourneyStatus.RUNNING;
import static com.vsos.backend.dto.project.ProjectDtos.JourneyStatus.TODO;
import static com.vsos.backend.exception.project.ProjectError.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    public static final int MAX_ACTIVE = 3;
    public static final int NAME_MAX = 150;
    public static final int DESCRIPTION_MAX = 2000;

    private static final String ACTIVE = "ACTIVE";
    private static final String ARCHIVED = "ARCHIVED";
    private static final Set<String> RUN_ACTIVE = Set.of("PENDING", "RUNNING", "PAUSED");
    private static final Set<String> RUN_FAILED = Set.of("FAILED", "STOPPED");
    private static final Set<String> TEST_ACTIVE = Set.of("PENDING", "RUNNING");

    private final ProjectRepository projects;
    private final RunService runs;
    private final RegressionRepository regressions;

    public static void requireOwner(Row project, Object projectId, long userId) {
        if (project == null) {
            throw new ProjectException(PROJECT_NOT_FOUND, projectId);
        }
        if (project.get("workspace_id") != null || project.lng("created_by_user_id") != userId) {
            throw new ProjectException(PROJECT_NOT_YOURS, projectId);
        }
    }

    public ProjectList list(long userId) {
        List<ProjectItem> items = projects.listPersonal(userId).stream().map(this::toItem).toList();
        return new ProjectList(items, projects.countActivePersonal(userId), MAX_ACTIVE);
    }

    public List<VehicleOption> vehicles() {
        return projects.supportedVehicles().stream()
                .map(v -> new VehicleOption(v.lng("id"), v.str("name"), v.bool("is_default"), v.dbl("length_m"), v.dbl("width_m"),
                        v.dbl("mass_kg"), v.dbl("max_brake_decel_mps2")))
                .toList();
    }

    public ProjectItem get(long userId, long projectId) {
        return toItem(owned(userId, projectId));
    }

    public ProjectJourney journey(long userId, long projectId) {
        requireOwner(projects.row(projectId), projectId, userId);
        return journeyOf(projectId);
    }

    public ProjectItem create(long userId, ProjectRequest body) {
        String name = validName(userId, body.name(), 0);
        String description = validDescription(body.description());
        long vehicleId = supportedVehicle(body.vehicleId());
        requireFreeSlot(userId);
        long projectId = projects.insert(name, description, userId, vehicleId, Vs.now());
        AuditLog.event("project.create", "success", "project_id", projectId, "by", userId);
        return get(userId, projectId);
    }

    public ProjectItem update(long userId, long projectId, ProjectRequest body) {
        Row project = owned(userId, projectId);
        Long currentVehicle = project.getLong("carla_vehicle_model_id");
        String name = body.name() == null ? project.str("name") : validName(userId, body.name(), projectId);
        String description = body.description() == null ? project.str("description") : validDescription(body.description());
        Long vehicleId = body.vehicleId() == null ? currentVehicle : Long.valueOf(supportedVehicle(body.vehicleId()));
        long runCount = project.lng("run_count");
        if (runCount > 0 && !Objects.equals(vehicleId, currentVehicle)) {
            throw new ProjectException(VEHICLE_LOCKED, runCount, project.str("vehicle_name"));
        }
        projects.update(projectId, name, description, vehicleId, Vs.now());
        AuditLog.event("project.update", "success", "project_id", projectId, "by", userId);
        return get(userId, projectId);
    }

    public ProjectItem archive(long userId, long projectId) {
        Row project = owned(userId, projectId);
        if (ARCHIVED.equals(project.str("status"))) {
            throw new ProjectException(ALREADY_ARCHIVED, project.str("name"));
        }
        requireIdle(project);
        return changeStatus(userId, projectId, ARCHIVED);
    }

    public ProjectItem unarchive(long userId, long projectId) {
        Row project = owned(userId, projectId);
        if (ACTIVE.equals(project.str("status"))) {
            throw new ProjectException(NOT_ARCHIVED, project.str("name"));
        }
        requireFreeSlot(userId);
        return changeStatus(userId, projectId, ACTIVE);
    }

    public void delete(long userId, long projectId, String confirmName) {
        Row project = owned(userId, projectId);
        String name = project.str("name");
        if (confirmName == null || !confirmName.strip().equals(name)) {
            throw new ProjectException(CONFIRM_NAME_MISMATCH, name);
        }
        requireIdle(project);
        List<Long> runIds = projects.runIds(projectId);
        projects.delete(projectId);
        runIds.forEach(this::deleteRunFolder);
        AuditLog.event("project.delete", "success", "project_id", projectId, "runs", runIds.size(), "by", userId);
    }

    @Transactional
    public ProjectJourney adopt(long userId, long projectId, long testId, AdoptRequest body) {
        Row project = owned(userId, projectId);
        if (ARCHIVED.equals(project.str("status"))) {
            throw new ProjectException(PROJECT_ARCHIVED, project.str("name"));
        }
        String reason = body.reason() == null ? "" : body.reason().strip();
        if (reason.isEmpty()) {
            throw new ProjectException(REASON_REQUIRED);
        }
        if (!Boolean.TRUE.equals(body.confirmed())) {
            throw new ProjectException(CONFIRM_REQUIRED);
        }
        RegressionTestRow test = regressions.lockTest(projectId, testId);
        if (test == null) {
            throw new ProjectException(TEST_NOT_FOUND, testId);
        }
        if (TEST_ACTIVE.contains(test.executionStatus())) {
            throw new ProjectException(TEST_NOT_FINISHED, testId);
        }
        long baselineId = test.baselineVersionId();
        long candidateId = test.candidateVersionId();
        Map<Long, String> statusOf = regressions.lockVersionStatuses(baselineId, candidateId);
        Map<Long, Row> versions = regressions.versionsById(baselineId, candidateId);
        String baseline = Vs.versionLabel(versions.get(baselineId));
        String candidate = Vs.versionLabel(versions.get(candidateId));
        if (!test.completed() || !"PASSED".equals(test.verdict())) {
            throw new ProjectException(TEST_NOT_PASSED, candidate);
        }
        if (!"CANDIDATE".equals(statusOf.get(candidateId))) {
            throw new ProjectException(CANDIDATE_ALREADY_DECIDED, candidate);
        }
        if (!"BASELINE".equals(statusOf.get(baselineId))) {
            throw new ProjectException(BASELINE_CHANGED, baseline);
        }
        regressions.archiveVersion(baselineId);
        regressions.promoteToBaseline(candidateId);
        projects.appendVersionNote(candidateId, "Dùng làm baseline thay " + baseline + " sau kiểm chứng " + RegressionCodes.testCode(testId) + ": " + reason);
        AuditLog.event("project.adopt", "success", "project_id", projectId, "test_id", testId, "candidate_aeb_version_id", candidateId,
                "baseline_aeb_version_id", baselineId, "by", userId);
        return journeyOf(projectId);
    }

    private Row owned(long userId, long projectId) {
        Row project = projects.find(projectId);
        requireOwner(project, projectId, userId);
        return project;
    }

    private ProjectItem changeStatus(long userId, long projectId, String status) {
        projects.setStatus(projectId, status, Vs.now());
        AuditLog.event("project.status", "success", "project_id", projectId, "status", status, "by", userId);
        return get(userId, projectId);
    }

    private String validName(long userId, String raw, long projectId) {
        String name = raw == null ? "" : raw.strip();
        int length = name.codePointCount(0, name.length());
        if (name.isEmpty()) {
            throw new ProjectException(NAME_REQUIRED);
        }
        if (length > NAME_MAX) {
            throw new ProjectException(NAME_TOO_LONG, NAME_MAX, length);
        }
        if (name.codePoints().anyMatch(Character::isISOControl)) {
            throw new ProjectException(NAME_INVALID);
        }
        String existing = projects.existingName(userId, name, projectId);
        if (existing != null) {
            throw new ProjectException(NAME_DUPLICATE, existing);
        }
        return name;
    }

    private static String validDescription(String raw) {
        String description = raw == null ? "" : raw.strip();
        int length = description.codePointCount(0, description.length());
        if (length > DESCRIPTION_MAX) {
            throw new ProjectException(DESCRIPTION_TOO_LONG, DESCRIPTION_MAX, length);
        }
        return description.isEmpty() ? null : description;
    }

    private long supportedVehicle(Long requested) {
        Long vehicleId = projects.supportedVehicle(requested);
        if (vehicleId == null) {
            throw new ProjectException(VEHICLE_NOT_FOUND, requested);
        }
        return vehicleId;
    }

    private void requireFreeSlot(long userId) {
        int active = projects.countActivePersonal(userId);
        if (active >= MAX_ACTIVE) {
            throw new ProjectException(PROJECT_LIMIT_REACHED, active, MAX_ACTIVE);
        }
    }

    private static void requireIdle(Row project) {
        long work = project.lng("running_work");
        if (work > 0) {
            throw new ProjectException(PROJECT_BUSY, project.str("name"), work);
        }
    }

    private void deleteRunFolder(long runId) {
        try {
            FileSystemUtils.deleteRecursively(runs.runDir(runId));
        } catch (IOException e) {
            log.warn("Không xoá được thư mục run {}: {}", runId, e.getMessage());
        }
    }

    private ProjectItem toItem(Row p) {
        return new ProjectItem(p.lng("id"), p.str("name"), p.str("description"), p.str("status"),
                p.getLong("carla_vehicle_model_id"), p.str("vehicle_name"), p.str("baseline_label"),
                p.getInt("family_count"), p.getInt("run_count"), p.getInt("regression_count"), p.lng("running_work") > 0,
                p.ts("created_date"), p.ts("updated_at"), journeyOf(p.lng("id")));
    }

    private ProjectJourney journeyOf(long projectId) {
        Row summary = projects.journeySummary(projectId);
        Long baselineId = summary.getLong("baseline_id");
        List<Row> baselineRuns = baselineId == null ? List.of() : projects.latestBaselineRuns(projectId, baselineId);
        JourneyCounts counts = count(summary, projects.currentVariantFamilies(projectId), baselineRuns);
        List<JourneyStep> steps = steps(counts);
        return new ProjectJourney(projectId, Math.max(1, summary.getInt("rounds")), summary.str("baseline_label"), steps, next(steps),
                counts, summary.ts("last_activity_at"));
    }

    static JourneyCounts count(Row summary, Map<Long, Long> familyOfVariant, List<Row> baselineRuns) {
        Map<Long, Integer> variantsPerFamily = new HashMap<>();
        Map<Long, Integer> completedPerFamily = new HashMap<>();
        familyOfVariant.values().forEach(family -> variantsPerFamily.merge(family, 1, Integer::sum));
        int running = 0;
        int failed = 0;
        int safe = 0;
        int nearMisses = 0;
        int collisions = 0;
        int falseActivations = 0;
        for (Row run : baselineRuns) {
            Long family = familyOfVariant.get(run.lng("scenario_version_id"));
            if (family == null) {
                continue;
            }
            String status = run.str("status");
            if (RUN_ACTIVE.contains(status)) {
                running++;
            } else if (RUN_FAILED.contains(status)) {
                failed++;
            } else if ("COMPLETED".equals(status)) {
                completedPerFamily.merge(family, 1, Integer::sum);
                if (run.bool("is_false_positive")) {
                    falseActivations++;
                }
                switch (Vs.classifyOutcome(run.bool("collision_occurred"), run.dbl("min_ttc_s"), run.dbl("min_distance_m"))) {
                    case Vs.OUTCOME_COLLISION -> collisions++;
                    case Vs.OUTCOME_NEAR_MISS -> nearMisses++;
                    default -> safe++;
                }
            }
        }
        int completed = completedPerFamily.values().stream().mapToInt(Integer::intValue).sum();
        int familiesDone = (int) variantsPerFamily.entrySet().stream()
                .filter(e -> e.getValue().equals(completedPerFamily.get(e.getKey()))).count();
        return new JourneyCounts(summary.getInt("families"), familyOfVariant.size(), completed, running, failed, familiesDone,
                variantsPerFamily.size() - familiesDone, safe, nearMisses, collisions, falseActivations, summary.getInt("datasets"),
                summary.getInt("candidates"), summary.getInt("optimizations_running"), summary.getInt("regressions_running"),
                summary.getInt("regressions_completed"), summary.getLong("last_regression_id"), summary.str("last_verdict"));
    }

    static List<JourneyStep> steps(JourneyCounts c) {
        boolean laterWork = c.datasets() + c.candidates() + c.optimizationsRunning() + c.regressionsRunning() + c.regressionsCompleted() > 0;
        return List.of(
                new JourneyStep(JourneyStepKey.SCENARIO, c.variants() > 0 ? DONE : TODO),
                new JourneyStep(JourneyStepKey.BASELINE, baselineStatus(c)),
                new JourneyStep(JourneyStepKey.RESULTS, laterWork ? DONE : TODO),
                new JourneyStep(JourneyStepKey.IMPROVE, c.optimizationsRunning() > 0 ? RUNNING : c.candidates() > 0 ? DONE : TODO),
                new JourneyStep(JourneyStepKey.VERIFY, c.regressionsRunning() > 0 ? RUNNING : c.regressionsCompleted() > 0 ? DONE : TODO));
    }

    static JourneyStepKey next(List<JourneyStep> steps) {
        return steps.stream().filter(s -> s.status() != DONE).map(JourneyStep::key).findFirst().orElse(null);
    }

    private static JourneyStatus baselineStatus(JourneyCounts c) {
        if (c.baselineRunning() > 0) {
            return RUNNING;
        }
        if (c.familiesBaselineDone() > 0) {
            return DONE;
        }
        return c.baselineFailed() > 0 ? FAILED : TODO;
    }
}
