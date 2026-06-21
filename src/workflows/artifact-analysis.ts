import {
  analyzeArtifactEvidence,
  analyzeArtifactFiles,
  captureArtifactEvidence,
  failArtifactAnalysisRun,
  finalizeArtifactAnalysis,
  inspectArtifactInputs,
  markArtifactAnalysisRunStarted,
  summarizeArtifactFiles,
  type ArtifactAnalysisRunInput,
  type FinalizeArtifactAnalysisResult,
} from '@/lib/artifact-analysis-runtime'

const MAX_ANALYSIS_PASSES = 3

export async function artifactAnalysisWorkflow(input: ArtifactAnalysisRunInput): Promise<{ runId: string }> {
  'use workflow'

  console.log(`[artifact-analysis] workflow start run=${input.runId}`)
  try {
    await beginArtifactAnalysis(input)
    for (let attempt = 1; attempt <= MAX_ANALYSIS_PASSES; attempt += 1) {
      console.log(`[artifact-analysis] pass ${attempt}/${MAX_ANALYSIS_PASSES} run=${input.runId}`)
      await inspectArtifacts(input, attempt)
      await captureEvidence(input, attempt)
      await reviewEvidence(input, attempt)
      const fileAnalysis = await reviewFiles(input, attempt)
      const mergedAnalysis = await synthesizeFiles(input, fileAnalysis, attempt)
      const result = await persistAnalysis(input, mergedAnalysis, attempt)
      if (!result.rerun) {
        console.log(`[artifact-analysis] workflow complete run=${input.runId}`)
        return { runId: input.runId }
      }
    }
    throw new Error('产物或截图在分析期间多次变更，请稍后重新提交分析')
  } catch (error) {
    console.error(`[artifact-analysis] workflow failed run=${input.runId}`, error)
    await markAnalysisFailed(input, error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function beginArtifactAnalysis(input: ArtifactAnalysisRunInput): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] begin run=${input.runId}`)
  await markArtifactAnalysisRunStarted(input)
}

async function inspectArtifacts(input: ArtifactAnalysisRunInput, attempt: number): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] inspect run=${input.runId} pass=${attempt}`)
  await inspectArtifactInputs(input)
}

async function captureEvidence(input: ArtifactAnalysisRunInput, attempt: number): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] acceptance evidence run=${input.runId} pass=${attempt}`)
  await captureArtifactEvidence(input)
}

async function reviewEvidence(input: ArtifactAnalysisRunInput, attempt: number): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] acceptance screenshot review run=${input.runId} pass=${attempt}`)
  await analyzeArtifactEvidence(input)
}

async function reviewFiles(input: ArtifactAnalysisRunInput, attempt: number): Promise<string> {
  'use step'
  console.log(`[artifact-analysis] file review run=${input.runId} pass=${attempt}`)
  return analyzeArtifactFiles(input)
}

async function synthesizeFiles(input: ArtifactAnalysisRunInput, filesAnalysis: string, attempt: number): Promise<string> {
  'use step'
  console.log(`[artifact-analysis] synthesize run=${input.runId} pass=${attempt}`)
  return summarizeArtifactFiles(input, filesAnalysis)
}

async function persistAnalysis(
  input: ArtifactAnalysisRunInput,
  filesAnalysis: string,
  attempt: number,
): Promise<FinalizeArtifactAnalysisResult> {
  'use step'
  console.log(`[artifact-analysis] finalize run=${input.runId} pass=${attempt}`)
  return finalizeArtifactAnalysis(input, filesAnalysis)
}

async function markAnalysisFailed(input: ArtifactAnalysisRunInput, message: string): Promise<void> {
  'use step'
  await failArtifactAnalysisRun(input, message)
}
