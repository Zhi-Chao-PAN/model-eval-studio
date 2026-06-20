import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export const DEFAULT_MAX_TOKENS = 4000

export async function getUserAiConfig(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiProvider: true,
      aiBaseUrl: true,
      aiApiKey: true,
      aiModelName: true,
      aiMaxTokens: true,
      background: true,
    },
  })

  if (!user || !user.aiBaseUrl || !user.aiApiKey || !user.aiModelName) {
    return null
  }

  return {
    provider: user.aiProvider,
    baseUrl: user.aiBaseUrl,
    apiKey: decrypt(user.aiApiKey),
    model: user.aiModelName,
    maxTokens: user.aiMaxTokens ?? DEFAULT_MAX_TOKENS,
    background: user.background || '',
  }
}
