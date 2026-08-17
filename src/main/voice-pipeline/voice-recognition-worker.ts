import { createRequire } from 'module'
import { PcmAudioProcessor } from './audio-processor'
import { SenseVoiceRecognizer } from './sensevoice-recognizer'
import { WorkerRecognizerRegistry } from './worker-recognizer-registry'
import {
  VOICE_WORKER_PROTOCOL_VERSION,
  type WorkerRecognitionRequest,
  type WorkerRecognitionResponse
} from './worker-protocol'

const nodeRequire = createRequire(import.meta.url)

const recognizers = new WorkerRecognizerRegistry().register(new SenseVoiceRecognizer())
const processor = new PcmAudioProcessor()

function send(response: WorkerRecognitionResponse): void {
  if (process.send) process.send(response)
}

process.on('message', async (message: WorkerRecognitionRequest) => {
  if (
    message?.version !== VOICE_WORKER_PROTOCOL_VERSION ||
    message.type !== 'recognize' ||
    !message.requestId
  ) {
    return
  }

  try {
    const payload = message.payload
    let samples = payload.samples
    let sampleRate = payload.sampleRate
    let durationMs: number | undefined
    let sourceHash = payload.encoded?.sourceHash
    // silk 原始数据在 worker 内解码：主进程不执行同步 WASM 解码，避免阻塞事件循环
    if (payload.encoded && !samples) {
      if (!payload.silkWasmPath) throw new Error('silk-wasm 运行时路径缺失')
      const silkWasm = nodeRequire(payload.silkWasmPath) as {
        decode: (data: Uint8Array, sampleRate: number) => Promise<{ data: Uint8Array }>
      }
      const decoded = await silkWasm.decode(payload.encoded.data, payload.encoded.sampleRate)
      const pcm = Buffer.from(decoded.data)
      const processed = processor.process({
        pcm,
        sampleRate: payload.encoded.sampleRate,
        channels: 1,
        sourceHash: payload.encoded.sourceHash
      })
      samples = processed.samples
      sampleRate = processed.sampleRate
      durationMs = processed.durationMs
    }
    if (!samples || !sampleRate) throw new Error('语音音频数据为空')
    const fakeTranscript = process.env.WXE_VOICE_RECOGNITION_FAKE_TEXT
    const result = fakeTranscript
      ? { transcript: fakeTranscript, language: 'zh' }
      : await recognizers.get(payload.recognizerId).recognize({
          samples,
          sampleRate,
          modelPath: payload.modelPath,
          tokensPath: payload.tokensPath,
          modelFingerprint: payload.modelFingerprint
        })
    send({
      version: VOICE_WORKER_PROTOCOL_VERSION,
      type: 'result',
      requestId: message.requestId,
      ...result,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(sourceHash ? { sourceHash } : {})
    })
  } catch (error) {
    send({
      version: VOICE_WORKER_PROTOCOL_VERSION,
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})
