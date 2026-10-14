package com.vehicsim.entity;

import com.vehicsim.entity.enums.SensorType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "sensors", uniqueConstraints = {
        @UniqueConstraint(name = "uq_sensors_model_name", columnNames = {"carla_vehicle_model_id", "name"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Sensor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carla_vehicle_model_id", nullable = false)
    private CarlaVehicleModel carlaVehicleModel;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "sensor_type", nullable = false, length = 30)
    private SensorType sensorType;

    @Column(name = "carla_blueprint_id", nullable = false, length = 100)
    private String carlaBlueprintId;

    @Column(name = "location_x_m", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal locationXM = BigDecimal.ZERO;

    @Column(name = "location_y_m", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal locationYM = BigDecimal.ZERO;

    @Column(name = "location_z_m", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal locationZM = BigDecimal.ZERO;

    @Column(name = "rotation_pitch_deg", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal rotationPitchDeg = BigDecimal.ZERO;

    @Column(name = "rotation_yaw_deg", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal rotationYawDeg = BigDecimal.ZERO;

    @Column(name = "rotation_roll_deg", nullable = false, precision = 7, scale = 3)
    @Builder.Default
    private BigDecimal rotationRollDeg = BigDecimal.ZERO;

    @Column(name = "attributes_json", columnDefinition = "JSON")
    private String attributesJson;

    @Column(name = "is_enabled", nullable = false)
    @Builder.Default
    private Boolean isEnabled = true;
}
