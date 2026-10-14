package com.vehicsim.entity;

import com.vehicsim.entity.enums.AnalysisStatus;
import com.vehicsim.entity.enums.AnalysisType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "analysis_results")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(name = "analysis_type", nullable = false, length = 50)
    private AnalysisType analysisType;

    @Column(length = 50)
    private String method;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_id")
    private Scenario scenario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "aeb_version_id")
    private AebVersion aebVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optimization_run_id")
    private OptimizationRun optimizationRun;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(name = "config_json", columnDefinition = "JSON")
    private String configJson;

    @Column(name = "summary_json", nullable = false, columnDefinition = "JSON")
    private String summaryJson;

    @Column(name = "pass_rate", precision = 5, scale = 2)
    private BigDecimal passRate;

    @Column(name = "worst_case_run_id")
    private Long worstCaseRunId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private AnalysisStatus status = AnalysisStatus.PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;
}
