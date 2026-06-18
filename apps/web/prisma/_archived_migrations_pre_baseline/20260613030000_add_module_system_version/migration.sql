-- Module System v2 engine flag. Defaults to 'v1' so existing behavior is unchanged.
ALTER TABLE "AppSettings"
ADD COLUMN "moduleSystemVersion" TEXT NOT NULL DEFAULT 'v1';
