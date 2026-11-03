package com.vsos.backend.entity.regression;

import com.vsos.backend.entity.enums.RegressionChangeType;
import com.vsos.backend.entity.enums.RegressionOutcome;
import jakarta.persistence.*;
import lombok.*;
import com.vsos.backend.entity.scenario.ScenarioVersion;
import com.vsos.backend.entity.simulation.SimulationRun;

@Entity
@Table(name = "regression_test_items", uniqueConstraints = {
        @UniqueConstraint(name = "uq_rti_test_variant", columnNames = {"regression_test_id", "scenario_version_id"}),
        @UniqueConstraint(name = "uq_rti_candidate", columnNames = {"candidate_run_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegressionTestItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "regression_test_id", nullable = false)
    private RegressionTest regressionTest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_version_id", nullable = false)
    private ScenarioVersion scenarioVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "baseline_run_id", nullable = false)
    private SimulationRun baselineRun;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_run_id", nullable = false)
    private SimulationRun candidateRun;

    @Enumerated(EnumType.STRING)
    @Column(name = "baseline_outcome", length = 20)
    private RegressionOutcome baselineOutcome;

    @Enumerated(EnumType.STRING)
    @Column(name = "candidate_outcome", length = 20)
    private RegressionOutcome candidateOutcome;

    @Enumerated(EnumType.STRING)
    @Column(name = "change_type", length = 20)
    private RegressionChangeType changeType;

    @Column(name = "is_regression", nullable = false)
    @Builder.Default
    private Boolean isRegression = false;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
