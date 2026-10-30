package com.vsos.backend.service.regression;

import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.exception.regression.RegressionExceptions.DecisionNotAllowedException;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.regression.RegressionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật cứng 5 (AGENTS.md): không bao giờ tự Accept — test FAILED không Accept được, quyết định cần lý do và xác nhận,
 * baseline đã đổi thì không Accept test cũ, người tạo khuyến nghị không tự duyệt (TD-33). Logic thật, repository giả.
 */
class RegressionDecisionTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;
    private static final long CREATOR = 5L;
    private static final long REVIEWER = 9L;

    private RegressionRepository repo;
    private ReviewDecisionService service;

    private String executionStatus;
    private String verdict;
    private String recommendationStatus;
    private Map<Long, String> versionStatus;

    @BeforeEach
    void setUp() {
        repo = mock(RegressionRepository.class);
        service = new ReviewDecisionService(repo);
        executionStatus = "COMPLETED";
        verdict = "PASSED";
        recommendationStatus = "PENDING_REVIEW";
        versionStatus = new LinkedHashMap<>(Map.of(BASELINE, "BASELINE", CANDIDATE, "CANDIDATE"));
    }

    private void arrange() {
        when(repo.lockTest(PROJECT, TEST)).thenReturn(new RegressionTestRow(TEST, PROJECT, 20L, BASELINE, CANDIDATE, 3L, "vehicsim-kinematic-1.0",
                "t", Map.of(), executionStatus, verdict, 0L, 0L, CREATOR, null, null));
        when(repo.lockRecommendation(TEST)).thenReturn(new RecommendationRow(77L, TEST, CANDIDATE, recommendationStatus, CREATOR, null, null,
                null, null, null));
        when(repo.lockVersionStatuses(BASELINE, CANDIDATE)).thenReturn(versionStatus);
    }

    private void decide(String decision, String reason, boolean confirmed, long userId) {
        arrange();
        service.decide(PROJECT, TEST, userId, decision, reason, null, confirmed);
    }

    private void assertRejected(String decision, String reason, boolean confirmed, long userId, Class<? extends Throwable> type, String messagePart) {
        assertThatThrownBy(() -> decide(decision, reason, confirmed, userId)).isInstanceOf(type).hasMessageContaining(messagePart);
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
        verify(repo, never()).rejectVersion(anyLong());
        verify(repo, never()).saveReview(anyLong(), anyString(), anyLong(), any(), any());
    }

    @Test
    void decisionNeedsAReasonAndExplicitConfirmation() {
        assertRejected("ACCEPT", "  ", true, REVIEWER, DecisionNotAllowedException.class, "lý do");
        assertRejected("ACCEPT", null, true, REVIEWER, DecisionNotAllowedException.class, "lý do");
        assertRejected("ACCEPT", "đủ bằng chứng", false, REVIEWER, DecisionNotAllowedException.class, "xác nhận");
    }

    @Test
    void unknownDecisionIsRejected() {
        assertRejected("MAYBE", "x", true, REVIEWER, DecisionNotAllowedException.class, "decision");
    }

    @Test
    void aFailedTestCanNeverBeAccepted() {
        verdict = "FAILED";
        assertRejected("ACCEPT", "x", true, REVIEWER, DecisionNotAllowedException.class, "chưa qua regression");
    }

    @Test
    void aTestThatHasNotFinishedCannotBeDecided() {
        executionStatus = "RUNNING";
        assertRejected("ACCEPT", "x", true, REVIEWER, TestNotFinishedException.class, "chưa chạy xong");
    }

    @Test
    void theAuthorOfTheRecommendationCannotApproveIt() {
        assertRejected("ACCEPT", "x", true, CREATOR, DecisionNotAllowedException.class, "không tự duyệt");
    }

    @Test
    void aFinalDecisionCannotBeOverwritten() {
        recommendationStatus = "ACCEPTED";
        assertRejected("REJECT", "x", true, REVIEWER, DecisionNotAllowedException.class, "đã có quyết định cuối");
    }

    @Test
    void acceptIsRefusedWhenTheBaselineChangedSinceTheTestRan() {
        versionStatus.put(BASELINE, "ARCHIVED");
        assertRejected("ACCEPT", "x", true, REVIEWER, DecisionNotAllowedException.class, "baseline đã đổi");
    }

    @Test
    void acceptOrRejectIsRefusedWhenTheCandidateWasAlreadyDecidedElsewhere() {
        versionStatus.put(CANDIDATE, "REJECTED");
        assertRejected("ACCEPT", "x", true, REVIEWER, DecisionNotAllowedException.class, "đã được quyết định");
        assertRejected("REJECT", "x", true, REVIEWER, DecisionNotAllowedException.class, "đã được quyết định");
    }

    @Test
    void acceptDemotesTheOldBaselineBeforePromotingTheCandidate() {
        decide("ACCEPT", "đủ bằng chứng", true, REVIEWER);
        InOrder order = inOrder(repo);
        order.verify(repo).archiveVersion(BASELINE);
        order.verify(repo).promoteToBaseline(CANDIDATE);
        order.verify(repo).saveReview(eq(77L), eq("ACCEPTED"), eq(REVIEWER), eq("đủ bằng chứng"), any());
    }

    @Test
    void rejectMarksTheCandidateButKeepsTheBaseline() {
        decide("REJECT", "không đạt", true, REVIEWER);
        verify(repo).rejectVersion(CANDIDATE);
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
    }

    @Test
    void requestingMoreTestsChangesNoVersion() {
        decide("REQUEST_MORE_TESTS", "cần thêm ca", true, REVIEWER);
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
        verify(repo, never()).rejectVersion(anyLong());
        verify(repo).saveReview(eq(77L), eq("MORE_TESTS_REQUESTED"), eq(REVIEWER), eq("cần thêm ca"), any());
    }
}
