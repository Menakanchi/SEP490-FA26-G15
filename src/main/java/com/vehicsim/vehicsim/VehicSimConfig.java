package com.vehicsim.vehicsim;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Luồng chạy mô phỏng nền và việc nhặt lại run bỏ dở khi khởi động (thay cho hàng đợi Celery ở backend cũ). */
@Slf4j
@Configuration
public class VehicSimConfig {

    /** CARLA chỉ có một server/GPU nên luôn chạy lần lượt; bộ động học nhẹ nên chạy song song. */
    @Bean(name = "simulationExecutor")
    public TaskExecutor simulationExecutor(VehicSimProperties props) {
        int size = "carla".equals(props.simulator()) ? 1 : Math.max(1, props.runConcurrency());
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(size);
        executor.setMaxPoolSize(size);
        executor.setQueueCapacity(100_000);
        executor.setThreadNamePrefix("vs-sim-");
        executor.setDaemon(true);
        return executor;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverUnfinishedRuns(ApplicationReadyEvent event) {
        VehicSimProperties props = event.getApplicationContext().getBean(VehicSimProperties.class);
        if (!props.recoverOnStartup()) {
            return;
        }
        try {
            int n = event.getApplicationContext().getBean(RunService.class).recoverUnfinished();
            if (n > 0) {
                log.info("Đã đưa {} run bỏ dở trở lại hàng đợi", n);
            }
        } catch (RuntimeException e) {
            log.warn("Không nhặt lại được run bỏ dở: {}", e.getMessage());
        }
    }
}
