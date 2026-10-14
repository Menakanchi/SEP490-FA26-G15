package com.vehicsim.entity;

import com.vehicsim.entity.enums.*;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulation_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SimulationRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_id", nullable = false)
    private Scenario scenario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_version_id", nullable = false)
    private ScenarioVersion scenarioVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carla_vehicle_model_id", nullable = false)
    private CarlaVehicleModel carlaVehicleModel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "aeb_version_id", nullable = false)
    private AebVersion aebVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "simulator_type", nullable = false, length = 30)
    private SimulatorType simulatorType;

    @Column(name = "simulator_version", nullable = false, length = 30)
    private String simulatorVersion;

    @Column(name = "map_name", length = 100)
    private String mapName;

    @Column(name = "fixed_delta_seconds", nullable = false, precision = 6, scale = 4)
    @Builder.Default
    private BigDecimal fixedDeltaSeconds = new BigDecimal("0.0500");

    @Column(name = "max_duration_s", precision = 8, scale = 2)
    private BigDecimal maxDurationS;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SimulationPurpose purpose;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private SimulationStatus status = SimulationStatus.PENDING;

    @Column(name = "random_seed", nullable = false)
    private Long randomSeed;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "baseline_run_id")
    private SimulationRun baselineRun;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "regression_test_id")
    private RegressionTest regressionTest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optimization_trial_id")
    private OptimizationTrial optimizationTrial;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analysis_result_id")
    private AnalysisResult analysisResult;

    @Column(name = "run_config_json", columnDefinition = "JSON")
    private String runConfigJson;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private SimulationVerdict verdict;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", length = 30)
    private SimulationEndReason endReason;

    @Column(name = "simulated_duration_s", precision = 9, scale = 3)
    private BigDecimal simulatedDurationS;

    @Column(name = "collision_occurred")
    private Boolean collisionOccurred;

    @Column(name = "first_detection_time_s", precision = 8, scale = 3)
    private BigDecimal firstDetectionTimeS;

    @Column(name = "first_detection_distance_m", precision = 8, scale = 3)
    private BigDecimal firstDetectionDistanceM;

    @Column(name = "fcw_activated")
    private Boolean fcwActivated;

    @Column(name = "fcw_time_s", precision = 8, scale = 3)
    private BigDecimal fcwTimeS;

    @Column(name = "aeb_activated")
    private Boolean aebActivated;

    @Column(name = "aeb_activation_time_s", precision = 8, scale = 3)
    private BigDecimal aebActivationTimeS;

    @Column(name = "is_false_positive")
    private Boolean isFalsePositive;

    @Column(name = "is_false_negative")
    private Boolean isFalseNegative;

    @Column(name = "impact_speed_mps", precision = 8, scale = 3)
    private BigDecimal impactSpeedMps;

    @Column(name = "min_distance_m", precision = 10, scale = 3)
    private BigDecimal minDistanceM;

    @Column(name = "min_ttc_s", precision = 8, scale = 3)
    private BigDecimal minTtcS;

    @Column(name = "braking_response_time_s", precision = 8, scale = 3)
    private BigDecimal brakingResponseTimeS;

    @Column(name = "max_deceleration_mps2", precision = 8, scale = 3)
    private BigDecimal maxDecelerationMps2;

    @Column(name = "mean_deceleration_mps2", precision = 8, scale = 3)
    private BigDecimal meanDecelerationMps2;

    @Column(name = "max_jerk_mps3", precision = 8, scale = 3)
    private BigDecimal maxJerkMps3;

    @Column(name = "stopping_distance_m", precision = 8, scale = 3)
    private BigDecimal stoppingDistanceM;

    @Column(name = "telemetry_json", columnDefinition = "JSON")
    private String telemetryJson;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "worker_host", length = 150)
    private String workerHost;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "queued_at", nullable = false, updatable = false)
    private LocalDateTime queuedAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;
}
