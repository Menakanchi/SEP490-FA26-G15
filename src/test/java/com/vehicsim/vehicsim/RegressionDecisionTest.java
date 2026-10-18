package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật cứng 5 (AGENTS.md): không bao giờ tự Accept — test FAILED không Accept được, quyết định cần lý do và xác nhận,
 * baseline đã đổi thì không Accept test cũ, người tạo khuyến nghị không tự duyệt (TD-33). Logic thật, {@link Db} giả.
 */
class RegressionDecisionTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;
    private static final long CREATOR = 5L;
    private static final long REVIEWER = 9L;

    private Db db;
    private RegressionService service;

    private Map<String, Object> test;
    private Map<String, Object> recommendation;
    private Map<Long, String> versionStatus;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        service = new RegressionService(db, mock(Queries.class), mock(FamilyService.class), mock(RunService.class), mock(TransactionTemplate.class));
        test = new LinkedHashMap<>(Map.of("id", TEST, "execution_status", "COMPLETED", "verdict", "PASSED",
                "baseline_aeb_version_id", BASELINE, "candidate_aeb_version_id", CANDIDATE));
        recommendation = new LinkedHashMap<>(Map.of("id", 77L, "status", "PENDING_REVIEW", "created_by_user_id", CREATOR));
        versionStatus = new LinkedHashMap<>(Map.of(BASELINE, "BASELINE", CANDIDATE, "CANDIDATE"));
    }

    private void arrange() {
        when(db.first(startsWith("SELECT * FROM regression_tests"), any(Object[].class))).thenReturn(new Row(test));
        when(db.first(startsWith("SELECT * FROM engineering_recommendations"), any(Object[].class))).thenReturn(new Row(recommendation));
        when(db.list(contains("FROM aeb_versions WHERE id IN"), any(Object[].class))).thenReturn(
                versionStatus.entrySet().stream().map(e -> new Row(Map.of("id", e.getKey(), "status", e.getValue()))).toList());
    }

    private void decide(String decision, String reason, boolean confirmed, long userId) {
        arrange();
        service.decide(PROJECT, TEST, userId, decision, reason, null, confirmed);
    }

    private void assertRejected(String decision, String reason, boolean confirmed, long userId, String messagePart) {
        assertThatThrownBy(() -> decide(decision, reason, confirmed, userId))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining(messagePart);
        verify(db, never()).update(startsWith("UPDATE aeb_versions"), any(Object[].class));
        verify(db, never()).update(startsWith("UPDATE engineering_recommendations"), any(Object[].class));
    }

    @Test
    void decisionNeedsAReasonAndExplicitConfirmation() {
        assertRejected("ACCEPT", "  ", true, REVIEWER, "lý do");
        assertRejected("ACCEPT", null, true, REVIEWER, "lý do");
        assertRejected("ACCEPT", "đủ bằng chứng", false, REVIEWER, "xác nhận");
    }

    @Test
    void unknownDecisionIsRejected() {
        assertRejected("MAYBE", "x", true, REVIEWER, "decision");
    }

    @Test
    void aFailedTestCanNeverBeAccepted() {
        test.put("verdict", "FAILED");
        assertRejected("ACCEPT", "x", true, REVIEWER, "chưa qua regression");
    }

    @Test
    void aTestThatHasNotFinishedCannotBeDecided() {
        test.put("execution_status", "RUNNING");
        assertRejected("ACCEPT", "x", true, REVIEWER, "chưa chạy xong");
    }

    @Test
    void theAuthorOfTheRecommendationCannotApproveIt() {
        assertRejected("ACCEPT", "x", true, CREATOR, "không tự duyệt");
    }

    @Test
    void aFinalDecisionCannotBeOverwritten() {
        recommendation.put("status", "ACCEPTED");
        assertRejected("REJECT", "x", true, REVIEWER, "đã có quyết định cuối");
    }

    @Test
    void acceptIsRefusedWhenTheBaselineChangedSinceTheTestRan() {
        versionStatus.put(BASELINE, "ARCHIVED");
        assertRejected("ACCEPT", "x", true, REVIEWER, "baseline đã đổi");
    }

    @Test
    void acceptOrRejectIsRefusedWhenTheCandidateWasAlreadyDecidedElsewhere() {
        versionStatus.put(CANDIDATE, "REJECTED");
        assertRejected("ACCEPT", "x", true, REVIEWER, "đã được quyết định");
        assertRejected("REJECT", "x", true, REVIEWER, "đã được quyết định");
    }

    @Test
    void acceptDemotesTheOldBaselineBeforePromotingTheCandidate() {
        decide("ACCEPT", "đủ bằng chứng", true, REVIEWER);
        InOrder order = inOrder(db);
        order.verify(db).update(eq("UPDATE aeb_versions SET status = 'ARCHIVED' WHERE id = ?"), eq(BASELINE));
        order.verify(db).update(eq("UPDATE aeb_versions SET status = 'BASELINE' WHERE id = ?"), eq(CANDIDATE));
        order.verify(db).update(startsWith("UPDATE engineering_recommendations"), any(Object[].class));
    }

    @Test
    void rejectMarksTheCandidateButKeepsTheBaseline() {
        decide("REJECT", "không đạt", true, REVIEWER);
        verify(db).update(eq("UPDATE aeb_versions SET status = 'REJECTED' WHERE id = ?"), eq(CANDIDATE));
        verify(db, never()).update(eq("UPDATE aeb_versions SET status = 'ARCHIVED' WHERE id = ?"), any(Object[].class));
    }

    @Test
    void requestingMoreTestsChangesNoVersion() {
        decide("REQUEST_MORE_TESTS", "cần thêm ca", true, REVIEWER);
        verify(db, never()).update(startsWith("UPDATE aeb_versions"), any(Object[].class));
        verify(db).update(startsWith("UPDATE engineering_recommendations"), any(Object[].class));
    }
}
