package com.vehicsim.vehicsim;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cấu hình vòng MVP (prefix {@code vehicsim}); tên biến môi trường và mặc định giữ như backend Python cũ.
 *
 * @param simulator          kinematic | carla — bộ mô phỏng cho các run MỚI
 * @param carlaCommand       lệnh gọi CLI CARLA, dạng JSON list, vd. ["python","worker/run_variant.py","--map","Town05"]
 * @param carlaVersion       phiên bản server CARLA mà run mới yêu cầu (server báo khác thì run FAILED)
 * @param dataRoot           thư mục chứa bundle/result/video của run CARLA
 * @param runMode            async (hàng đợi luồng nền) | inline (chạy ngay trong request, dùng cho test)
 * @param simulationTimeoutS trần thời gian của một run
 * @param runConcurrency     số run chạy song song (CARLA luôn là 1)
 * @param workerPython       lệnh Python chạy worker
 * @param workerDir          thư mục worker/ (tương đối với thư mục chạy backend)
 * @param recoverOnStartup   nhặt lại run PENDING / RUNNING bỏ dở khi khởi động
 */
@ConfigurationProperties(prefix = "vehicsim")
public record VehicSimProperties(
        String simulator,
        String carlaCommand,
        String carlaVersion,
        String dataRoot,
        String runMode,
        int simulationTimeoutS,
        int runConcurrency,
        String workerPython,
        String workerDir,
        boolean recoverOnStartup) {
}
