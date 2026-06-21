-- 完善引用完整性、级联策略、索引与唯一约束
-- 本迁移为已实装功能（报告版本链、协作共享）加固数据完整性。

-- 1) ModelReport.parentReportId: 自引用外键（修订链），删除父版本时置 NULL
ALTER TABLE "ModelReport"
  ADD CONSTRAINT "ModelReport_parentReportId_fkey"
  FOREIGN KEY ("parentReportId") REFERENCES "ModelReport"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) ModelReport.editedById: 关联修订者 User，用户删除时置 NULL
ALTER TABLE "ModelReport"
  ADD CONSTRAINT "ModelReport_editedById_fkey"
  FOREIGN KEY ("editedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) ModelReport (taskModelId, version) 改为唯一约束，防止并发写入版本号冲突
--    先删除之前的普通索引，再建唯一索引
DROP INDEX IF EXISTS "ModelReport_taskModelId_version_idx";
CREATE UNIQUE INDEX "ModelReport_taskModelId_version_key" ON "ModelReport"("taskModelId", "version");

-- 4) ModelReport.parentReportId 单独索引（修订链反向查询）
CREATE INDEX IF NOT EXISTS "ModelReport_parentReportId_idx" ON "ModelReport"("parentReportId");

-- 5) TaskMessage.modelId 索引（按模型筛选对话）
CREATE INDEX IF NOT EXISTS "TaskMessage_modelId_idx" ON "TaskMessage"("modelId");

-- 6) AuditLog.taskId 索引（按任务过滤审计）
CREATE INDEX IF NOT EXISTS "AuditLog_taskId_idx" ON "AuditLog"("taskId");

-- 7) EvaluationRubric.taskId 已有 @unique 索引，删除冗余的单列普通索引（若存在）
DROP INDEX IF EXISTS "EvaluationRubric_taskId_idx";

-- 8) TaskShare.createdById: 将 onDelete 从默认 RESTRICT 改为 CASCADE
--    （删除用户时一并吊销其创建的共享链接，避免管理员删用户时被 FK 阻塞）
ALTER TABLE "TaskShare" DROP CONSTRAINT IF EXISTS "TaskShare_createdById_fkey";
ALTER TABLE "TaskShare"
  ADD CONSTRAINT "TaskShare_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
