import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true, passwordHash: true },
  })
  console.log("Users in DB:", users.length)
  users.forEach((u) => {
    console.log(`  ${u.username}  role=${u.role}  hash_starts=${u.passwordHash.slice(0, 10)}...`)
  })
  
  const tableCounts = await Promise.all([
    prisma.user.count(),
    prisma.inviteCode.count(),
    prisma.task.count(),
    prisma.taskModel.count(),
    prisma.modelArtifact.count(),
    prisma.modelReport.count(),
    prisma.taskAttachment.count(),
    prisma.taskMessage.count(),
  ])
  console.log("\nTable counts:")
  console.log(`  User=${tableCounts[0]}, InviteCode=${tableCounts[1]}, Task=${tableCounts[2]}, TaskModel=${tableCounts[3]}`)
  console.log(`  ModelArtifact=${tableCounts[4]}, ModelReport=${tableCounts[5]}, TaskAttachment=${tableCounts[6]}, TaskMessage=${tableCounts[7]}`)
}

main().finally(() => prisma.$disconnect())