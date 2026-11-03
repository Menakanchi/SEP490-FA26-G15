package com.vsos.backend.entity.analysis;

import com.vsos.backend.entity.enums.FailureCategory;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.vsos.backend.entity.aeb.AebParameter;

@Entity
@Table(name = "root_causes", uniqueConstraints = {
        @UniqueConstraint(name = "uq_rc_failure_code", columnNames = {"failure_id", "cause_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RootCause {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "failure_id", nullable = false)
    private Failure failure;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private FailureCategory category;

    @Column(name = "cause_code", nullable = false, length = 64)
    private String causeCode;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "aeb_parameter_id")
    private AebParameter aebParameter;

    @Column(precision = 4, scale = 3)
    private BigDecimal confidence;

    @Column(name = "is_primary", nullable = false)
    @Builder.Default
    private Boolean isPrimary = false;
}
