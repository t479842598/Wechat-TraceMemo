import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Contact, Message } from '../../../../shared/types'
import { CloseIcon } from '../chat/icons'

export interface GroupLeaveEvent {
  roomId: string
  wxid: string
  name: string
  time: number
}

export type GroupStatRange = '7d' | '30d' | 'all'

interface GroupManagerPanelProps {
  contact: Contact
  onClose: () => void
  leaveEvents: GroupLeaveEvent[]
}

interface GroupMemberRow {
  wxid: string
  name: string
  avatar: string
  hasLeft: boolean
}

type PanelTab = 'members' | 'ranking' | 'leaves'

const RANGE_LABELS: Record<GroupStatRange, string> = {
  '7d': '近 7 天',
  '30d': '近 30 天',
  all: '全部'
}

const formatGroupMemberName = (member: {
  wxid: string
  nickname: string
  groupNickname: string
  wechatNickname: string
  remark: string
}): string =>
  member.groupNickname || member.nickname || member.remark || member.wechatNickname || member.wxid

const rangeStart = (range: GroupStatRange): number | undefined => {
  if (range === 'all') return undefined
  const days = range === '7d' ? 7 : 30
  return Math.floor(Date.now() / 1000) - days * 24 * 3600
}

const isSystemMessage = (message: Message): boolean =>
  message.from === 'system' || message.type === '系统消息'

function usePanelMessages(
  contact: Contact | null,
  range: GroupStatRange,
  enabled: boolean
): {
  messages: Message[]
  loading: boolean
  error: string
} {
  const [messages, setMessages] = useState<Message[]>([])
  const [loadedRange, setLoadedRange] = useState<GroupStatRange | null>(null)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  useEffect(() => {
    // 仅在排行页签可见时才拉取，避免打开面板就加载大量消息造成卡顿。
    // 不传 limit：主进程会把 limit 钳制为最多 5000 条，会导致大群排行统计
    // 不完整；这里需要全量消息才能得到准确的发言数量。
    if (!contact || contact.type !== 'group' || !enabled) return
    const requestId = ++requestRef.current
    void window.api
      .getMessages(contact.md5, rangeStart(range), undefined)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setMessages(result)
        setLoadedRange(range)
        setError('')
      })
      .catch((err: unknown) => {
        if (requestId !== requestRef.current) return
        setError(err instanceof Error ? err.message : String(err))
        setMessages([])
        setLoadedRange(range)
      })
  }, [contact, range, enabled])

  const loading = enabled && loadedRange !== range
  return { messages, loading, error }
}

// 发言排行专用：优先通过主进程 SQL 聚合每个发送者的发言数（不传输全量消息），
// SQL 通道不可用（返回 null）时回退到拉取消息后在前端计数。
function usePanelSenderCounts(
  contact: Contact | null,
  range: GroupStatRange,
  enabled: boolean
): {
  counts: { sender: string; count: number }[] | null
  loading: boolean
  error: string
} {
  const [counts, setCounts] = useState<{ sender: string; count: number }[] | null>(null)
  const [loadedRange, setLoadedRange] = useState<GroupStatRange | null>(null)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  useEffect(() => {
    if (!contact || contact.type !== 'group' || !enabled) return
    const requestId = ++requestRef.current
    void window.api
      .getGroupSenderCounts(contact.md5, rangeStart(range), undefined)
      .then((result) => {
        if (requestId !== requestRef.current) return
        setCounts(result || null)
        setLoadedRange(range)
        setError('')
      })
      .catch((err: unknown) => {
        if (requestId !== requestRef.current) return
        setError(err instanceof Error ? err.message : String(err))
        setCounts(null)
        setLoadedRange(range)
      })
  }, [contact, range, enabled])

  const loading = enabled && loadedRange !== range
  return { counts, loading, error }
}

interface HistoricalLeaver {
  wxid: string
  name: string
  avatar: string
  lastSeen: number
}

