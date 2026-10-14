package com.vehicsim.entity;

import com.vehicsim.entity.enums.TechRefType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "tech_references")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TechReference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ref_code", nullable = false, unique = true, length = 100)
    private String refCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "ref_type", nullable = false, length = 30)
    private TechRefType refType;

    @Column(name = "ref_name", nullable = false, length = 255)
    private String refName;

    @Column(name = "ref_value", precision = 30, scale = 12)
    private BigDecimal refValue;

    @Column(length = 30)
    private String unit;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "source_type", length = 50)
    private String sourceType;

    @Column(name = "source_title", length = 500)
    private String sourceTitle;

    @Column(length = 255)
    private String author;

    @Column(length = 255)
    private String organization;

    @Column(name = "publication_year")
    private Short publicationYear;

    @Column(length = 50)
    private String page;

    @Column(length = 1024)
    private String url;

    @Column(length = 255)
    private String doi;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
