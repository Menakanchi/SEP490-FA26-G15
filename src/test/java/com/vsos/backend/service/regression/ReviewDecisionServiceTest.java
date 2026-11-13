package com.vsos.backend.service.regression;

import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.exception.regression.RegressionExceptions.DecisionNotAllowedException;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.regression.RegressionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test report (Report 5.1) for {@link ReviewDecisionService#decide}: the Reviewer's Accept / Reject /
 * Request-more-tests decision. Test design: Equivalence Partitioning + Boundary Value Analysis.
 * Each method maps to one UTCID column of the "ReviewDecision" sheet. Repository is mocked.
 */
class ReviewDecisionServiceTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;
    private static final long REC_ID = 77L;
    private static final long CREATOR = 5L;
    private static final long REVIEWER = 9L;

    private RegressionRepository repo;
    private ReviewDecisionService service;

    private String projectStatus;
    private String workspaceStatus;
    private boolean member;
    private boolean testExists;
    private String executionStatus;
    private String verdict;
    private boolean recommendationExists;
    private String recommendationStatus;
    private Map<Long, String> versionStatus;

    @BeforeEach
    void setUp() {
        repo = mock(RegressionRepository.class);
        service = new ReviewDecisionService(repo);
        projectStatus = "ACTIVE";
        workspaceStatus = "ACTIVE";
        member = true;
        testExists = true;
        executionStatus = "COMPLETED";
        verdict = "PASSED";
        recommendationExists = true;
        recommendationStatus = "PENDING_REVIEW";
        versionStatus = new LinkedHashMap<>(Map.of(BASELINE, "BASELINE", CANDIDATE, "CANDIDATE"));
    }

    private void arrange() {
        Row scope = member ? new Row(Map.of("project_status", projectStatus, "workspace_status", workspaceStatus)) : null;
        when(repo.lockReviewAccess(eq(PROJECT), anyLong())).thenReturn(scope);
        when(repo.lockTest(PROJECT, TEST)).thenReturn(testExists
                ? new RegressionTestRow(TEST, PROJECT, 20L, BASELINE, CANDIDATE, 3L, "vehicsim-kinematic-1.0", "t", Map.of(),
                executionStatus, verdict, 0L, 0L, CREATOR, null, null)
                : null);
        when(repo.lockRecommendation(TEST)).thenReturn(recommendationExists
                ? new RecommendationRow(REC_ID, TEST, CANDIDATE, recommendationStatus, CREATOR, null, null, null, null, null)
                : null);
        when(repo.lockVersionStatuses(BASELINE, CANDIDATE)).thenReturn(versionStatus);
    }

    private void decide(long userId, String decision, String reason, String conditions, boolean confirmed) {
        arrange();
        service.decide(PROJECT, TEST, userId, decision, reason, conditions, confirmed);
    }

    private void expectRefused(long userId, String decision, String reason, boolean confirmed,
                               Class<? extends Throwable> type, String messagePart) {
        assertThatThrownBy(() -> decide(userId, decision, reason, null, confirmed))
                .isInstanceOf(type).hasMessageContaining(messagePart);
        verifyNothingWritten();
    }

    private void verifyNothingWritten() {
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
        verify(repo, never()).rejectVersion(anyLong());
        verify(repo, never()).saveReview(anyLong(), anyString(), anyString(), anyLong(), any(), any());
    }

    // ---------- Normal (EP valid classes) ----------

    @Test
    @DisplayName("UTCID01 ACCEPT on a PASSED test archives the baseline, then promotes the candidate")
    void utcid01() {
        decide(REVIEWER, "ACCEPT", "đủ bằng chứng", null, true);
        InOrder order = inOrder(repo);
        order.verify(repo).archiveVersion(BASELINE);
        order.verify(repo).promoteToBaseline(CANDIDATE);
        order.verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("đủ bằng chứng"), isNull());
    }

    @Test
    @DisplayName("UTCID02 REJECT on a FAILED test rejects the candidate and keeps the baseline")
    void utcid02() {
        verdict = "FAILED";
        decide(REVIEWER, "REJECT", "tăng phanh oan", null, true);
        verify(repo).rejectVersion(CANDIDATE);
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
        verify(repo).saveReview(eq(REC_ID), eq("REJECTED"), eq("REJECT"), eq(REVIEWER), eq("tăng phanh oan"), isNull());
    }

    @Test
    @DisplayName("UTCID03 REQUEST_MORE_TESTS changes no AEB version")
    void utcid03() {
        decide(REVIEWER, "REQUEST_MORE_TESTS", "cần thêm ca mưa", null, true);
        verify(repo, never()).archiveVersion(anyLong());
        verify(repo, never()).promoteToBaseline(anyLong());
        verify(repo, never()).rejectVersion(anyLong());
        verify(repo).saveReview(eq(REC_ID), eq("MORE_TESTS_REQUESTED"), eq("REQUEST_MORE_TESTS"), eq(REVIEWER), eq("cần thêm ca mưa"), isNull());
    }

    @Test
    @DisplayName("UTCID04 ACCEPT stores the conditions stripped")
    void utcid04() {
        decide(REVIEWER, "ACCEPT", "đạt", "  theo dõi thêm 2 tuần  ", true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("đạt"), eq("theo dõi thêm 2 tuần"));
    }

    @Test
    @DisplayName("UTCID05 ACCEPT is allowed after an earlier REQUEST_MORE_TESTS")
    void utcid05() {
        recommendationStatus = "MORE_TESTS_REQUESTED";
        decide(REVIEWER, "ACCEPT", "đã bổ sung ca", null, true);
        verify(repo).promoteToBaseline(CANDIDATE);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("đã bổ sung ca"), isNull());
    }

    @Test
    @DisplayName("UTCID06 REJECT is allowed when the run ended in execution error (status FAILED)")
    void utcid06() {
        executionStatus = "FAILED";
        verdict = null;
        decide(REVIEWER, "REJECT", "test lỗi", null, true);
        verify(repo).rejectVersion(CANDIDATE);
    }

    @Test
    @DisplayName("UTCID07 REJECT is allowed even when the baseline changed (only ACCEPT checks the baseline)")
    void utcid07() {
        verdict = "FAILED";
        versionStatus.put(BASELINE, "ARCHIVED");
        decide(REVIEWER, "REJECT", "không đạt", null, true);
        verify(repo).rejectVersion(CANDIDATE);
    }

    // ---------- Boundary (BVA) ----------

    @Test
    @DisplayName("UTCID08 reason of 1 character (min valid length) is accepted")
    void utcid08() {
        decide(REVIEWER, "ACCEPT", "x", null, true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("x"), isNull());
    }

    @Test
    @DisplayName("UTCID09 reason of 0 characters is refused")
    void utcid09() {
        expectRefused(REVIEWER, "ACCEPT", "", true, DecisionNotAllowedException.class, "lý do");
    }

    @Test
    @DisplayName("UTCID10 reason of whitespace only is refused")
    void utcid10() {
        expectRefused(REVIEWER, "ACCEPT", "   ", true, DecisionNotAllowedException.class, "lý do");
    }

    @Test
    @DisplayName("UTCID11 reason with surrounding whitespace is stored stripped")
    void utcid11() {
        decide(REVIEWER, "ACCEPT", "  x  ", null, true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("x"), isNull());
    }

    @Test
    @DisplayName("UTCID12 reason of 4000 characters (API max) is stored unchanged")
    void utcid12() {
        String reason = "a".repeat(4000);
        decide(REVIEWER, "ACCEPT", reason, null, true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq(reason), isNull());
    }

    @Test
    @DisplayName("UTCID13 reviewer id = recommendation creator id is refused (self-review)")
    void utcid13() {
        expectRefused(CREATOR, "ACCEPT", "x", true, DecisionNotAllowedException.class, "không tự duyệt");
    }

    @Test
    @DisplayName("UTCID14 reviewer id = creator id - 1 is accepted")
    void utcid14() {
        decide(CREATOR - 1, "ACCEPT", "x", null, true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(CREATOR - 1), eq("x"), isNull());
    }

    @Test
    @DisplayName("UTCID15 reviewer id = creator id + 1 is accepted")
    void utcid15() {
        decide(CREATOR + 1, "ACCEPT", "x", null, true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(CREATOR + 1), eq("x"), isNull());
    }

    @Test
    @DisplayName("UTCID16 conditions of whitespace only are stored as null")
    void utcid16() {
        decide(REVIEWER, "ACCEPT", "x", "   ", true);
        verify(repo).saveReview(eq(REC_ID), eq("ACCEPTED"), eq("ACCEPT"), eq(REVIEWER), eq("x"), isNull());
    }

    // ---------- Abnormal (EP invalid classes) ----------

    @Test
    @DisplayName("UTCID17 decision outside the allowed set is refused")
    void utcid17() {
        expectRefused(REVIEWER, "MAYBE", "x", true, DecisionNotAllowedException.class, "decision");
    }

    @Test
    @DisplayName("UTCID18 decision in lower case is refused (case sensitive)")
    void utcid18() {
        expectRefused(REVIEWER, "accept", "x", true, DecisionNotAllowedException.class, "decision");
    }

    // DEF-RV-01 (fixed 13/11/2026): List.of(...).contains(null) used to throw NullPointerException before the decision check.
    @Test
    @DisplayName("UTCID19 null decision is refused with a decision error")
    void utcid19() {
        expectRefused(REVIEWER, null, "x", true, DecisionNotAllowedException.class, "decision");
    }

    @Test
    @DisplayName("UTCID20 null reason is refused")
    void utcid20() {
        expectRefused(REVIEWER, "ACCEPT", null, true, DecisionNotAllowedException.class, "lý do");
    }

    @Test
    @DisplayName("UTCID21 decision without confirmation is refused")
    void utcid21() {
        expectRefused(REVIEWER, "ACCEPT", "x", false, DecisionNotAllowedException.class, "xác nhận");
    }

    @Test
    @DisplayName("UTCID22 reviewer who is not a member of the project's workspace gets not found")
    void utcid22() {
        member = false;
        expectRefused(REVIEWER, "ACCEPT", "x", true, NotFoundException.class, "regression test");
    }

    @Test
    @DisplayName("UTCID23 archived project is read-only")
    void utcid23() {
        projectStatus = "ARCHIVED";
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "lưu trữ");
    }

    @Test
    @DisplayName("UTCID24 archived workspace is read-only")
    void utcid24() {
        workspaceStatus = "ARCHIVED";
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "lưu trữ");
    }

    @Test
    @DisplayName("UTCID25 unknown regression test gets not found")
    void utcid25() {
        testExists = false;
        expectRefused(REVIEWER, "ACCEPT", "x", true, NotFoundException.class, "regression test");
    }

    @Test
    @DisplayName("UTCID26 test still PENDING cannot be decided")
    void utcid26() {
        executionStatus = "PENDING";
        expectRefused(REVIEWER, "REJECT", "x", true, TestNotFinishedException.class, "chưa chạy xong");
    }

    @Test
    @DisplayName("UTCID27 test still RUNNING cannot be decided")
    void utcid27() {
        executionStatus = "RUNNING";
        expectRefused(REVIEWER, "REJECT", "x", true, TestNotFinishedException.class, "chưa chạy xong");
    }

    @Test
    @DisplayName("UTCID28 test without a recommendation cannot be decided")
    void utcid28() {
        recommendationExists = false;
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "không có khuyến nghị");
    }

    @Test
    @DisplayName("UTCID29 recommendation already ACCEPTED cannot be decided again")
    void utcid29() {
        recommendationStatus = "ACCEPTED";
        expectRefused(REVIEWER, "REJECT", "x", true, DecisionNotAllowedException.class, "đã có quyết định cuối");
    }

    @Test
    @DisplayName("UTCID30 recommendation already REJECTED cannot be decided again")
    void utcid30() {
        recommendationStatus = "REJECTED";
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "đã có quyết định cuối");
    }

    @Test
    @DisplayName("UTCID31 ACCEPT on a FAILED test is refused")
    void utcid31() {
        verdict = "FAILED";
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "chưa qua regression");
    }

    @Test
    @DisplayName("UTCID32 ACCEPT on a REGRESSED test is refused")
    void utcid32() {
        verdict = "REGRESSED";
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "chưa qua regression");
    }

    @Test
    @DisplayName("UTCID33 ACCEPT is refused when the candidate was already decided in another test")
    void utcid33() {
        versionStatus.put(CANDIDATE, "REJECTED");
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "đã được quyết định");
    }

    @Test
    @DisplayName("UTCID34 REJECT is refused when the candidate is already the baseline")
    void utcid34() {
        versionStatus.put(CANDIDATE, "BASELINE");
        expectRefused(REVIEWER, "REJECT", "x", true, DecisionNotAllowedException.class, "đã được quyết định");
    }

    @Test
    @DisplayName("UTCID35 ACCEPT is refused when the baseline changed since the test ran")
    void utcid35() {
        versionStatus.put(BASELINE, "ARCHIVED");
        expectRefused(REVIEWER, "ACCEPT", "x", true, DecisionNotAllowedException.class, "baseline đã đổi");
    }
}
