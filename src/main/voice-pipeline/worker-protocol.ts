export const VOICE_WORKER_PROTOCOL_VERSION = 1

export interface WorkerRecognitionRequest {
  version: typeof VOICE_WORKER_PROTOCOL_VERSION
  type: 'recognize'
  requestId: string
  payload: {
    recognizerId: string
    // 已解码 PCM（兼容模式）
    samples?: Float32Array
    sampleRate?: number
    // silk 原始数据：由 worker 内部解码，避免主进程同步解码阻塞事件循环
    encoded?: { data: Uint8Array; sampleRate: number; sourceHash: string }
    // worker 内加载 silk-wasm 的包路径（主进程解析后传入）
    silkWasmPath?: string
    modelPath: string
    tokensPath: string
    modelFingerprint: string
  }
}

export type WorkerRecognitionResponse =
  | {
      version: typeof VOICE_WORKER_PROTOCOL_VERSION
      type: 'result'
      requestId: string
      transcript: string
      language?: string
      durationMs?: number
      sourceHash?: string
    }
  | {
      version: typeof VOICE_WORKER_PROTOCOL_VERSION
      type: 'error'
      requestId: string
      error: string
    }
