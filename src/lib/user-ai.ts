import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { assertSafeAiBaseUrl, parseAiMaxTokens } from '@/lib/ai-endpoint'

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

  const baseUrl = await assertSafeAiBaseUrl(user.aiBaseUrl)

  return {
    provider: user.aiProvider,
    baseUrl,
    apiKey: decrypt(user.aiApiKey),
    model: user.aiModelName,
    maxTokens: parseAiMaxTokens(user.aiMaxTokens, DEFAULT_MAX_TOKENS),
    background: user.background || '',
  }
}
