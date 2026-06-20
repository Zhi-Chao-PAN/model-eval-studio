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
} from '@/lib/artifact-analysis-runtime'

export async function artifactAnalysisWorkflow(input: ArtifactAnalysisRunInput): Promise<{ runId: string }> {
  'use workflow'

  console.log(`[artifact-analysis] workflow start run=${input.runId}`)
  try {
    await beginArtifactAnalysis(input)
    await inspectArtifacts(input)
    await captureEvidence(input)
    await reviewEvidence(input)
    const fileAnalysis = await reviewFiles(input)
    const mergedAnalysis = await synthesizeFiles(input, fileAnalysis)
    await persistAnalysis(input, mergedAnalysis)
    console.log(`[artifact-analysis] workflow complete run=${input.runId}`)
    return { runId: input.runId }
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

async function inspectArtifacts(input: ArtifactAnalysisRunInput): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] inspect run=${input.runId}`)
  await inspectArtifactInputs(input)
}

async function captureEvidence(input: ArtifactAnalysisRunInput): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] acceptance evidence run=${input.runId}`)
  await captureArtifactEvidence(input)
}

async function reviewEvidence(input: ArtifactAnalysisRunInput): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] acceptance screenshot review run=${input.runId}`)
  await analyzeArtifactEvidence(input)
}

async function reviewFiles(input: ArtifactAnalysisRunInput): Promise<string> {
  'use step'
  console.log(`[artifact-analysis] file review run=${input.runId}`)
  return analyzeArtifactFiles(input)
}

async function synthesizeFiles(input: ArtifactAnalysisRunInput, filesAnalysis: string): Promise<string> {
  'use step'
  console.log(`[artifact-analysis] synthesize run=${input.runId}`)
  return summarizeArtifactFiles(input, filesAnalysis)
}

async function persistAnalysis(input: ArtifactAnalysisRunInput, filesAnalysis: string): Promise<void> {
  'use step'
  console.log(`[artifact-analysis] finalize run=${input.runId}`)
  await finalizeArtifactAnalysis(input, filesAnalysis)
}

async function markAnalysisFailed(input: ArtifactAnalysisRunInput, message: string): Promise<void> {
  'use step'
  await failArtifactAnalysisRun(input, message)
}
