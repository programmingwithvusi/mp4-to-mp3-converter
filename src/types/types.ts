export type JobStatus = 'queued' | 'converting' | 'done' | 'error'

export interface ConversionJob {
  id: string
  file: File
  status: JobStatus
  progress: number // 0..100
  error?: string
  invalid?: boolean // true for files that fail local validation (e.g. too large) — never retried, never counts toward quota
  outputBlob?: Blob
  outputName?: string
  outputSizeBytes?: number
}

export const BITRATE_OPTIONS = ['128k', '160k', '192k', '256k', '320k'] as const
export type Bitrate = (typeof BITRATE_OPTIONS)[number]

export const ACCEPTED_EXTENSIONS = ['.mp4', '.mpeg', '.mpg', '.flv', '.f4v', '.mov', '.mkv', '.avi', '.webm']

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500MB — keep in-memory decode/copy safe in the browser
