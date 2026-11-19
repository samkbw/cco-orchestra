// 확장 프로그램이 프로젝트 CLAUDE.md에 넣은 규칙 자동 정리 (전역 사용자만).
// 판단은 언어가 아니라 확장이 붙이는 표시(claude-code-orchestrator:policy:start~end) 구간으로 한다. 그 구간만 지우고 나머지는 그대로.
// 프로젝트마다 설정한 사람, [그대로 두기]를 누른 프로젝트는 건드리지 않는다. 지울 때는 CLI(clean-ext)가 백업·기록한다.
import type { EngineInterface } from 'claude-code'

import type { CoreResult } from './core'

const EXT_START = '<!-- claude-code-orchestrator:policy:start -->'
const EXT_END = '<!-- claude-code-orchestrator:policy:end -->'

// 같은 파일을 매번 읽지 않도록 마지막으로 본 수정 시각
let lastSeen = ''

function homeOf($: EngineInterface) {
  return $.plugin.root.replace(/\\/g, '/').split('/.claude/')[0]
}

// lib/sys.mjs의 normDir과 같게: 슬래시, 드라이브 소문자, 끝 슬래시 없음
const normDir = (dir: string) => dir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_m, d: string) => `${d.toLowerCase()}:`).replace(/\/+$/, '')

async function readJson($: EngineInterface, file: string): Promise<any> {
  try {
    return (await $.fs.exists(file)) ? JSON.parse(await $.fs.read(file)) : null
  } catch {
    return null
  }
}

export async function autoCleanExt($: EngineInterface, root: string, run: (args: string[]) => Promise<CoreResult>) {
  const file = `${root}/CLAUDE.md`
  const stat = await $.fs.stat(file).catch(() => null)
  if (!stat) return
  const seen = `${file}:${stat.mtimeMs}:${stat.size}`
  if (seen === lastSeen) return
  lastSeen = seen
  const text = await $.fs.read(file)
  const s = text.indexOf(EXT_START)
  if (s < 0 || text.indexOf(EXT_END, s) < 0) return
  const state = await readJson($, `${homeOf($)}/.claude/orchestra/state.json`)
  if (state?.mode !== 'global' || !state?.records?.global) return
  if (state?.keepExt?.[normDir(root)]) return
  const r = await run(['clean-ext'])
  if (!r.ok) {
    $.ui.log(`orchestra: 확장 규칙 자동 정리 실패: ${r.error}`, { to: 'debug' })
    return
  }
  if (r.changed) {
    $.ui.toast('🎼 확장 프로그램이 이 프로젝트 CLAUDE.md에 넣은 오케스트라 규칙을 지웠습니다 (전역 규칙과 중복). 백업: ~/.claude/orchestra/backup')
  }
}
