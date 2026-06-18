import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'admin123'

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log(`??? ${username} ???`)
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  const admin = await prisma.user.create({
    data: {
      username,
      passwordHash: hashed,
      role: 'ADMIN',
      background: '????????',
    },
  })

  console.log(`????????${username} / ${password}`)
  console.log(`???????????`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })