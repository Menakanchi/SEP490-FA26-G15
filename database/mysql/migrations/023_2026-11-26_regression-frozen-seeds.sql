-- Migration 023: preserve every baseline run/seed in a sealed FA validation partition.
-- Apply once to an existing database after backup, before using frozen-cohort verification.
-- Fresh databases created from the current 01_schema.sql do not need this migration.
-- Keeps all rows, pair foreign keys and the unique candidate run constraint unchanged.
-- A test may verify a variant at several seeds, with exactly one result per source run.
ALTER TABLE regression_test_items
  ADD UNIQUE KEY uq_rti_test_baseline (regression_test_id, baseline_run_id),
  DROP INDEX uq_rti_test_variant;
