package com.vehicsim.service;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.dto.RegressionRecords.RecommendationRow;
import com.vehicsim.dto.RegressionRecords.RegressionTestRow;
import com.vehicsim.exception.RegressionExceptions.DecisionNotAllowedException;
import com.vehicsim.exception.RegressionExceptions.TestNotFinishedException;
import com.vehicsim.repository.RegressionRepository;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Quyết định của Reviewer trên khuyến nghị: Accept / Reject / Request more tests (luật cứng 5 trong AGENTS.md, ADR-025).
 * Không bao giờ tự Accept: cần lý do và xác nhận; test không PASSED không Accept được; người tạo khuyến nghị không tự duyệt;
 * baseline đã đổi hoặc candidate đã được quyết định ở test khác thì phải chạy lại regression. Quyền REVIEWER kiểm ở controller.
 */
@Service
public class ReviewDecisionService {

    private final RegressionRepository repo;

    public ReviewDecisionService(RegressionRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public void decide(long projectId, long testId, long userId, String decision, String reason, String conditions, boolean confirmed) {
        if (!RegressionCodes.DECISIONS.contains(decision)) {
            throw new DecisionNotAllowedException("decision phải thuộc " + RegressionCodes.DECISIONS);
        }
        if (reason == null || reason.isBlank()) {
            throw new DecisionNotAllowedException("phải ghi lý do cho quyết định");
        }
        if (!confirmed) {
            throw new DecisionNotAllowedException("phải xác nhận quyết định dựa trên bằng chứng mô phỏng");
        }
        // Khoá dòng test + khuyến nghị: hai Reviewer duyệt cùng lúc thì người thứ hai chờ rồi thấy "đã có quyết định cuối".
        RegressionTestRow test = repo.lockTest(projectId, testId);
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        if ("PENDING".equals(test.executionStatus()) || "RUNNING".equals(test.executionStatus())) {
            throw new TestNotFinishedException("regression test chưa chạy xong");
        }
        RecommendationRow rec = repo.lockRecommendation(testId);
        if (rec == null) {
            throw new DecisionNotAllowedException("regression test này không có khuyến nghị để duyệt");
        }
        if ("ACCEPTED".equals(rec.status()) || "REJECTED".equals(rec.status())) {
            throw new DecisionNotAllowedException("recommendation này đã có quyết định cuối");
        }
        if (rec.createdBy() == userId) {
            throw new DecisionNotAllowedException("người tạo khuyến nghị không tự duyệt được");
        }
        if ("ACCEPT".equals(decision) && !"PASSED".equals(test.verdict())) {
            throw new DecisionNotAllowedException("không thể Accept: ứng viên chưa qua regression test");
        }
        // Hai test cùng baseline có thể cùng PASSED; Accept một cái sẽ đổi baseline hoặc trạng thái candidate,
        // nên cái còn lại phải chạy lại thay vì ghi đè. Khoá cả hai version: hai test khác nhau cùng baseline không thể cùng Accept.
        Map<Long, String> statusOf = repo.lockVersionStatuses(test.baselineVersionId(), test.candidateVersionId());
        if ((decision.equals("ACCEPT") || decision.equals("REJECT")) && !"CANDIDATE".equals(statusOf.get(test.candidateVersionId()))) {
            throw new DecisionNotAllowedException("candidate này đã được quyết định ở một regression test khác");
        }
        if ("ACCEPT".equals(decision) && !"BASELINE".equals(statusOf.get(test.baselineVersionId()))) {
            throw new DecisionNotAllowedException("baseline đã đổi kể từ khi chạy test — hãy chạy lại regression với baseline hiện hành");
        }

        if ("ACCEPT".equals(decision)) {
            // Một project chỉ có một BASELINE (uq_aeb_versions_one_baseline): hạ bản cũ TRƯỚC.
            repo.archiveVersion(test.baselineVersionId());
            repo.promoteToBaseline(test.candidateVersionId());
        } else if ("REJECT".equals(decision)) {
            repo.rejectVersion(test.candidateVersionId());
        }
        String cond = conditions == null ? "" : conditions.strip();
        repo.saveReview(rec.id(), RegressionCodes.statusOfDecision(decision), userId, reason.strip(), cond.isEmpty() ? null : cond);
        AuditLog.event("regression.decide", "success", "user_id", userId, "test_id", testId, "decision", decision,
                "candidate_aeb_version_id", test.candidateVersionId(), "baseline_aeb_version_id", test.baselineVersionId());
    }
}
