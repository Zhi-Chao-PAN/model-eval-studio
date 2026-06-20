import { thinkingAiContent, visibleAiContent } from '@/lib/ai-content'

export interface ParsedDesignOutput {
  prompt: string
  background: string
  thinking: string
}

const TASK_MARKER = '<<<TASK_PROMPT>>>'
const BACKGROUND_MARKER = '<<<BACKGROUND>>>'

function cleanSection(text: string): string {
  return text
    .replace(/^\s*(?:-{3,}|={3,})\s*$/gm, '')
    .replace(/^\s+|\s+$/g, '')
}

function headingIndex(lines: string[], kind: 'prompt' | 'background', start = 0): number {
  const pattern = kind === 'prompt'
    ? /^(?:#{1,6}\s*)?(?:[-—–=*【\[]*\s*)?(?:(?:第[一1]部分)\s*[：:]?\s*)?(?:任务\s*prompt|任务提示词)(?:\s*[（(].*?[）)])?(?:\s*[-—–=*】\]]*)?\s*[：:]?\s*$/i
    : /^(?:#{1,6}\s*)?(?:[-—–=*【\[]*\s*)?(?:(?:第[二2]部分)\s*[：:]?\s*)?(?:题目来源(?:\s*\/\s*背景说明)?|背景说明)(?:\s*[-—–=*】\]]*)?\s*[：:]?\s*$/i

  for (let index = start; index < lines.length; index += 1) {
    if (pattern.test(lines[index].trim())) return index
  }
  return -1
}

/** Parse both the current marker format and older heading-based model output. */
export function parseDesignOutput(rawText: string): ParsedDesignOutput {
  const thinking = thinkingAiContent(rawText)
  const text = visibleAiContent(rawText).replace(/\r\n?/g, '\n').trim()

  const taskMarkerIndex = text.indexOf(TASK_MARKER)
  const backgroundMarkerIndex = text.indexOf(BACKGROUND_MARKER)
  if (taskMarkerIndex !== -1 && backgroundMarkerIndex > taskMarkerIndex) {
    return {
      prompt: cleanSection(text.slice(taskMarkerIndex + TASK_MARKER.length, backgroundMarkerIndex)),
      background: cleanSection(text.slice(backgroundMarkerIndex + BACKGROUND_MARKER.length)),
      thinking,
    }
  }

  const lines = text.split('\n')
  const promptHeading = headingIndex(lines, 'prompt')
  const backgroundHeading = headingIndex(lines, 'background', Math.max(promptHeading + 1, 0))

  if (promptHeading !== -1 && backgroundHeading > promptHeading) {
    return {
      prompt: cleanSection(lines.slice(promptHeading + 1, backgroundHeading).join('\n')),
      background: cleanSection(lines.slice(backgroundHeading + 1).join('\n')),
      thinking,
    }
  }

  if (backgroundHeading !== -1) {
    return {
      prompt: cleanSection(lines.slice(0, backgroundHeading).join('\n')),
      background: cleanSection(lines.slice(backgroundHeading + 1).join('\n')),
      thinking,
    }
  }

  return { prompt: cleanSection(text), background: '', thinking }
}

export const DESIGN_OUTPUT_MARKERS = { task: TASK_MARKER, background: BACKGROUND_MARKER } as const
