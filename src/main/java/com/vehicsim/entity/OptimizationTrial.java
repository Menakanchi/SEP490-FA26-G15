package com.vehicsim.entity;

import com.vehicsim.entity.enums.SamplingSource;
import com.vehicsim.entity.enums.TrialStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "optimization_trials", uniqueConstraints = {
        @UniqueConstraint(name = "uq_ot_run_trial", columnNames = {"optimization_run_id", "trial_number"}),
        @UniqueConstraint(name = "uq_ot_candidate", columnNames = {"candidate_aeb_version_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptimizationTrial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optimization_run_id", nullable = false)
    private OptimizationRun optimizationRun;

    @Column(name = "trial_number", nullable = false)
    private Integer trialNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_aeb_version_id", nullable = false)
    private AebVersion candidateAebVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "sampling_source", nullable = false, length = 30)
    @Builder.Default
    private SamplingSource samplingSource = SamplingSource.INITIAL_DESIGN;

    @Column(name = "acquisition_value", precision = 14, scale = 6)
    private BigDecimal acquisitionValue;

    @Column(name = "collision_rate_pct", precision = 5, scale = 2)
    private BigDecimal collisionRatePct;

    @Column(name = "false_activation_rate_pct", precision = 5, scale = 2)
    private BigDecimal falseActivationRatePct;

    @Column(name = "comfort_max_jerk_mps3", precision = 8, scale = 3)
    private BigDecimal comfortMaxJerkMps3;

    @Column(name = "objective_values_json", columnDefinition = "JSON")
    private String objectiveValuesJson;

    @Column(precision = 18, scale = 6)
    private BigDecimal score;

    @Column(name = "constraint_violated", nullable = false)
    @Builder.Default
    private Boolean constraintViolated = false;

    @Column(name = "is_pareto_optimal", nullable = false)
    @Builder.Default
    private Boolean isParetoOptimal = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private TrialStatus status = TrialStatus.PENDING;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
