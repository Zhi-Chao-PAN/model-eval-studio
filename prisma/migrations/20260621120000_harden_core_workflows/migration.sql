-- Preserve historical duplicates without dropping their reports or artifacts.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "taskId", "modelCode"
    ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "TaskModel"
)
UPDATE "TaskModel" AS model
SET "modelCode" = model."modelCode" || '_DUP_' || ranked.duplicate_number
FROM ranked
WHERE model."id" = ranked."id" AND ranked.duplicate_number > 1;

-- Existing API writes normalize new codes to upper-case. The database constraint
-- closes the remaining concurrent-create race.
CREATE UNIQUE INDEX "TaskModel_taskId_modelCode_key"
ON "TaskModel"("taskId", "modelCode");

ALTER TABLE "ArtifactAnalysisRun"
ADD COLUMN "verificationEvidenceSignature" TEXT;

CREATE UNIQUE INDEX "ArtifactAnalysisEvent_runId_sequence_key"
ON "ArtifactAnalysisEvent"("runId", "sequence");

CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx"
ON "RateLimitBucket"("expiresAt");
