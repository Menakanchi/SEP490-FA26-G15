package com.vehicsim.entity;

import com.vehicsim.entity.enums.RegressionExecutionStatus;
import com.vehicsim.entity.enums.RegressionVerdict;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "regression_tests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegressionTest {

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
    @JoinColumn(name = "baseline_aeb_version_id", nullable = false)
    private AebVersion baselineAebVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_aeb_version_id", nullable = false)
    private AebVersion candidateAebVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carla_vehicle_model_id", nullable = false)
    private CarlaVehicleModel carlaVehicleModel;

    @Column(name = "simulator_version", nullable = false, length = 30)
    private String simulatorVersion;

    @Column(length = 150)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "pass_criteria_json", nullable = false, columnDefinition = "JSON")
    private String passCriteriaJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "execution_status", nullable = false, length = 30)
    @Builder.Default
    private RegressionExecutionStatus executionStatus = RegressionExecutionStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private RegressionVerdict verdict = RegressionVerdict.PENDING;

    @Column(name = "total_scenarios", nullable = false)
    @Builder.Default
    private Integer totalScenarios = 0;

    @Column(name = "fixed_scenarios", nullable = false)
    @Builder.Default
    private Integer fixedScenarios = 0;

    @Column(name = "regressed_scenarios", nullable = false)
    @Builder.Default
    private Integer regressedScenarios = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;
}
