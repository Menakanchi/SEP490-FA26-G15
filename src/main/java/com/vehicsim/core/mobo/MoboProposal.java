package com.vehicsim.core.mobo;

import java.util.List;
import java.util.Map;

/** Đề xuất tiếp theo của MOBO; {@code acquisitionValue} null ở giai đoạn thiết kế ban đầu. */
public record MoboProposal(Map<String, Double> params, String samplingSource, Double acquisitionValue, List<Integer> paretoTrialNumbers) {
}
