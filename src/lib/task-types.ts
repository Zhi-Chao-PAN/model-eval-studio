import type {
  ArtifactAnalysisEvent, ArtifactAnalysisRun, EvaluationRubric, ModelArtifact,
  ModelReport, Task, TaskAttachment, TaskMessage, TaskModel,
} from '@prisma/client'

/** JSON transport converts Prisma dates to ISO strings. */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K]
}

export type ArtifactView = Pick<Serialized<ModelArtifact>, 'id' | 'name' | 'size' | 'createdAt'>
  & Partial<Omit<Serialized<ModelArtifact>, 'id' | 'name' | 'size' | 'createdAt'>>

export type ReportView = Pick<Serialized<ModelReport>,
  'id' | 'version' | 'source' | 'productFeedback' | 'overallScore' | 'overallComment'
  | 'efficiencyScore' | 'efficiencyComment' | 'qualityScore' | 'qualityComment'
  | 'trajectoryAnalysis' | 'createdAt'>
  & Partial<Serialized<ModelReport>>

export type AnalysisRunView = Serialized<ArtifactAnalysisRun> & {
  events: Serialized<ArtifactAnalysisEvent>[]
}

export type ModelView = Omit<Serialized<TaskModel>, 'screenshotUrls' | 'verificationScreenshotUrls'> & {
  screenshotUrls?: string | null
  verificationScreenshotUrls?: string | null
  artifacts: ArtifactView[]
  reports: ReportView[]
  artifactAnalysisRuns?: AnalysisRunView[]
}

export type TaskView = Serialized<Task> & {
  user?: { username: string }
  attachments: Serialized<TaskAttachment>[]
  models: ModelView[]
  messages: Serialized<TaskMessage>[]
  rubric?: Serialized<EvaluationRubric> | null
}

/** Only fields consumed by AI prompts, independent of database relations. */
export type PromptModel = Pick<TaskModel, "modelCode" | "hardMetricsJson" | "processText"> & { artifacts: Pick<ModelArtifact, "name" | "parsedText" | "textContent">[] }
export type PromptTask = Pick<Task, 'title' | 'description' | 'backgroundUsed'>
export type ReportTask = Task & { rubric?: EvaluationRubric | null }
export type ReportModel = TaskModel & { artifacts: ModelArtifact[] }
