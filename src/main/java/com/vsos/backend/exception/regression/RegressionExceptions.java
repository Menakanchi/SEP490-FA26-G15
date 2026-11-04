package com.vsos.backend.exception.regression;

import com.vsos.backend.common.Vs;

public final class RegressionExceptions {

    private RegressionExceptions() {
    }

    public static class InvalidScenarioSetException extends Vs.InvalidRequestException {
        public InvalidScenarioSetException(String message) {
            super(message);
        }
    }

    public static class InvalidCriteriaException extends Vs.InvalidRequestException {
        public InvalidCriteriaException(String message) {
            super(message);
        }
    }

    public static class InvalidCandidateException extends Vs.InvalidRequestException {
        public InvalidCandidateException(String message) {
            super(message);
        }
    }

    public static class TestNotFinishedException extends Vs.InvalidRequestException {
        public TestNotFinishedException(String message) {
            super(message);
        }
    }

    public static class DecisionNotAllowedException extends Vs.InvalidRequestException {
        public DecisionNotAllowedException(String message) {
            super(message);
        }
    }
}
