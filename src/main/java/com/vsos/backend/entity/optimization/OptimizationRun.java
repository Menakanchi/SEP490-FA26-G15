package com.vsos.backend.entity.optimization;

import com.vsos.backend.entity.enums.AcquisitionFunction;
import com.vsos.backend.entity.enums.OptimizationAlgorithm;
import com.vsos.backend.entity.enums.OptimizationStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import com.vsos.backend.entity.aeb.AebVersion;
import com.vsos.backend.entity.scenario.Scenario;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.vehicle.CarlaVehicleModel;
import com.vsos.backend.entity.workspace.Project;

@Entity
@Table(name = "optimization_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OptimizationRun {

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
    @JoinColumn(name = "base_aeb_version_id", nullable = false)
    private AebVersion baseAebVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carla_vehicle_model_id", nullable = false)
    private CarlaVehicleModel carlaVehicleModel;

    @Column(name = "simulator_version", nullable = false, length = 30)
    private String simulatorVersion;

    @Column(nullable = false, length = 150)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private OptimizationAlgorithm algorithm;

    @Enumerated(EnumType.STRING)
    @Column(name = "acquisition_function", length = 20)
    private AcquisitionFunction acquisitionFunction;

    @Column(name = "n_initial_points")
    private Integer nInitialPoints;

    @Column(name = "search_space_json", nullable = false, columnDefinition = "JSON")
    private String searchSpaceJson;

    @Column(name = "objective_config_json", nullable = false, columnDefinition = "JSON")
    private String objectiveConfigJson;

    @Column(name = "max_trials", nullable = false)
    private Integer maxTrials;

    @Column(name = "random_seed")
    private Long randomSeed;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private OptimizationStatus status = OptimizationStatus.PENDING;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;
}
