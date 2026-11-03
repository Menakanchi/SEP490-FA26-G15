package com.vsos.backend.entity.regression;

import com.vsos.backend.entity.enums.RecommendationConfidence;
import com.vsos.backend.entity.enums.RecommendationStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import com.vsos.backend.entity.aeb.AebVersion;
import com.vsos.backend.entity.optimization.OptimizationRun;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.workspace.Project;

@Entity
@Table(name = "engineering_recommendations", uniqueConstraints = {
        @UniqueConstraint(name = "uq_er_regression", columnNames = {"regression_test_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EngineeringRecommendation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "regression_test_id", nullable = false)
    private RegressionTest regressionTest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_aeb_version_id", nullable = false)
    private AebVersion candidateAebVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optimization_run_id")
    private OptimizationRun optimizationRun;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private RecommendationConfidence confidence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private RecommendationStatus status = RecommendationStatus.PENDING_REVIEW;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_user_id")
    private User reviewedByUser;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "review_notes", columnDefinition = "TEXT")
    private String reviewNotes;

    @Column(name = "review_conditions", columnDefinition = "TEXT")
    private String reviewConditions;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
