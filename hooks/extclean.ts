// 확장 프로그램이 프로젝트 CLAUDE.md에 넣은 규칙 자동 정리 (전역 사용자만).
// 판단(전역 사용자인지, 전역 규칙이 있는지, [그대로 두기], 프로젝트 루트)은 모두 CLI(auto-clean-ext)가 한다.
// 여기서는 언제 부를지만 정한다: CLI가 알려 준 파일의 수정 시각이 바뀌었을 때만 다시 부른다.
import type { EngineInterface } from 'claude-code'

import type { CoreResult } from './core'

// CLI가 확정적으로 답한 파일과 그때의 수정 시각 (실패하면 비워서 다음에 다시 부른다)
let watched: { file: string; mtimeMs: number } | null = null
// 동시에 여러 번 부르지 않도록 진행 중인 확인을 같이 쓴다 (세션 시작 확인이 이것을 기다린다)
let running: Promise<void> | null = null

async function isUnchanged($: EngineInterface) {
  if (!watched) return false
  const stat = await $.fs.stat(watched.file).catch(() => null)
  return (stat?.mtimeMs ?? 0) === watched.mtimeMs
}

async function check($: EngineInterface, run: (args: string[]) => Promise<CoreResult>) {
  if (await isUnchanged($)) return
  const r = await run(['auto-clean-ext'])
  if (!r.ok) {
    watched = null
    $.ui.log(`orchestra: 확장 규칙 자동 정리 실패: ${r.error}`, { to: 'debug' })
    return
  }
  watched = { file: String(r.file), mtimeMs: Number(r.mtimeMs ?? 0) }
  if (r.action === 'cleaned') {
    $.ui.toast('🎼 확장 프로그램이 이 프로젝트 CLAUDE.md에 넣은 오케스트라 규칙을 지웠습니다 (전역 규칙과 중복). 백업: ~/.claude/orchestra/backup')
  }
}

// 적용 범위를 바꾼 뒤에는 파일이 그대로여도 다시 판단해야 하므로 기억을 지운다.
export function forgetExtCheck() {
  watched = null
}

export function autoCleanExt($: EngineInterface, run: (args: string[]) => Promise<CoreResult>): Promise<void> {
  running ??= check($, run).finally(() => {
    running = null
  })
  return running
}
