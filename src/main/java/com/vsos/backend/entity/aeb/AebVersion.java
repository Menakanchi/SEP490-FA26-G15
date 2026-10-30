package com.vsos.backend.entity.aeb;

import com.vsos.backend.entity.enums.AebVersionSource;
import com.vsos.backend.entity.enums.AebVersionStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.workspace.Project;

@Entity
@Table(name = "aeb_versions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_aeb_versions_no", columnNames = {"project_id", "version_no"}),
        @UniqueConstraint(name = "uq_aeb_versions_project_id", columnNames = {"project_id", "id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AebVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "version_no", nullable = false)
    private Integer versionNo;

    @Column(length = 100)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private AebVersionStatus status = AebVersionStatus.CANDIDATE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private AebVersionSource source = AebVersionSource.MANUAL;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_version_id")
    private AebVersion parentVersion;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "baseline_project_key", insertable = false, updatable = false)
    private Long baselineProjectKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;
}
