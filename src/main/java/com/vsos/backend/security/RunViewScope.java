package com.vsos.backend.security;

import java.util.ArrayList;
import java.util.List;

/**
 * Phạm vi xem lượt chạy của một request (route xem lượt chạy CARLA: danh sách, số đo, tệp, video).
 * <ul>
 *   <li>ADMIN: mọi project ({@link #all()});</li>
 *   <li>EXPERIENCER: chỉ lượt do chính mình chạy trong project đang mở ({@link #own});</li>
 *   <li>ENGINEER / REVIEWER: mọi lượt của project đang mở; project đó đã bị {@link ReviewerScope} giới hạn trong workspace
 *       mình là thành viên, nên cả workspace xem chung ({@link #project}).</li>
 * </ul>
 * {@code null} nghĩa là không lọc theo trường đó.
 */
public record RunViewScope(Long projectId, Long creatorId) {

    public static RunViewScope all() {
        return new RunViewScope(null, null);
    }

    public static RunViewScope project(long projectId) {
        return new RunViewScope(projectId, null);
    }

    public static RunViewScope own(long projectId, long userId) {
        return new RunViewScope(projectId, userId);
    }

    /** Điều kiện SQL nối sau {@code WHERE ...}: mỗi điều kiện bắt đầu bằng " AND ", tham số thêm vào {@code args} đúng thứ tự. */
    public String sql(String alias, List<Object> args) {
        StringBuilder sb = new StringBuilder();
        if (projectId != null) {
            sb.append(" AND ").append(alias).append("project_id = ?");
            args.add(projectId);
        }
        if (creatorId != null) {
            sb.append(" AND ").append(alias).append("created_by_user_id = ?");
            args.add(creatorId);
        }
        return sb.toString();
    }

    public Object[] with(List<Object> args, Object... first) {
        List<Object> all = new ArrayList<>(List.of(first));
        all.addAll(args);
        return all.toArray();
    }
}
