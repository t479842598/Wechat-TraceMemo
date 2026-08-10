import { expect, test } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchTestApp } from './support/electron'

const baselineDirectory = resolve(`tests/e2e/__screenshots__/${process.platform}/visual.spec.ts`)
const visualViewport = { width: 1000, height: 650 }
test.skip(
  !existsSync(baselineDirectory) && process.env.WXE_UPDATE_VISUAL_BASELINES !== '1',
  `No reviewed ${process.platform} visual baseline is committed yet`
)

test('NAV-01 login page visual @visual', async () => {
  const fixture = await launchTestApp({ mode: 'disconnected', fixedTimes: true })
  try {
    await fixture.page.setViewportSize(visualViewport)
    await expect(fixture.page.getByRole('heading', { name: 'WechatExplorer' })).toBeVisible()
    await expect(fixture.page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
      caret: 'hide',
      // 统一抗锯齿渲染：基线在本地 Windows 生成，CI 跑在 Windows Server 上，
      // 默认 ClearType 子像素 AA 的差异会造成文本区域像素不同（见 visual-style.css）。
      stylePath: resolve('tests/e2e/visual-style.css'),
      // 基线生成机与 CI 的字体/字形仍可能有细微差异，2% 容差吸收残余差异。
      maxDiffPixelRatio: 0.02
    })
  } finally {
    await fixture.close()
  }
})

test('ARCH-01 archive page visual @visual', async () => {
  const fixture = await launchTestApp({ fixedTimes: true })
  try {
    await fixture.page.setViewportSize(visualViewport)
    await fixture.page.getByText('产品测试群', { exact: true }).click()
    await expect(fixture.page.getByText('这是一条脱敏测试消息', { exact: true })).toBeVisible()
    await expect(fixture.page).toHaveScreenshot('archive-page.png', {
      animations: 'disabled',
      caret: 'hide',
      // fixedTimes 保证消息时间用 fixture 固定值（不随运行日期平移），
      // 否则分组时间分隔标签“M 月 D 日”会随日历推移变化导致基线过期；
      // 同时统一抗锯齿渲染并放宽像素容差吸收跨机器字体差异。
      stylePath: resolve('tests/e2e/visual-style.css'),
      maxDiffPixelRatio: 0.02
    })
  } finally {
    await fixture.close()
  }
})
