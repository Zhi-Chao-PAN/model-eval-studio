import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  // 1. 创建管理员
  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  })

  if (existingAdmin) {
    console.log(`管理员 ${adminUsername} 已存在，跳过创建`)
  } else {
    const hashed = await bcrypt.hash(adminPassword, 10)
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash: hashed,
        role: UserRole.ADMIN,
        background: '我是系统管理员，负责大模型评测工作。',
      },
    })
    console.log(`\u2713 管理员创建成功：${adminUsername} / ${adminPassword}`)
  }

  // 2. 生成一些邀请码
  const inviteCount = await prisma.inviteCode.count()
  if (inviteCount === 0) {
    const invites = []
    for (let i = 0; i < 3; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase()
      const invite = await prisma.inviteCode.create({
        data: {
          code,
          maxUses: 10,
          createdBy: { connect: { username: adminUsername } },
        },
      })
      invites.push(invite)
    }
    console.log('\u2713 生成邀请码：')
    invites.forEach((inv) => console.log(`  - ${inv.code}（最多 ${inv.maxUses} 人使用）`))
  }

  console.log('\n\u2713 初始化完成！')
}

main()
  .catch((e) => {
    console.error('初始化失败：', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
