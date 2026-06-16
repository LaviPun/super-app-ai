-- Add optional `summary` to Recipe so a Recipe row can describe a multi-module
-- blueprint group (see docs/blueprints.md). Backward compatible: nullable column.
ALTER TABLE "Recipe" ADD COLUMN "summary" TEXT;
