package com.vsos.backend.service.regression;

import static org.assertj.core.api.Assertions.assertThat;

import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.Evidence;
import org.junit.jupiter.api.Test;

/** Bằng chứng "Biên Pareto" của khuyến nghị theo nguồn candidate; trước đây luôn ghi "chưa chạy". */
class ParetoEvidenceTest {

    @Test
    void aTrialOnTheParetoFrontPasses() {
        Evidence e = RegressionViewService.paretoEvidence(new CandidateSource("OPTIMIZATION", 1L, "MOBO thử", 3L, 3, true));
        assertThat(e.status()).isEqualTo("PASS");
        assertThat(e.detail()).isEqualTo("Trial #3 is on the Pareto front of MOBO thử");
    }

    @Test
    void aTrialOffTheParetoFrontFails() {
        Evidence e = RegressionViewService.paretoEvidence(new CandidateSource("OPTIMIZATION", 1L, null, 4L, 4, false));
        assertThat(e.status()).isEqualTo("FAIL");
        assertThat(e.detail()).isEqualTo("Trial #4 is not on the Pareto front of run #1");
    }

    @Test
    void aManualCandidateHasNoParetoEvidence() {
        assertThat(RegressionViewService.paretoEvidence(new CandidateSource("MANUAL", null, null, null, null, null)).status()).isEqualTo("NOT_RUN");
        assertThat(RegressionViewService.paretoEvidence(null).status()).isEqualTo("NOT_RUN");
    }
}
