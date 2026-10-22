package com.vehicsim.core;

import java.util.LinkedHashMap;
import java.util.Map;

/** Kích thước và khả năng phanh của xe ego cho lõi mô phỏng. */
public record VehicleSpec(double lengthM, double widthM, double maxBrakeDecelMps2) {

    public static final VehicleSpec DEFAULT = new VehicleSpec(4.75, 1.93, 9.5);

    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("length_m", lengthM);
        out.put("width_m", widthM);
        out.put("max_brake_decel_mps2", maxBrakeDecelMps2);
        return out;
    }
}
