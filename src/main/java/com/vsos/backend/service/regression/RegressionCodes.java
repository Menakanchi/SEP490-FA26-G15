package com.vsos.backend.service.regression;

import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;

import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class RegressionCodes {

    public static final List<String> DECISIONS = List.of("ACCEPT", "REJECT", "REQUEST_MORE_TESTS");

    private static final Map<String, String> DECISION_OF = Map.of(
            "PENDING_REVIEW", "PENDING", "ACCEPTED", "ACCEPT", "REJECTED", "REJECT", "MORE_TESTS_REQUESTED", "REQUEST_MORE_TESTS");
    private static final Map<String, String> STATUS_OF_DECISION = Map.of(
            "PENDING", "PENDING_REVIEW", "ACCEPT", "ACCEPTED", "REJECT", "REJECTED", "REQUEST_MORE_TESTS", "MORE_TESTS_REQUESTED");
    private static final Map<String, String> REVIEW_LABELS = Map.of(
            "PENDING", "Awaiting review", "ACCEPT", "Accepted", "REJECT", "Rejected", "REQUEST_MORE_TESTS", "More tests requested");

    private RegressionCodes() {
    }

    public static String testCode(long testId) {
        return String.format(Locale.ROOT, "RT-%03d", testId);
    }

    public static String recommendationCode(long testId) {
        return String.format(Locale.ROOT, "REC-%03d", testId);
    }

    public static String displayStatus(RegressionTestRow test) {
        String exec = test.executionStatus();
        if ("COMPLETED".equals(exec)) {
            return "PASSED".equals(test.verdict()) ? "PASSED" : "FAILED";
        }
        if ("FAILED".equals(exec)) {
            return "ERROR";
        }
        // Người dùng hủy (TD-37): không phải lỗi chạy, hiện riêng là "Đã hủy".
        if ("CANCELLED".equals(exec)) {
            return "CANCELLED";
        }
        return exec;
    }

    public static String displayDecision(RecommendationRow recommendation) {
        return recommendation == null ? "PENDING" : decisionOf(recommendation.status());
    }

    public static String decisionOf(String recommendationStatus) {
        return DECISION_OF.get(recommendationStatus);
    }

    public static String statusOfDecision(String decision) {
        return STATUS_OF_DECISION.get(decision);
    }

    public static String recommendationStatus(RegressionTestRow test, RecommendationRow recommendation) {
        String decision = displayDecision(recommendation);
        if (!"PENDING".equals(decision)) {
            return decision;
        }
        return "FAILED".equals(displayStatus(test)) ? "BLOCKED" : decision;
    }

    /**
     * Như {@link #recommendationStatus(RegressionTestRow, RecommendationRow)}, thêm trạng thái của phiên bản AEB lúc xem: khuyến nghị còn chờ
     * nhưng candidate đã được quyết định ở regression khác là {@code SUPERSEDED} (không duyệt được nữa); baseline của test đã đổi mà candidate
     * còn chờ là {@code BASELINE_CHANGED} (không Accept được, vẫn Reject / yêu cầu thêm kiểm thử được). Cùng điều kiện với
     * {@code ReviewDecisionService}, để giao diện không còn đếm các khuyến nghị này là "chờ duyệt".
     */
    public static String recommendationStatus(RegressionTestRow test, RecommendationRow recommendation, String baselineVersionStatus,
                                              String candidateVersionStatus) {
        String status = recommendationStatus(test, recommendation);
        if (!"PENDING".equals(status) && !"BLOCKED".equals(status)) {
            return status;
        }
        if (candidateVersionStatus != null && !"CANDIDATE".equals(candidateVersionStatus)) {
            return "SUPERSEDED";
        }
        if (baselineVersionStatus != null && !"BASELINE".equals(baselineVersionStatus)) {
            return "BASELINE_CHANGED";
        }
        return status;
    }

    public static String recommendationStatusLabel(String recommendationStatus, String decision) {
        return switch (recommendationStatus) {
            case "BLOCKED" -> "Blocked";
            case "SUPERSEDED" -> "Superseded";
            case "BASELINE_CHANGED" -> "Baseline changed";
            default -> REVIEW_LABELS.get(decision);
        };
    }
}
