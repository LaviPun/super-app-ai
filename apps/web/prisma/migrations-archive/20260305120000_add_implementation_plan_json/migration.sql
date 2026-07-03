-- Add implementationPlanJson for AI hydrate output; compiledRuntimePlanJson reserved for compiler output.
ALTER TABLE "ModuleVersion" ADD COLUMN "implementationPlanJson" TEXT;
