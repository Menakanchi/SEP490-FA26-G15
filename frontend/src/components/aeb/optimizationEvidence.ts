import type { OptimizationTrial } from "@/types/vehicsim";

/** A stored COMPLETED label alone does not establish measured objective evidence. */
export function hasCompleteTrialEvidence(trial: OptimizationTrial): boolean {
  return trial.status === "COMPLETED" && typeof trial.constraint_violated === "boolean"
    && [trial.rms_jerk_mps3, trial.impact_speed_mps, trial.stopping_distance_m]
      .every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function isFeasibleTrial(trial: OptimizationTrial): boolean {
  return hasCompleteTrialEvidence(trial) && trial.constraint_violated === false;
}
