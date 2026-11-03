package com.vsos.backend.entity.optimization;

import com.vsos.backend.entity.enums.SamplingSource;
import com.vsos.backend.entity.enums.TrialStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.vsos.backend.entity.aeb.AebVersion;
import com.vsos.backend.entity.workspace.Project;

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

    /** Mục tiêu 1 (cần MINIMIZE): độ êm phanh — RMS jerk, m/s3. */
    @Column(name = "rms_jerk_mps3", precision = 8, scale = 3)
    private BigDecimal rmsJerkMps3;

    /** Mục tiêu 2 (cần MINIMIZE): vận tốc lúc va chạm, m/s. */
    @Column(name = "impact_speed_mps", precision = 8, scale = 3)
    private BigDecimal impactSpeedMps;

    /** Mục tiêu 3 (cần MINIMIZE): quãng đường phanh dừng, m. */
    @Column(name = "stopping_distance_m", precision = 8, scale = 3)
    private BigDecimal stoppingDistanceM;

    @Column(name = "collision_rate_pct", precision = 5, scale = 2)
    private BigDecimal collisionRatePct;

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
