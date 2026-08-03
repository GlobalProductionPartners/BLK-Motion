-- Adds the licence kind to an EXISTING database.
-- Safe to run once on a deployment created before demo licences existed:
--   wrangler d1 execute blk-motion-license --remote --file=migrate-add-kind.sql
-- Existing keys keep full output, which is the correct default for anything
-- already sold.
ALTER TABLE licenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'full';
