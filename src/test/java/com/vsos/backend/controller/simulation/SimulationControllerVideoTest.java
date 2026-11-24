package com.vsos.backend.controller.simulation;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vsos.backend.common.Vs;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.service.simulation.SimulationViewService;
import com.vsos.backend.service.simulation.TelemetryMetricsService;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Endpoint video xem lại của run CARLA: đúng loại nội dung, tua được bằng Range (trình phát cần), và 404 khi không có video. */
class SimulationControllerVideoTest {

    @TempDir
    Path directory;

    private MockMvc mvc(RunService runs) {
        VehicSimAccess access = mock(VehicSimAccess.class);
        when(access.projectId()).thenReturn(1L);
        return MockMvcBuilders.standaloneSetup(new SimulationController(mock(SimulationViewService.class), runs, mock(TelemetryMetricsService.class), access,
                mock(com.vsos.backend.service.simulation.RunCollectionService.class)))
                .build();
    }

    @Test
    void servesTheMp4AndHonoursRangeRequests() throws Exception {
        Path video = directory.resolve("video.mp4");
        Files.write(video, new byte[]{0, 1, 2, 3, 4, 5, 6, 7, 8, 9});
        RunService runs = mock(RunService.class);
        when(runs.carlaVideo(1L, 42L)).thenReturn(video);
        MockMvc mvc = mvc(runs);

        mvc.perform(get("/api/v1/vehicsim/runs/42/carla-video"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("video/mp4"))
                .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
                .andExpect(content().bytes(Files.readAllBytes(video)));

        mvc.perform(get("/api/v1/vehicsim/runs/42/carla-video").header(HttpHeaders.RANGE, "bytes=2-5"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string(HttpHeaders.CONTENT_RANGE, "bytes 2-5/10"))
                .andExpect(content().bytes(new byte[]{2, 3, 4, 5}));
    }

    @Test
    void aRunWithoutVideoIsNotFound() throws Exception {
        RunService runs = mock(RunService.class);
        when(runs.carlaVideo(1L, 7L)).thenThrow(new Vs.NotFoundException("CARLA video"));
        MockMvc mvc = mvc(runs);
        // standalone MockMvc không có @ControllerAdvice của app nên NotFoundException nổi lên nguyên vẹn; ở app thật advice đổi nó thành 404.
        assertThatThrownBy(() -> mvc.perform(get("/api/v1/vehicsim/runs/7/carla-video")))
                .hasCauseInstanceOf(Vs.NotFoundException.class);
    }
}
