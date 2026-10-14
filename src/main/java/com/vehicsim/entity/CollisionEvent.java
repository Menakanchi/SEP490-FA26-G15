package com.vehicsim.entity;

import com.vehicsim.entity.enums.CollisionType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "collision_events", uniqueConstraints = {
        @UniqueConstraint(name = "uq_ce_run_frame", columnNames = {"simulation_run_id", "frame", "other_actor_type_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CollisionEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "simulation_run_id", nullable = false)
    private SimulationRun simulationRun;

    @Column(nullable = false)
    private Integer frame;

    @Column(name = "simulation_time_s", nullable = false, precision = 10, scale = 3)
    private BigDecimal simulationTimeS;

    @Column(name = "other_actor_type_id", length = 100)
    private String otherActorTypeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "collision_type", nullable = false, length = 20)
    @Builder.Default
    private CollisionType collisionType = CollisionType.FRONT;

    @Column(name = "impact_speed_mps", precision = 8, scale = 3)
    private BigDecimal impactSpeedMps;

    @Column(name = "normal_impulse_x", precision = 12, scale = 4)
    private BigDecimal normalImpulseX;

    @Column(name = "normal_impulse_y", precision = 12, scale = 4)
    private BigDecimal normalImpulseY;

    @Column(name = "normal_impulse_z", precision = 12, scale = 4)
    private BigDecimal normalImpulseZ;

    @Column(name = "location_x_m", precision = 10, scale = 3)
    private BigDecimal locationXM;

    @Column(name = "location_y_m", precision = 10, scale = 3)
    private BigDecimal locationYM;

    @Column(name = "location_z_m", precision = 10, scale = 3)
    private BigDecimal locationZM;
}
