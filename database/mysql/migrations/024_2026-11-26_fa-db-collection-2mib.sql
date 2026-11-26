-- Expand only the storage ceiling; the application retains the 1 MiB upload and
-- per-run limits, allowing at most 2 MiB for collections assembled from DB artifacts.
-- Back up before applying. Rollback to 1 MiB requires first exporting/removing
-- every source over 1 MiB; otherwise the old CHECK cannot be restored.
ALTER TABLE fa_json_sources
  DROP CHECK ck_fa_source_bytes,
  ADD CONSTRAINT ck_fa_source_bytes CHECK (OCTET_LENGTH(payload_bytes) <= 2097152 AND OCTET_LENGTH(metadata_bytes) <= 262144);
