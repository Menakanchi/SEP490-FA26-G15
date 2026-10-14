package com.vehicsim.entity;

import com.vehicsim.entity.enums.DetectionSource;
import com.vehicsim.entity.enums.FailureCategory;
import com.vehicsim.entity.enums.FailureSeverity;
import com.vehicsim.entity.enums.FailureType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "failures", uniqueConstraints = {
        @UniqueConstraint(name = "uq_failures_run_type", columnNames = {"simulation_run_id", "failure_type"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Failure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "simulation_run_id", nullable = false)
    private SimulationRun simulationRun;

    @Enumerated(EnumType.STRING)
    @Column(name = "failure_type", nullable = false, length = 50)
    private FailureType failureType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private FailureCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FailureSeverity severity;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "detected_by", nullable = false, length = 20)
    @Builder.Default
    private DetectionSource detectedBy = DetectionSource.AUTO;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "labeled_by_user_id")
    private User labeledByUser;

    @Column(name = "labeled_at")
    private LocalDateTime labeledAt;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;
}
