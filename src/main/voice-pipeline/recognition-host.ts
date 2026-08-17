import { fork, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type {
  EncodedRecognitionInput,
  PipelineAudio,
  RecognitionMetadata,
  RecognitionOutput,
  SpeechRecognizer
} from './types'
import type { VoiceModelManager } from './model-manager'
import {
  VOICE_WORKER_PROTOCOL_VERSION,
  type WorkerRecognitionRequest,
  type WorkerRecognitionResponse
} from './worker-protocol'

type PendingRequest = {
  resolve: (result: RecognitionOutput) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  removeAbortListener: () => void
}

export class RecognitionHost {
  private child: ChildProcess | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private idleTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly workerPath: string,
    private readonly timeoutMs = 120_000,
    private readonly idleTimeoutMs = 60_000
  ) {}

  async recognize(
    source:
      | PipelineAudio
      | {
          encoded: { data: Uint8Array; sampleRate: number; sourceHash: string }
          silkWasmPath?: string
        },
    model: { modelPath: string; tokensPath: string; fingerprint: string },
    signal?: AbortSignal
  ): Promise<RecognitionOutput & { durationMs?: number; sourceHash?: string }> {
    if (signal?.aborted) throw new DOMException('Recognition cancelled', 'AbortError')
    const child = this.ensureChild()
    const requestId = randomUUID()
    const isEncoded = 'encoded' in source
    const request: WorkerRecognitionRequest = {
      version: VOICE_WORKER_PROTOCOL_VERSION,
      type: 'recognize',
      requestId,
      payload: isEncoded
        ? {
            recognizerId: 'sensevoice',
            encoded: source.encoded,
            silkWasmPath: source.silkWasmPath,
            modelPath: model.modelPath,
            tokensPath: model.tokensPath,
            modelFingerprint: model.fingerprint
          }
        : {
            recognizerId: 'sensevoice',
            samples: source.samples,
            sampleRate: source.sampleRate,
            modelPath: model.modelPath,
            tokensPath: model.tokensPath,
            modelFingerprint: model.fingerprint
          }
    }

    return new Promise<RecognitionOutput & { durationMs?: number; sourceHash?: string }>(
      (resolve, reject) => {
        const abort = (): void => {
          this.terminate(new DOMException('Recognition cancelled', 'AbortError'))
        }
        signal?.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(() => {
          this.terminate(new Error('Voice recognition timed out'))
        }, this.timeoutMs)
        this.pending.set(requestId, {
          resolve,
          reject,
          timer,
          removeAbortListener: () => signal?.removeEventListener('abort', abort)
        })
        child.send(request, (error) => {
          if (error) this.finish(requestId, null, error)
        })
      }
    )
  }

  async dispose(): Promise<void> {
    this.terminate(new Error('Voice recognition host disposed'))
  }

  private ensureChild(): ChildProcess {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.child?.connected) return this.child
    const child = fork(this.workerPath, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    child.on('message', (message: WorkerRecognitionResponse) => {
      if (message?.version !== VOICE_WORKER_PROTOCOL_VERSION) return
      if (message.type === 'result') {
        this.finish(message.requestId, {
          text: message.transcript,
          language: message.language,
          durationMs: message.durationMs,
          sourceHash: message.sourceHash
        })
      } else {
        this.finish(message.requestId, null, new Error(message.error))
      }
    })
    child.once('error', (error) => this.terminate(error))
    child.once('exit', (code) => {
      if (this.child === child) {
        this.child = null
        this.rejectAll(new Error(`Voice recognition worker exited (${code ?? 'unknown'})`))
      }
    })
    this.child = child
    return child
  }

  private finish(
    requestId: string,
    result: (RecognitionOutput & { durationMs?: number; sourceHash?: string }) | null,
    error?: Error
  ): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    clearTimeout(pending.timer)
    pending.removeAbortListener()
    if (error) pending.reject(error)
    else pending.resolve(result || { text: '' })
    if (this.pending.size === 0) this.scheduleIdleExit()
  }

  private terminate(error: Error): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    const child = this.child
    this.child = null
    if (child && !child.killed) child.kill()
    this.rejectAll(error)
  }

  private rejectAll(error: Error): void {
    for (const [requestId] of this.pending) this.finish(requestId, null, error)
  }

  private scheduleIdleExit(): void {
    if (!this.child || this.idleTimer) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.terminate(new Error('Voice recognition worker idle timeout'))
    }, this.idleTimeoutMs)
  }
}

export class WorkerSpeechRecognizer implements SpeechRecognizer {
  readonly metadata: RecognitionMetadata

  constructor(
    private readonly host: RecognitionHost,
    private readonly modelManager: VoiceModelManager
  ) {
    this.metadata = {
      recognizerId: 'sensevoice',
      modelVersion: modelManager.version,
      modelFingerprint: modelManager.fingerprint
    }
  }

  async recognize(
    audio: PipelineAudio | EncodedRecognitionInput,
    signal?: AbortSignal
  ): Promise<RecognitionOutput & { durationMs?: number; sourceHash?: string }> {
    const paths = await this.modelManager.getPaths()
    if (!paths) throw new Error('Voice recognition model is not ready')
    return this.host.recognize(
      audio,
      {
        modelPath: paths.model,
        tokensPath: paths.tokens,
        fingerprint: this.modelManager.fingerprint
      },
      signal
    )
  }

  dispose(): Promise<void> {
    return this.host.dispose()
  }
}
