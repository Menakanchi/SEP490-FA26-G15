-- Additive migration: preserve existing analysis rows and run evidence.
-- Apply once to an existing database before using POST /analysis/datasets.
ALTER TABLE analysis_results
  MODIFY COLUMN analysis_type
    ENUM('SENSITIVITY','INTERACTION','ROBUSTNESS_VALIDATION','ACTIVE_LEARNING_TRACKER','BASELINE_DATASET') NOT NULL;
