-- AddReportVersioning: 报告版本控制、人工修订、生成依据快照

ALTER TABLE "ModelReport" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ModelReport" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'AI_GENERATED';
ALTER TABLE "ModelReport" ADD COLUMN "parentReportId" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN "editedById" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN "editNote" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN "generationSnapshot" TEXT;
ALTER TABLE "ModelReport" ADD COLUMN "generationConfig" TEXT;

CREATE INDEX "ModelReport_taskModelId_version_idx" ON "ModelReport"("taskModelId", "version");
