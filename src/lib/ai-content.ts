export type AiContentSegment = {
  kind: 'think' | 'text'
  content: string
  open?: boolean
}
const THINK_START = '<think>'
const THINK_END = '</think>'

function trailingTagPrefixLength(text: string, tag: string): number {
  const lower = text.toLowerCase()
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
    if (lower.endsWith(tag.slice(0, length))) return length
  }
  return 0
}

/**
 * Split model output into visible content and reasoning blocks.
 * It also withholds a partial tag at the end of a streaming chunk so
 * fragments such as `<thi` never flash in the visible answer.
 */
export function splitAiContent(text: string): AiContentSegment[] {
  if (!text) return []

  const segments: AiContentSegment[] = []
  const lower = text.toLowerCase()
  let cursor = 0
  let inThink = false

  while (cursor < text.length) {
    const tag = inThink ? THINK_END : THINK_START
    const tagIndex = lower.indexOf(tag, cursor)

    if (tagIndex === -1) {
      const tail = text.slice(cursor)
      const partialLength = trailingTagPrefixLength(tail, tag)
      const content = partialLength > 0 ? tail.slice(0, -partialLength) : tail
      if (content) {
        segments.push({
          kind: inThink ? 'think' : 'text',
          content,
          open: inThink || partialLength > 0 ? true : undefined,
        })
      } else if (inThink || partialLength > 0) {
        segments.push({ kind: inThink ? 'think' : 'text', content: '', open: true })
      }
      break
    }

    const content = text.slice(cursor, tagIndex)
    if (content) {
      segments.push({ kind: inThink ? 'think' : 'text', content, open: inThink || undefined })
    }
    inThink = !inThink
    cursor = tagIndex + tag.length
  }

  return segments
}

export function visibleAiContent(text: string): string {
  return splitAiContent(text)
    .filter(segment => segment.kind === 'text')
    .map(segment => segment.content)
    .join('')
}

export function thinkingAiContent(text: string): string {
  return splitAiContent(text)
    .filter(segment => segment.kind === 'think')
    .map(segment => segment.content)
    .join('\n\n')
    .trim()
}
