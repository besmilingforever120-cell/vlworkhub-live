# VLWorkHub data migration staging package

This directory contains the staging-only old-to-new PostgreSQL merge workflow.

The `.sql` files are guarded entrypoints. The implementation logic lives in `migrate_staging.py` so the workflow stays reviewable and rerunnable.

Rules:
- Never run any write-capable step against the live `vlworkhub` database.
- Every write-capable step aborts unless `current_database()` is exactly `vlworkhub_merge_staging`.
- Never use old schema DDL to replace the new live schema.
- Never disable constraints globally.
- Use only the disposable staging database `vlworkhub_merge_staging` for merge testing.
- Do not point the production API or production services at staging.
