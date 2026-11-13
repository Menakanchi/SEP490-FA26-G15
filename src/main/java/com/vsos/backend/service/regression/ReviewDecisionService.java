package com.vsos.backend.service.regression;

import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.exception.regression.RegressionExceptions.DecisionNotAllowedException;
import com.vsos.backend.exception.regression.RegressionExceptions.TestNotFinishedException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.regression.RegressionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class ReviewDecisionService {

    private final RegressionRepository repo;

    public ReviewDecisionService(RegressionRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public void decide(long projectId, long testId, long userId, String decision, String reason, String conditions, boolean confirmed) {
        // List.of(...).contains(null) ném NullPointerException: kiểm null trước để trả lỗi nghiệp vụ (DEF-RV-01).
        if (decision == null || !RegressionCodes.DECISIONS.contains(decision)) {
            throw new DecisionNotAllowedException("decision phải thuộc " + RegressionCodes.DECISIONS);
        }
        if (reason == null || reason.isBlank()) {
            throw new DecisionNotAllowedException("phải ghi lý do cho quyết định");
        }
        if (!confirmed) {
            throw new DecisionNotAllowedException("phải xác nhận quyết định dựa trên bằng chứng mô phỏng");
        }

        Row scope = repo.lockReviewAccess(projectId, userId);
        if (scope == null) throw new NotFoundException("regression test");
        if (!"ACTIVE".equals(scope.str("project_status")) || !"ACTIVE".equals(scope.str("workspace_status"))) {
            throw new DecisionNotAllowedException("Project hoặc workspace đã lưu trữ, chỉ được xem lịch sử");
        }

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

        Map<Long, String> statusOf = repo.lockVersionStatuses(test.baselineVersionId(), test.candidateVersionId());
        if ((decision.equals("ACCEPT") || decision.equals("REJECT")) && !"CANDIDATE".equals(statusOf.get(test.candidateVersionId()))) {
            throw new DecisionNotAllowedException("candidate này đã được quyết định ở một regression test khác");
        }
        if ("ACCEPT".equals(decision) && !"BASELINE".equals(statusOf.get(test.baselineVersionId()))) {
            throw new DecisionNotAllowedException("baseline đã đổi kể từ khi chạy test — hãy chạy lại regression với baseline hiện hành");
        }

        if ("ACCEPT".equals(decision)) {
            repo.archiveVersion(test.baselineVersionId());
            repo.promoteToBaseline(test.candidateVersionId());
        } else if ("REJECT".equals(decision)) {
            repo.rejectVersion(test.candidateVersionId());
        }
        String cond = conditions == null ? "" : conditions.strip();
        repo.saveReview(rec.id(), RegressionCodes.statusOfDecision(decision), decision, userId, reason.strip(), cond.isEmpty() ? null : cond);
        AuditLog.event("regression.decide", "success", "user_id", userId, "test_id", testId, "decision", decision,
                "candidate_aeb_version_id", test.candidateVersionId(), "baseline_aeb_version_id", test.baselineVersionId());
    }
}
