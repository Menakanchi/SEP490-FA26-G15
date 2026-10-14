package com.vehicsim.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "carla_vehicle_models")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CarlaVehicleModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "carla_blueprint_id", nullable = false, unique = true, length = 100)
    private String carlaBlueprintId;

    @Column(name = "display_name", length = 150)
    private String displayName;

    @Column(name = "length_m", nullable = false, precision = 6, scale = 3)
    private BigDecimal lengthM;

    @Column(name = "width_m", nullable = false, precision = 6, scale = 3)
    private BigDecimal widthM;

    @Column(name = "height_m", nullable = false, precision = 6, scale = 3)
    private BigDecimal heightM;

    @Column(name = "num_wheels", nullable = false)
    @Builder.Default
    private Short numWheels = 4;

    @Column(name = "mass_kg", nullable = false, precision = 8, scale = 2)
    private BigDecimal massKg;

    @Column(name = "drag_coefficient", precision = 4, scale = 3)
    private BigDecimal dragCoefficient;

    @Column(name = "center_of_mass_x_m", precision = 6, scale = 3)
    private BigDecimal centerOfMassXM;

    @Column(name = "center_of_mass_y_m", precision = 6, scale = 3)
    private BigDecimal centerOfMassYM;

    @Column(name = "center_of_mass_z_m", precision = 6, scale = 3)
    private BigDecimal centerOfMassZM;

    @Column(name = "tire_friction", precision = 4, scale = 2)
    private BigDecimal tireFriction;

    @Column(name = "max_brake_torque_nm", precision = 8, scale = 2)
    private BigDecimal maxBrakeTorqueNm;

    @Column(name = "wheelbase_m", precision = 5, scale = 3)
    private BigDecimal wheelbaseM;

    @Column(name = "max_speed_mps", precision = 6, scale = 2)
    private BigDecimal maxSpeedMps;

    @Column(name = "max_brake_decel_mps2", nullable = false, precision = 5, scale = 2)
    private BigDecimal maxBrakeDecelMps2;

    @Column(name = "carla_full_brake_decel_mps2", precision = 5, scale = 2)
    private BigDecimal carlaFullBrakeDecelMps2;

    @Column(name = "is_supported", nullable = false)
    @Builder.Default
    private Boolean isSupported = true;
}
