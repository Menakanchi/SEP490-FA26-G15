package com.vsos.backend.dto.regression;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/** Body của các route regression / quyết định Reviewer (màn 5); JSON snake_case giữ nguyên hợp đồng với {@code frontend/src/services/vehicsim.ts}. */
public final class RegressionRequests {

    private RegressionRequests() {
    }

    /** {@code POST /regression}: candidate vs baseline trên một họ kịch bản. */
    public record CreateRegressionRequest(
            @JsonProperty("candidate_version_id") @NotNull Long candidateVersionId,
            @JsonProperty("scenario_id") @NotNull Long scenarioId,
            @JsonProperty("include_old_critical") Boolean includeOldCritical,
            @JsonProperty("include_all_variants") Boolean includeAllVariants,
            Map<String, Map<String, Object>> criteria,
            @Size(max = 150) String name,
            // Tập biến thể chọn tay (tùy chọn); không gửi thì giữ cách chọn theo hai cờ ở trên.
            @JsonProperty("variant_ids") @Size(max = 300) List<Long> variantIds) {
    }

    /** {@code POST /recommendations/{id}/decision}: Reviewer Accept / Reject / yêu cầu thêm test. */
    public record DecisionRequest(
            @NotBlank String decision,
            @NotBlank @Size(max = 4000) String reason,
            @Size(max = 4000) String conditions,
            @NotNull Boolean confirmed) {
    }
}
