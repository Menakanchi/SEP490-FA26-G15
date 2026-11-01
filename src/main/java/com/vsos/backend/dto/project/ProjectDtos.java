package com.vsos.backend.dto.project;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.List;

public final class ProjectDtos {

    private ProjectDtos() {
    }

    public record ProjectRequest(String name, String description, @JsonProperty("carla_vehicle_model_id") Long vehicleId) {
    }

    public record DeleteProjectRequest(@JsonProperty("confirm_name") String confirmName) {
    }

    public record AdoptRequest(String reason, Boolean confirmed) {
    }

    public record VehicleOption(
            long id,
            String name,
            @JsonProperty("is_default") boolean isDefault,
            @JsonProperty("length_m") Double lengthM,
            @JsonProperty("width_m") Double widthM,
            @JsonProperty("mass_kg") Double massKg,
            @JsonProperty("max_brake_decel_mps2") Double maxBrakeDecelMps2) {
    }

    public enum JourneyStepKey { SCENARIO, BASELINE, RESULTS, IMPROVE, VERIFY }

    public enum JourneyStatus { TODO, RUNNING, DONE, FAILED }

    public record JourneyStep(JourneyStepKey key, JourneyStatus status) {
    }

    public record JourneyCounts(
            int families,
            int variants,
            @JsonProperty("baseline_completed") int baselineCompleted,
            @JsonProperty("baseline_running") int baselineRunning,
            @JsonProperty("baseline_failed") int baselineFailed,
            @JsonProperty("families_baseline_done") int familiesBaselineDone,
            @JsonProperty("families_baseline_pending") int familiesBaselinePending,
            int safe,
            @JsonProperty("near_misses") int nearMisses,
            int collisions,
            @JsonProperty("false_activations") int falseActivations,
            int datasets,
            int candidates,
            @JsonProperty("optimizations_running") int optimizationsRunning,
            @JsonProperty("regressions_running") int regressionsRunning,
            @JsonProperty("regressions_completed") int regressionsCompleted,
            @JsonProperty("last_regression_id") Long lastRegressionId,
            @JsonProperty("last_verdict") String lastVerdict) {
    }

    public record ProjectJourney(
            @JsonProperty("project_id") long projectId,
            int round,
            @JsonProperty("baseline_label") String baselineLabel,
            List<JourneyStep> steps,
            JourneyStepKey next,
            JourneyCounts counts,
            @JsonProperty("last_activity_at") LocalDateTime lastActivityAt) {
    }

    public record ProjectItem(
            long id,
            String name,
            String description,
            String status,
            @JsonProperty("vehicle_id") Long vehicleId,
            @JsonProperty("vehicle_name") String vehicleName,
            @JsonProperty("baseline_label") String baselineLabel,
            @JsonProperty("family_count") int familyCount,
            @JsonProperty("run_count") int runCount,
            @JsonProperty("regression_count") int regressionCount,
            @JsonProperty("has_running_work") boolean hasRunningWork,
            @JsonProperty("created_date") LocalDateTime createdDate,
            @JsonProperty("updated_at") LocalDateTime updatedAt,
            ProjectJourney journey) {
    }

    public record ProjectList(
            List<ProjectItem> items,
            @JsonProperty("active_count") int activeCount,
            @JsonProperty("active_limit") int activeLimit) {
    }
}
