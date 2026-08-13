import React, { useState } from 'react'
import {
  SUMMARY_DATE_OPTIONS,
  SummaryDateRange,
  isCustomRange,
  CustomSummaryDateRange
} from '../../utils/group-report'
import { RangeMessageState } from '../../hooks/useGroupReportGeneration'

interface ReportRangeSelectorProps {
  value: SummaryDateRange
  messageCount: number
  rangeState: RangeMessageState
  disabled: boolean
  onChange: (value: SummaryDateRange) => void
}

const todayISO = (): string => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const nowTime = (): string => {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const isoDaysAgo = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function ReportRangeSelector({
  value,
  messageCount,
  rangeState,
  disabled,
  onChange
}: ReportRangeSelectorProps): React.ReactElement {
  const isCustom = isCustomRange(value)
  const [customStart, setCustomStart] = useState<string>(
    isCustom ? value.startDate : isoDaysAgo(6)
  )
  const [customEnd, setCustomEnd] = useState<string>(isCustom ? value.endDate : todayISO())
  const [customStartTime, setCustomStartTime] = useState<string>(
    isCustom ? value.startTime || '00:00' : '00:00'
  )
  const [customEndTime, setCustomEndTime] = useState<string>(
    // 结束时间默认取打开面板时的当前时刻，之后保持用户选择/该默认值，直到点击生成日报
    isCustom ? value.endTime || nowTime() : nowTime()
  )

  const countText =
    rangeState.status === 'loading'
      ? '正在计算'
      : rangeState.status === 'error'
        ? rangeState.error
        : `${messageCount} 条消息`

  const normalizeTime = (value: string): string => (value ? value.slice(0, 5) : '')

  const applyCustom = (): void => {
    const startDate = customStart || isoDaysAgo(6)
    const endDate = customEnd || todayISO()
    const startTime = normalizeTime(customStartTime) || '00:00'
    const endTime = normalizeTime(customEndTime) || nowTime()
    if (`${startDate} ${startTime}` > `${endDate} ${endTime}`) {
      onChange({
        custom: true,
        startDate: endDate,
        endDate: startDate,
        startTime: endTime,
        endTime: startTime
      })
      return
    }
    onChange({ custom: true, startDate, endDate, startTime, endTime })
  }

  const selectCustom = (): void => {
    const startDate = customStart || isoDaysAgo(6)
    const endDate = customEnd || todayISO()
    const startTime = normalizeTime(customStartTime) || '00:00'
    const endTime = normalizeTime(customEndTime) || nowTime()
    const range: CustomSummaryDateRange =
      `${startDate} ${startTime}` <= `${endDate} ${endTime}`
        ? { custom: true, startDate, endDate, startTime, endTime }
        : { custom: true, startDate: endDate, endDate: startDate, startTime: endTime, endTime: startTime }
    onChange(range)
  }

  return (
    <section className="report-config-section">
      <div className="report-section-heading">
        <h3>总结范围</h3>
        <span className={rangeState.status === 'error' ? 'danger' : ''}>{countText}</span>
      </div>
      <div className="report-range-options">
        {SUMMARY_DATE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={!isCustom && value === option.value ? 'active' : ''}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className={isCustom ? 'active' : ''}
          disabled={disabled}
          title="自定义开始和结束日期"
          onClick={selectCustom}
        >
          自定义
        </button>
      </div>
      {isCustom && (
        <div className="report-custom-range">
          <label className="report-custom-field">
            <span>开始</span>
            <input
              type="date"
              value={customStart}
              disabled={disabled}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              onBlur={applyCustom}
            />
            <input
              type="time"
              value={customStartTime}
              disabled={disabled}
              onChange={(e) => setCustomStartTime(e.target.value)}
              onBlur={applyCustom}
            />
          </label>
          <label className="report-custom-field">
            <span>结束</span>
            <input
              type="date"
              value={customEnd}
              disabled={disabled}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              onBlur={applyCustom}
            />
            <input
              type="time"
              value={customEndTime}
              disabled={disabled}
              onChange={(e) => setCustomEndTime(e.target.value)}
              onBlur={applyCustom}
            />
          </label>
        </div>
      )}
    </section>
  )
}
