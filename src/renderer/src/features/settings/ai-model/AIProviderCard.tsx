import { memo } from 'react'
import type { AIProviderSummary } from '../../../../../shared/ai-provider'
import { PROVIDER_TYPE_LABELS } from './presets'

const STATUS_LABELS = { untested: '未测试', connected: '已连接', error: '连接失败' }

export const AIProviderCard = memo(function AIProviderCard({
  provider,
  testing,
  onEdit,
  onTest,
  onDefault,
  onDelete
}: {
  provider: AIProviderSummary
  testing: boolean
  onEdit: () => void
  onTest: () => void
  onDefault: () => void
  onDelete: () => void
}): React.ReactElement {  const model = provider.models.find((item) => item.id === provider.defaultModel)
  return (
    <article className="ai-provider-card">
      <header>
        <div>
          <h3>{provider.name}</h3>
          <span>{PROVIDER_TYPE_LABELS[provider.type]}</span>
        </div>
        <span className={`ai-provider-status ${provider.status}`}>
          {STATUS_LABELS[provider.status]}
        </span>
      </header>
      <dl>
        <div>
          <dt>地址</dt>
          <dd title={provider.baseUrl}>{provider.baseUrl}</dd>
        </div>
        <div>
          <dt>默认模型</dt>
          <dd>{model?.name || provider.defaultModel}</dd>
        </div>
        <div>
          <dt>API Key</dt>
          <dd>
            {provider.hasApiKey ? '已安全保存' : provider.type === 'ollama' ? '无需配置' : '未配置'}
          </dd>
        </div>
      </dl>
      {provider.lastError ? <p className="ai-provider-error">{provider.lastError}</p> : null}
      <footer>
        <button onClick={onEdit}>编辑</button>
        <button disabled={testing} onClick={onTest}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button disabled={provider.isDefault} onClick={onDefault}>
          {provider.isDefault ? '当前默认' : '设为默认'}
        </button>
        <button className="danger" onClick={onDelete}>
          删除
        </button>
      </footer>
    </article>
  )
}, areProviderCardEqual)

/**
 * 回调（onEdit 等）由 AIModelPage 内联创建、每次渲染都会变化，
 * 但行为只依赖 provider 本身，因此只比较数据，避免编辑器输入时列表整体重渲染。
 */
function areProviderCardEqual(
  prev: { provider: AIProviderSummary; testing: boolean },
  next: { provider: AIProviderSummary; testing: boolean }
): boolean {
  return prev.provider === next.provider && prev.testing === next.testing
}
