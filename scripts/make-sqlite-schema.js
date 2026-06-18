const fs = require('fs');
const path = require('path');
const BASE = 'E:/projects/model-test-assistant';

const schema = `
// Prisma schema for model-test-assistant
// SQLite 版本（本地开发用）

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  passwordHash  String
  role          String   @default("USER")
  background    String?
  aiProvider    String   @default("OPENAI_COMPAT")
  aiBaseUrl     String?
  aiApiKey      String?
  aiModelName   String?
  createdAt     DateTime @default(now())
  lastActiveAt  DateTime @default(now())
  tasks         Task[]
  inviteCodes   InviteCode[] @relation("CreatedInvites")
}

model InviteCode {
  id           String   @id @default(cuid())
  code         String   @unique
  expiresAt    DateTime?
  maxUses      Int      @default(1)
  usedCount    Int      @default(0)
  active       Boolean  @default(true)
  createdById  String
  createdBy    User     @relation("CreatedInvites", fields: [createdById], references: [id])
  createdAt    DateTime @default(now())
}

model Task {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title           String
  category        String?
  requirementType String?
  requirementName String?
  description     String?
  backgroundUsed  String?
  status          String   @default("DRAFT")
  currentStep     String   @default("INFO")
  deletedAt       DateTime?
  deletedBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  attachments     TaskAttachment[]
  models          TaskModel[]
  messages        TaskMessage[]
  taskIdeaJson    String?
  analysisJson    String?
}

model TaskAttachment {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  name      String
  url       String
  size      Int?
  mimeType  String?
  parsedText  String?
  createdAt DateTime @default(now())
}

model TaskModel {
  id             String   @id @default(cuid())
  taskId         String
  task           Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  modelCode      String
  displayName    String?
  hardMetricsJson  String?
  processText    String?
  screenshotUrls String?
  createdAt      DateTime @default(now())
  artifacts      ModelArtifact[]
  reports        ModelReport[]
}

model ModelArtifact {
  id        String   @id @default(cuid())
  taskModelId String
  taskModel TaskModel @relation(fields: [taskModelId], references: [id], onDelete: Cascade)
  name      String
  url       String
  textContent String?
  mimeType  String?
  size      Int?
  parsedText String?
  createdAt DateTime @default(now())
}

model ModelReport {
  id                String   @id @default(cuid())
  taskModelId       String
  taskModel         TaskModel @relation(fields: [taskModelId], references: [id], onDelete: Cascade)
  productFeedback   String
  overallScore      Float
  overallComment    String
  efficiencyScore   Float
  efficiencyComment String
  qualityScore      Float
  qualityComment    String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model TaskMessage {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  role      String
  content   String
  step      String
  modelId   String?
  createdAt DateTime @default(now())
}
`.trim();

fs.writeFileSync(path.join(BASE, 'prisma/schema.prisma'), schema, 'utf-8');
console.log('sqlite schema written');
