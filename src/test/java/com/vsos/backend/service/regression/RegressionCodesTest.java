package com.vsos.backend.service.regression;

import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Trạng thái hiển thị của test và khuyến nghị (màn 5). */
class RegressionCodesTest {

    private static RegressionTestRow test(String executionStatus, String verdict) {
        return new RegressionTestRow(30L, 1L, 20L, 10L, 11L, 3L, "vehicsim-kinematic-1.0", "t", Map.of(), executionStatus, verdict,
                0L, 0L, 5L, null, null);
    }

    private static RecommendationRow recommendation(String status) {
        return new RecommendationRow(77L, 30L, 11L, status, 5L, null, null, null, null, null);
    }

    @Test
    void aFailedTestWithoutADecisionIsBlocked() {
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "REGRESSED"), recommendation("PENDING_REVIEW"))).isEqualTo("BLOCKED");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "FAILED"), null)).isEqualTo("BLOCKED");
    }

    @Test
    void aDecisionOnAFailedTestIsShownInsteadOfBlocked() {
        // Reviewer đã Reject khuyến nghị của một test trượt: danh sách phải hiện "Rejected", không che bằng "Blocked".
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "FAILED"), recommendation("REJECTED"))).isEqualTo("REJECT");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "REGRESSED"), recommendation("MORE_TESTS_REQUESTED")))
                .isEqualTo("REQUEST_MORE_TESTS");
    }

    @Test
    void aPassedTestFollowsTheDecision() {
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), recommendation("PENDING_REVIEW"))).isEqualTo("PENDING");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), recommendation("ACCEPTED"))).isEqualTo("ACCEPT");
    }

    /** REC-001 hiện "Chờ duyệt" dù candidate đã thành bản cơ sở qua REC-002 (backend từ chối duyệt): nay là SUPERSEDED. */
    @Test
    void aPendingRecommendationWhoseCandidateWasDecidedElsewhereIsSuperseded() {
        RegressionTestRow passed = test("COMPLETED", "PASSED");
        assertThat(RegressionCodes.recommendationStatus(passed, recommendation("PENDING_REVIEW"), "ARCHIVED", "BASELINE")).isEqualTo("SUPERSEDED");
        assertThat(RegressionCodes.recommendationStatus(passed, null, "BASELINE", "REJECTED")).isEqualTo("SUPERSEDED");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "REGRESSED"), null, "BASELINE", "BASELINE"))
                .as("test trượt nhưng candidate đã được quyết định ở test khác").isEqualTo("SUPERSEDED");
    }

    @Test
    void aPendingRecommendationAfterTheBaselineChangedSaysSo() {
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), null, "ARCHIVED", "CANDIDATE")).isEqualTo("BASELINE_CHANGED");
    }

    @Test
    void decidedOrStillValidRecommendationsKeepTheirStatus() {
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), recommendation("ACCEPTED"), "ARCHIVED", "BASELINE"))
                .as("chính khuyến nghị đã Accept vẫn là ACCEPT").isEqualTo("ACCEPT");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), null, "BASELINE", "CANDIDATE")).isEqualTo("PENDING");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "FAILED"), null, "BASELINE", "CANDIDATE")).isEqualTo("BLOCKED");
        assertThat(RegressionCodes.recommendationStatus(test("COMPLETED", "PASSED"), null, null, null)).as("thiếu phiên bản: giữ cũ").isEqualTo("PENDING");
        assertThat(RegressionCodes.recommendationStatusLabel("SUPERSEDED", "PENDING")).isEqualTo("Superseded");
        assertThat(RegressionCodes.recommendationStatusLabel("BASELINE_CHANGED", "PENDING")).isEqualTo("Baseline changed");
    }

    @Test
    void theStatusLabelSaysBlockedOnlyWhenBlocked() {
        assertThat(RegressionCodes.recommendationStatusLabel("BLOCKED", "PENDING")).isEqualTo("Blocked");
        assertThat(RegressionCodes.recommendationStatusLabel("REJECT", "REJECT")).isEqualTo("Rejected");
    }

    @Test
    void displayStatusMergesRegressedIntoFailedAndRunErrorsIntoError() {
        assertThat(RegressionCodes.displayStatus(test("COMPLETED", "PASSED"))).isEqualTo("PASSED");
        assertThat(RegressionCodes.displayStatus(test("COMPLETED", "REGRESSED"))).isEqualTo("FAILED");
        assertThat(RegressionCodes.displayStatus(test("FAILED", "PENDING"))).isEqualTo("ERROR");
        assertThat(RegressionCodes.displayStatus(test("RUNNING", "PENDING"))).isEqualTo("RUNNING");
        assertThat(RegressionCodes.displayStatus(test("CANCELLED", "PENDING"))).as("người dùng hủy, không phải lỗi").isEqualTo("CANCELLED");
    }
}
