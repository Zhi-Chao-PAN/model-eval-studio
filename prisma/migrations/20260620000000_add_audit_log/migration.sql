-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'REGISTER', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE', 'MODEL_ADD', 'MODEL_DELETE', 'MODEL_UPDATE', 'ARTIFACT_UPLOAD', 'ARTIFACT_DELETE', 'AI_CHAT', 'AI_IDEA_GENERATE', 'AI_SCREENSHOT_ANALYZE', 'AI_ARTIFACT_ANALYZE', 'AI_REPORT_GENERATE', 'USER_SETTINGS_UPDATE', 'AI_CONFIG_UPDATE', 'ADMIN_INVITE_CREATE', 'ADMIN_INVITE_TOGGLE', 'ADMIN_USER_VIEW', 'ADMIN_AUDIT_VIEW', 'EXPORT');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "detail" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "path" TEXT,
    "method" TEXT,
    "status" TEXT,
    "error" TEXT,
    "tokenInput" INTEGER,
    "tokenOutput" INTEGER,
    "durationMs" INTEGER,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
