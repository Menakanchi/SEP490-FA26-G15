package com.vsos.backend.entity.aeb;

import com.vsos.backend.entity.enums.AebParameterCategory;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "aeb_parameters")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AebParameter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AebParameterCategory category;

    @Column(nullable = false, length = 20)
    private String unit;

    @Column(name = "min_value", nullable = false, precision = 14, scale = 6)
    private BigDecimal minValue;

    @Column(name = "max_value", nullable = false, precision = 14, scale = 6)
    private BigDecimal maxValue;

    @Column(name = "default_value", nullable = false, precision = 14, scale = 6)
    private BigDecimal defaultValue;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "sort_order", nullable = false, unique = true)
    private Short sortOrder;
}
