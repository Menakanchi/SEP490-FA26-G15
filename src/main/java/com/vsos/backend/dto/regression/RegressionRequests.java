package com.vsos.backend.dto.regression;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public final class RegressionRequests {

    private RegressionRequests() {
    }

    public record CreateRegressionRequest(
            @JsonProperty("candidate_version_id") @NotNull Long candidateVersionId,
            @JsonProperty("scenario_id") @NotNull Long scenarioId,
            @JsonProperty("include_old_critical") Boolean includeOldCritical,
            @JsonProperty("include_all_variants") Boolean includeAllVariants,
            Map<String, Map<String, Object>> criteria,
            @Size(max = 150) String name,
            @JsonProperty("variant_ids") @Size(max = 300) List<Long> variantIds) {
    }

    public record DecisionRequest(
            @NotBlank String decision,
            @NotBlank @Size(max = 4000) String reason,
            @Size(max = 4000) String conditions,
            @NotNull Boolean confirmed) {
    }
}
