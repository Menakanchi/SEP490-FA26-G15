package com.vsos.backend.entity.aeb;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class AebParameterValueId implements Serializable {

    @Column(name = "aeb_version_id")
    private Long aebVersionId;

    @Column(name = "parameter_id")
    private Integer parameterId;
}
