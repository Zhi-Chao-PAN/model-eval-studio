-- Add composite indexes for common query patterns

-- Task: task list by user ordered by updatedAt
CREATE INDEX "Task_userId_updatedAt_idx" ON "Task"("userId", "updatedAt" DESC);

-- TaskMessage: chat timeline by task ordered by createdAt
CREATE INDEX "TaskMessage_taskId_createdAt_idx" ON "TaskMessage"("taskId", "createdAt" DESC);

-- ModelReport: latest report per model (take 1 order by desc)
CREATE INDEX "ModelReport_taskModelId_createdAt_idx" ON "ModelReport"("taskModelId", "createdAt" DESC);

-- ModelArtifact: artifact list per model ordered by createdAt
CREATE INDEX "ModelArtifact_taskModelId_createdAt_idx" ON "ModelArtifact"("taskModelId", "createdAt" ASC);

-- Remove redundant index (covered by @@unique)
DROP INDEX IF EXISTS "ArtifactAnalysisEvent_runId_sequence_idx";
