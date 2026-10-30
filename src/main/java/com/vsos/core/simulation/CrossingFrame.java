package com.vsos.core.simulation;

/**
 * Hệ tọa độ đặt ở điểm giao cắt: gốc tại tim làn ego trên vạch băng qua — port từ {@code CrossingFrame} của {@code worker/run_variant.py} (ADR-042).
 *
 * <p>{@code fwd}/{@code right} lấy thẳng từ {@code Transform.get_forward_vector()} / {@code get_right_vector()} của CARLA, không tự suy từ yaw vì CARLA
 * dùng hệ tay trái. Đổi sang hệ của bộ động học: dọc đường là {@code along}, ngang lấy bên TRÁI là dương ({@code left}).</p>
 */
public record CrossingFrame(double ox, double oy, double fx, double fy, double rx, double ry) {

    public double along(double x, double y) {
        return (x - ox) * fx + (y - oy) * fy;
    }

    public double left(double x, double y) {
        return -((x - ox) * rx + (y - oy) * ry);
    }

    public double velocityAlong(double vx, double vy) {
        return vx * fx + vy * fy;
    }

    public double velocityLeft(double vx, double vy) {
        return -(vx * rx + vy * ry);
    }
}
