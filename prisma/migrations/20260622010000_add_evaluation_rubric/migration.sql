-- CreateEvaluationRubric: 评测评分规则表，与 Task 一对一关联

CREATE TABLE "EvaluationRubric" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "dimensionsJson" TEXT NOT NULL,
    "overallFormula" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationRubric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationRubric_taskId_key" ON "EvaluationRubric"("taskId");

CREATE INDEX "EvaluationRubric_taskId_idx" ON "EvaluationRubric"("taskId");

ALTER TABLE "EvaluationRubric" ADD CONSTRAINT "EvaluationRubric_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