// 读取群聊全部聊天记录的发送人，与当前成员快照对比，识别「曾发过消息但已不在
// 成员列表」的退群成员（历史退群检测）。仅在退群页签可见时执行，结果缓存复用。
function useHistoricalLeavers(
  contact: Contact | null,
  members: GroupMemberRow[],
  enabled: boolean
): { leavers: HistoricalLeaver[]; loading: boolean; error: string } {
  const [leavers, setLeavers] = useState<HistoricalLeaver[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const cacheRef = useRef<{ key: string; leavers: HistoricalLeaver[] } | null>(null)

  useEffect(() => {
    if (!contact || contact.type !== 'group' || !enabled || members.length === 0) return
    const cacheKey = `${contact.md5}:${members.length}:${members[0]?.wxid}:${members[members.length - 1]?.wxid}`
    const cached = cacheRef.current
    if (cached && cached.key === cacheKey) {
      setLeavers(cached.leavers)
      setError('')
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    // 不传 limit 拉取全部历史消息（主进程会把 limit 钳制为最多 5000 条，
    // 传 limit 会导致退群检测漏掉更早的发送人），仅提取发送人信息用于退群对比。
    void window.api
      .getMessages(contact.md5, undefined, undefined)
      .then((allMessages) => {
        if (requestId !== requestRef.current) return
        const memberIds = new Set(members.map((member) => member.wxid))
        const memberNameById = new Map(members.map((member) => [member.wxid, member.name]))
        const memberIdByName = new Map<string, string>()
        for (const member of members) {
          if (member.name && member.name !== member.wxid) {
            memberIdByName.set(member.name, member.wxid)
          }
        }
        // 归一化发送人：优先 wxid，其次通过昵称反查 wxid，保证与成员列表可比。
        const normalizeSender = (message: Message): string => {
          const rawId = String(message.senderId || '').trim()
          const rawName = String(message.name || '').trim()
          if (rawId && memberIds.has(rawId)) return rawId
          if (rawName && memberIdByName.has(rawName)) return memberIdByName.get(rawName) as string
          if (rawId) return rawId
          return rawName
        }
        const lastSeenById = new Map<string, number>()
        const nameById = new Map<string, string>()
        for (const message of allMessages) {
          if (isSystemMessage(message)) continue
          const senderKey = normalizeSender(message)
          if (!senderKey) continue
          lastSeenById.set(
            senderKey,
            Math.max(lastSeenById.get(senderKey) || 0, message.createTime || 0)
          )
          const senderName = String(message.name || '').trim()
          if (senderName && senderName !== senderKey) nameById.set(senderKey, senderName)
        }
        const result: HistoricalLeaver[] = Array.from(lastSeenById.entries())
          .filter(([wxid]) => !memberIds.has(wxid))
          .map(([wxid, lastSeen]) => ({
            wxid,
            name: memberNameById.get(wxid) || nameById.get(wxid) || wxid,
            avatar: '',
            lastSeen
          }))
          .sort((left, right) => right.lastSeen - left.lastSeen)
        cacheRef.current = { key: cacheKey, leavers: result }
        setLeavers(result)
      })
      .catch((err: unknown) => {
        if (requestId !== requestRef.current) return
        setError(err instanceof Error ? err.message : String(err))
        setLeavers([])
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false)
      })
  }, [contact, members, enabled])

  return { leavers, loading, error }
}

export function GroupManagerPanel({
  contact,
  onClose,
  leaveEvents
}: GroupManagerPanelProps): React.ReactElement {
  const [tab, setTab] = useState<PanelTab>('members')
  const [range, setRange] = useState<GroupStatRange>('30d')
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(true)

  useEffect(() => {
    if (!contact || contact.type !== 'group') return
    let disposed = false
    void window.api
      .getGroupSnapshot(contact.md5)
      .then((snapshot) => {
        if (disposed || !snapshot) return
        setMembers(
          snapshot.members.map((member) => ({
            wxid: member.wxid,
            name: formatGroupMemberName(member),
            avatar: member.avatar || '',
            hasLeft: false
          }))
        )
      })
      .catch((err: unknown) => {
        if (!disposed) console.warn('[GroupManager] snapshot load failed:', err)
      })
      .finally(() => {
        if (!disposed) setMembersLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [contact])

  useEffect(() => {
    if (contact?.type !== 'group') return
    const escapeListener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escapeListener)
    return () => window.removeEventListener('keydown', escapeListener)
  }, [contact, onClose])

  const {
    counts: senderCounts,
    loading: countsLoading,
    error: countsError
  } = usePanelSenderCounts(contact, range, tab === 'ranking')
  // 只有 SQL 聚合明确返回 null（通道不可用）才回退到拉取全量消息；
  // 聚合请求进行中不触发消息加载，避免大群双倍开销。
  const countsResolved = !countsLoading && !countsError
  const countsAvailable = senderCounts !== null && countsResolved

  const {
    messages,
    loading: messagesLoading,
    error: messagesError
  } = usePanelMessages(
    contact,
    range,
    tab === 'ranking' && countsResolved && senderCounts === null
  )

  const statsLoading = countsLoading || (countsResolved && senderCounts === null && messagesLoading)
  const statsError = countsAvailable ? countsError : messagesError

  const roomLeaves = useMemo(
    () =>
      contact?.type === 'group'
        ? leaveEvents
            .filter((event) => event.roomId === contact.m_nsUsrName || event.roomId === contact.md5)
            .sort((left, right) => right.time - left.time)
        : [],
    [contact, leaveEvents]
  )

  const ranking = useMemo(() => {
    // 建立成员 wxid ↔ 昵称 双向映射：群消息里部分记录只有昵称没有 senderId，
    // 若不归一化，同一成员的 wxid 与昵称会统计成两个条目，数量不准。
    const memberById = new Map(members.map((member) => [member.wxid, member]))
    const memberIdByName = new Map<string, string>()
    for (const member of members) {
      if (member.name && member.name !== member.wxid) memberIdByName.set(member.name, member.wxid)
    }
    const normalizeKey = (raw: string): string => {
      const trimmed = raw.trim()
      if (memberById.has(trimmed)) return trimmed
      const byName = memberIdByName.get(trimmed)
      if (byName) return byName
      return trimmed
    }
    const counts = new Map<string, number>()
    if (senderCounts) {
      // SQL 聚合路径：主进程已经排除了系统消息，直接累加发送者。
      for (const item of senderCounts) {
        const senderKey = normalizeKey(item.sender)
        if (!senderKey) continue
        counts.set(senderKey, (counts.get(senderKey) || 0) + item.count)
      }
    } else {
      const normalizeSender = (message: Message): string => {
        const rawId = String(message.senderId || '').trim()
        const rawName = String(message.name || '').trim()
        if (rawId && memberById.has(rawId)) return rawId
        if (rawName && memberIdByName.has(rawName)) return memberIdByName.get(rawName) as string
        if (rawId) return rawId
        return rawName
      }
      for (const message of messages) {
        if (isSystemMessage(message)) continue
        const senderKey = normalizeSender(message)
        if (!senderKey) continue
        counts.set(senderKey, (counts.get(senderKey) || 0) + 1)
      }
    }
    const rows = Array.from(counts.entries())
      .map(([wxid, count]) => {
        const member = memberById.get(wxid)
        return {
          wxid,
          count,
          name: member?.name || wxid,
          avatar: member?.avatar || ''
        }
      })
      .sort((left, right) => right.count - left.count)
    return rows
  }, [messages, members, senderCounts])

  const silentMembers = useMemo(() => {
    const counted = new Set(ranking.map((row) => row.wxid))
    return members.filter((member) => !counted.has(member.wxid))
  }, [members, ranking])

  // 历史退群检测：读取全部聊天记录发送人，与当前成员对比。与实时监控事件合并展示。
  const {
    leavers: historicalLeavers,
    loading: historicalLoading,
    error: historicalError
  } = useHistoricalLeavers(contact, members, tab === 'leaves')

  const combinedLeaves = useMemo(() => {
    const realtime = roomLeaves.map((event) => ({
      key: `realtime:${event.wxid}:${event.time}`,
      wxid: event.wxid,
      name: event.name,
      time: event.time,
      source: 'realtime' as const
    }))
    const historical = historicalLeavers.map((leaver) => ({
      key: `history:${leaver.wxid}`,
      wxid: leaver.wxid,
      name: leaver.name,
      time: leaver.lastSeen,
      source: 'history' as const
    }))
    return [...realtime, ...historical]
      .sort((left, right) => right.time - left.time)
      .filter(
        (item, index, all) =>
          index === 0 ||
          !all.slice(0, index).some((prev) => prev.wxid === item.wxid && prev.source === 'realtime')
      )
  }, [roomLeaves, historicalLeavers])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="group-manager-overlay" onClick={handleBackdropClick} role="presentation">
      <div className="group-manager-panel" role="dialog" aria-modal="true" aria-label="群管理">
        <header className="group-manager-header">
          <div className="group-manager-title">
            <h2>{contact.m_nsNickName || '群管理'}</h2>
            <p>
              {members.length ? `${members.length} 位成员` : '正在读取成员…'}
              {roomLeaves.length > 0 ? ` · 累计 ${roomLeaves.length} 次退群` : ''}
            </p>
          </div>
          <button type="button" className="group-manager-close" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </header>

        <nav className="group-manager-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'members'}
            className={tab === 'members' ? 'active' : ''}
            onClick={() => setTab('members')}
          >
            群成员
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ranking'}
            className={tab === 'ranking' ? 'active' : ''}
            onClick={() => setTab('ranking')}
          >
            发言排行
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'leaves'}
            className={tab === 'leaves' ? 'active' : ''}
            onClick={() => setTab('leaves')}
          >
            退群记录
            {roomLeaves.length > 0 && (
              <span className="group-manager-badge">{roomLeaves.length}</span>
            )}
          </button>
        </nav>

        <div className="group-manager-body">
          {tab === 'members' && (
            <section className="group-manager-section">
              {membersLoading ? (
                <div className="group-manager-loading">正在加载群成员…</div>
              ) : members.length === 0 ? (
                <div className="group-manager-empty">暂未读取到群成员信息</div>
              ) : (
                <ul className="group-manager-members">
                  {members.map((member) => (
                    <li key={member.wxid} className="group-manager-member">
                      <span className="group-manager-member-avatar">
                        {member.avatar ? (
                          <img src={member.avatar} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          member.name.charAt(0)
                        )}
                      </span>
                      <span className="group-manager-member-name" title={member.wxid}>
                        {member.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'ranking' && (
            <section className="group-manager-section">
              <div className="group-manager-range-switch" role="tablist" aria-label="统计时间范围">
                {(['7d', '30d', 'all'] as GroupStatRange[]).map((value) => (
                  <button
                    type="button"
                    key={value}
                    role="tab"
                    aria-selected={range === value}
                    className={range === value ? 'active' : ''}
                    onClick={() => setRange(value)}
                  >
                    {RANGE_LABELS[value]}
                  </button>
                ))}
              </div>
              {statsLoading ? (
                <div className="group-manager-loading">正在统计发言数量…</div>
              ) : statsError ? (
                <div className="group-manager-empty">统计失败：{statsError}</div>
              ) : ranking.length === 0 ? (
                <div className="group-manager-empty">该时间段内没有可统计的发言</div>
              ) : (
                <ol className="group-manager-ranking">
                  {ranking.map((row, index) => (
                    <li key={row.wxid} className="group-manager-rank-item">
                      <span className={`group-manager-rank-index ${index < 3 ? 'top' : ''}`}>
                        {index + 1}
                      </span>
                      <span className="group-manager-rank-avatar">
                        {row.avatar ? (
                          <img src={row.avatar} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          row.name.charAt(0)
                        )}
                      </span>
                      <span className="group-manager-rank-name" title={row.wxid}>
                        {row.name}
                      </span>
                      <span className="group-manager-rank-bar">
                        <span
                          className="group-manager-rank-bar-fill"
                          style={{
                            width: `${Math.max(4, (row.count / (ranking[0]?.count || 1)) * 100)}%`
                          }}
                        />
                      </span>
                      <span className="group-manager-rank-count">{row.count}</span>
                    </li>
                  ))}
                </ol>
              )}
              {!statsLoading && !statsError && members.length > 0 && (
                <div className="group-manager-silent">
                  <h3>未发言成员（{silentMembers.length}）</h3>
                  {silentMembers.length === 0 ? (
                    <p className="group-manager-silent-none">该时间段内所有成员都有发言</p>
                  ) : (
                    <ul className="group-manager-silent-list">
                      {silentMembers.map((member) => (
                        <li key={member.wxid} title={member.wxid}>
                          <span className="group-manager-silent-avatar">
                            {member.avatar ? (
                              <img src={member.avatar} alt="" referrerPolicy="no-referrer" />
                            ) : (
                              member.name.charAt(0)
                            )}
                          </span>
                          <span>{member.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === 'leaves' && (
            <section className="group-manager-section">
              {historicalLoading ? (
                <div className="group-manager-loading">正在扫描全部聊天记录识别退群成员…</div>
              ) : historicalError ? (
                <div className="group-manager-empty">退群检测失败：{historicalError}</div>
              ) : combinedLeaves.length === 0 ? (
                <div className="group-manager-empty">
                  暂无退群记录。已对比当前成员与全部聊天记录发送人，未发现曾发言但已不在群内的成员。
                </div>
              ) : (
                <>
                  <p className="group-manager-leaves-hint">
                    共识别 {combinedLeaves.length} 位退群成员，按最后发言时间排序
                  </p>
                  <ul className="group-manager-leaves">
                    {combinedLeaves.map((event) => (
                      <li key={event.key} className="group-manager-leave">
                        <span className="group-manager-leave-name" title={event.wxid}>
                          {event.name}
                        </span>
                        <span className="group-manager-leave-time">
                          {event.time
                            ? new Date(event.time * 1000).toLocaleString('zh-CN', {
                                hour12: false
                              })
                            : '未知时间'}
                        </span>
                        <span
                          className={`group-manager-leave-tag ${event.source === 'realtime' ? 'realtime' : ''}`}
                        >
                          {event.source === 'realtime' ? '实时监控' : '历史检测'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
