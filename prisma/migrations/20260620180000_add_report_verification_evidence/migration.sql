-- The production database already has these fields from the original rollout.
-- IF NOT EXISTS keeps that database deployable while making fresh environments reproducible.
ALTER TABLE "TaskModel" ADD COLUMN IF NOT EXISTS "verificationScreenshotUrls" TEXT;

ALTER TABLE "ModelReport" ADD COLUMN IF NOT EXISTS "verificationScreenshotUrls" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN IF NOT EXISTS "verificationSummary" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN IF NOT EXISTS "trajectoryAnalysis" TEXT;
