package com.vsos.backend.dto.regression;

import com.vsos.backend.dto.regression.RegressionRequests.DecisionRequest;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DecisionRequestValidationTest {

    @Test
    void reasonLengthIsLimitedTo4000Characters() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new DecisionRequest("REJECT", "a".repeat(4000), null, true))).isEmpty();
            assertThat(validator.validate(new DecisionRequest("REJECT", "a".repeat(4001), null, true)))
                    .extracting(violation -> violation.getPropertyPath().toString())
                    .containsExactly("reason");
        }
    }

    @Test
    void conditionsLengthIsLimitedTo4000Characters() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new DecisionRequest("REJECT", "reason", "a".repeat(4000), true))).isEmpty();
            assertThat(validator.validate(new DecisionRequest("REJECT", "reason", "a".repeat(4001), true)))
                    .extracting(violation -> violation.getPropertyPath().toString())
                    .containsExactly("conditions");
        }
    }
}
