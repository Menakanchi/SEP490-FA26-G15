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
        if ("FAILED".equals(exec) || "CANCELLED".equals(exec)) {
            return "ERROR";
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

    public static String recommendationStatusLabel(String recommendationStatus, String decision) {
        return "BLOCKED".equals(recommendationStatus) ? "Blocked" : REVIEW_LABELS.get(decision);
    }
}
