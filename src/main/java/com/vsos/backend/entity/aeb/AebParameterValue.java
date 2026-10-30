package com.vsos.backend.entity.aeb;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "aeb_parameter_values")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AebParameterValue {

    @EmbeddedId
    private AebParameterValueId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("aebVersionId")
    @JoinColumn(name = "aeb_version_id", nullable = false)
    private AebVersion aebVersion;

    @ManyToOne(fetch = FetchType.EAGER)
    @MapsId("parameterId")
    @JoinColumn(name = "parameter_id", nullable = false)
    private AebParameter parameter;

    @Column(name = "param_value", nullable = false, precision = 14, scale = 6)
    private BigDecimal paramValue;
}
