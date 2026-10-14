package com.vehicsim.entity;

import com.vehicsim.entity.enums.ScenarioSource;
import com.vehicsim.entity.enums.TimeOfDay;
import com.vehicsim.entity.enums.ValidationStatus;
import com.vehicsim.entity.enums.Weather;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "scenario_versions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_sv_no", columnNames = {"scenario_id", "version_no"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScenarioVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scenario_id", nullable = false)
    private Scenario scenario;

    @Column(name = "version_no", nullable = false)
    private Integer versionNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ScenarioSource source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_version_id")
    private ScenarioVersion parentVersion;

    @Column(name = "natural_language_input", columnDefinition = "TEXT")
    private String naturalLanguageInput;

    @Column(name = "llm_model", length = 100)
    private String llmModel;

    @Column(name = "scenario_ir_json", nullable = false, columnDefinition = "JSON")
    private String scenarioIrJson;

    @Column(name = "ego_speed_kmh", precision = 6, scale = 2)
    private BigDecimal egoSpeedKmh;

    @Column(name = "trigger_distance_m", precision = 6, scale = 2)
    private BigDecimal triggerDistanceM;

    @Column(name = "pedestrian_speed_mps", precision = 5, scale = 2)
    private BigDecimal pedestrianSpeedMps;

    @Column(name = "stops_at_curb")
    private Boolean stopsAtCurb;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Weather weather;

    @Enumerated(EnumType.STRING)
    @Column(name = "time_of_day", length = 20)
    private TimeOfDay timeOfDay;

    @Column(name = "road_friction", precision = 4, scale = 2)
    private BigDecimal roadFriction;

    @Column(name = "openscenario_version", length = 20)
    private String openscenarioVersion;

    @Column(name = "openscenario_content", columnDefinition = "LONGTEXT")
    private String openscenarioContent;

    @Column(name = "opendrive_content", columnDefinition = "LONGTEXT")
    private String opendriveContent;

    @Column(name = "map_name", length = 100)
    private String mapName;

    @Enumerated(EnumType.STRING)
    @Column(name = "validation_status", nullable = false, length = 30)
    @Builder.Default
    private ValidationStatus validationStatus = ValidationStatus.NOT_VALIDATED;

    @Column(name = "status_message", columnDefinition = "TEXT")
    private String statusMessage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdByUser;

    @CreationTimestamp
    @Column(name = "created_date", nullable = false, updatable = false)
    private LocalDateTime createdDate;
}
