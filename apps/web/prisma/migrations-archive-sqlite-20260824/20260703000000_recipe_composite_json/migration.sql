-- R3.1 composites-as-manifests: additive nullable column for the shared-record manifest.
ALTER TABLE "Recipe" ADD COLUMN "compositeJson" TEXT;
