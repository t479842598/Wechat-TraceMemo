import type { VoiceMessageReference } from '../../shared/voice-recognition'
import type { VoiceService } from '../voice-service'
import {
  findSilkWasmRuntimeLocation,
  getSilkWasmRuntimeLocations,
  type EncodedVoiceSource
} from './audio-decoder'
import type {
  AudioProcessor,
  SourceResolver,
  SpeechRecognizer,
  TranscriptRecord,
  TranscriptRepository
} from './types'
import { voiceMessageIdentity } from './voice-message-identity'

export class VoiceSourceResolver implements SourceResolver {
  constructor(private readonly voiceService: VoiceService) {}

  async resolve(reference: VoiceMessageReference): Promise<EncodedVoiceSource> {
    const result = await this.voiceService.resolveSource(
      reference.sessionId,
      reference.localId,
      reference.createTime,
      reference.svrId
    )
    if (!result.success) throw new Error(result.error)
    return result.source
  }
}

export class VoicePipeline {
  constructor(
    private readonly sourceResolver: SourceResolver,
    private readonly audioProcessor: AudioProcessor,
    private readonly recognizer: SpeechRecognizer,
    private readonly transcripts: TranscriptRepository
  ) {}

  async run(
    accountId: string,
    reference: VoiceMessageReference,
    signal?: AbortSignal
  ): Promise<{ transcript: string; language?: string; durationMs: number; cached: boolean }> {
    const messageIdentity = voiceMessageIdentity(reference)
    const compatible = this.transcripts.findCompatible({
      accountId,
      messageIdentity,
      processorVersion: this.audioProcessor.version,
      ...this.recognizer.metadata
    })
    if (compatible?.transcript.trim()) {
      return {
        transcript: compatible.transcript.trim(),
        language: compatible.language,
        durationMs: compatible.durationMs,
        cached: true
      }
    }

    const source = await this.sourceResolver.resolve(reference)
    if (signal?.aborted) throw new DOMException('Recognition cancelled', 'AbortError')
    // silk 解码移到识别 worker 内执行：主进程不再同步解码，避免阻塞事件循环
    // （此前每条语音 WASM 解码期间所有 IPC/点击无响应）。
    let silkWasmPath: string | undefined
    try {
      silkWasmPath = findSilkWasmRuntimeLocation(getSilkWasmRuntimeLocations())?.packagePath
    } catch {
      // 非打包/测试环境可能无法解析运行时路径；worker 端缺路径会明确报错
    }
    const output = await this.recognizer.recognize(
      {
        encoded: {
          data: source.data,
          sampleRate: 24000,
          sourceHash: source.sourceHash
        },
        silkWasmPath
      },
      signal
    )
    const transcript = output.text.trim()
    if (!transcript) throw new Error('Voice recognition produced an empty transcript')
    const now = Date.now()
    const key = {
      accountId,
      messageIdentity,
      processorVersion: this.audioProcessor.version,
      ...this.recognizer.metadata
    }
    const record: TranscriptRecord = {
      ...key,
      audioHash: output.sourceHash || source.sourceHash,
      transcript,
      language: output.language,
      durationMs: output.durationMs || 0,
      createdAt: now,
      updatedAt: now
    }
    this.transcripts.save(record)
    return {
      transcript,
      language: output.language,
      durationMs: output.durationMs || 0,
      cached: false
    }
  }
}
