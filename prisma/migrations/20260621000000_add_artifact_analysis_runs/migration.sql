-- The legacy IDEA enum member and taskIdeaJson values remain for historical data,
-- but active tasks now continue at screenshot recognition.
UPDATE "Task"
SET "currentStep" = 'SCREENSHOT'::"TaskStep"
WHERE "currentStep" = 'IDEA'::"TaskStep";

CREATE TABLE "ArtifactAnalysisRun" (
    "id" TEXT NOT NULL,
    "taskModelId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "currentPhase" TEXT,
    "error" TEXT,
    "artifactSignature" TEXT,
    "artifactCount" INTEGER,
    "verificationScreenshotUrls" TEXT,
    "verificationSummary" TEXT,
    "filesAnalysis" TEXT,
    "nextEventSeq" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactAnalysisRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtifactAnalysisEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactAnalysisEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtifactAnalysisRun_workflowRunId_key" ON "ArtifactAnalysisRun"("workflowRunId");
CREATE INDEX "ArtifactAnalysisRun_taskModelId_createdAt_idx" ON "ArtifactAnalysisRun"("taskModelId", "createdAt");
CREATE INDEX "ArtifactAnalysisRun_status_updatedAt_idx" ON "ArtifactAnalysisRun"("status", "updatedAt");
CREATE INDEX "ArtifactAnalysisEvent_runId_sequence_idx" ON "ArtifactAnalysisEvent"("runId", "sequence");

ALTER TABLE "ArtifactAnalysisRun"
ADD CONSTRAINT "ArtifactAnalysisRun_taskModelId_fkey"
FOREIGN KEY ("taskModelId") REFERENCES "TaskModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArtifactAnalysisEvent"
ADD CONSTRAINT "ArtifactAnalysisEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "ArtifactAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
