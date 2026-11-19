// 상태 요약과 알림: 패널과 터미널이 같은 내용을 보여 주도록 한곳에서 만든다.
import { logFile } from './sys.mjs'

export function summarize(c) {
  const rec = c.state.record
  const rows = [
    { label: '적용 범위', value: rec ? (rec.scope === 'global' ? '모든 프로젝트' : '이 프로젝트') : '아직 설정 안 됨', isOk: Boolean(rec) },
    { label: '규칙 파일', value: rec?.target ?? '-', isOk: Boolean(rec) },
    {
      label: '기본 규칙 버전',
      value: rec ? `${rec.version}${c.ext && c.ext.version !== rec.version ? ` (설치된 확장 ${c.ext.version})` : ''}` : '-',
      isOk: Boolean(rec) && c.ext?.version === rec.version,
    },
    { label: 'Claude Code Orchestrator 확장', value: c.ext ? `설치됨 (${c.ext.version})` : '없음', isOk: Boolean(c.ext) },
    { label: '연결 서버', value: c.server ? '있음' : '없음 (VS Code를 한 번 열어 주세요)', isOk: c.server },
  ]
  if (c.mcp) {
    const isShadowed = !c.mcp.isPlugin && c.mcp.isRegistered && /Project|Local/i.test(c.mcp.where)
    rows.push({
      label: '연결 (cco-dispatch)',
      value: !c.mcp.isRegistered ? '없음 (플러그인을 켜 주세요)' : `${c.mcp.isConnected ? '연결됨' : '연결 안 됨'} · ${c.mcp.isPlugin ? '오케스트라 플러그인' : c.mcp.where}${isShadowed ? ' · 이 프로젝트에 직접 등록한 cco-dispatch가 있음' : ''}`,
      isOk: c.mcp.isConnected && !isShadowed,
    })
  }
  const claudeWorkers = c.worker.claudeWorkers ?? []
  rows.push({ label: 'Claude 작업 워커', value: claudeWorkers.length ? claudeWorkers.join(', ') : '없음 (작업은 Codex만 함)', isOk: claudeWorkers.length > 0 })
  const codexText = !c.codex.isInstalled
    ? '설치 안 됨'
    : !c.codex.isFound
      ? '설치됐지만 오케스트라가 찾지 못함'
      : c.codex.isLoggedIn === false
        ? '로그인 안 됨'
        : `사용 가능${c.worker.codexWorkers.length ? ` · 워커 ${c.worker.codexWorkers.join(', ')}` : ' · 워커 등록 안 됨'}`
  rows.push({ label: 'Codex (선택)', value: codexText, isOk: c.codex.isFound && c.codex.isLoggedIn !== false && c.worker.codexWorkers.length > 0 })
  rows.push({ label: '기록', value: logFile, isOk: true })
  return rows
}

// 알림과 그에 맞는 버튼(동작 키)
export function notices(c) {
  const list = []
  const actions = []
  const rec = c.state.record
  if (rec?.pendingVersion) {
    list.push(`고친 규칙이 있어 새 기본 규칙(${rec.pendingVersion})을 따로 저장해 두었습니다: ${rec.savedPath}. Claude에게 "오케스트라 규칙을 새 기본 규칙과 합쳐줘"라고 해 주세요.`)
    actions.push('mergeDone')
  }
  if (rec && c.ext && rec.version !== c.ext.version && rec.pendingVersion !== c.ext.version) {
    list.push(`확장 프로그램이 ${rec.version} → ${c.ext.version}로 바뀌었습니다. 기본 규칙을 갱신해 주세요.`)
    actions.push('sync')
  }
  if (rec?.scope === 'global' && c.projectHasExtBlock && !c.keepExt) {
    list.push('이 프로젝트 CLAUDE.md에 확장 프로그램이 넣은 기본 규칙이 있어 전역 규칙과 겹칩니다.')
    actions.push('cleanExt', 'keepExt')
  }
  if (c.codex.isInstalled && !c.codex.isFound && c.codex.fixDir) {
    list.push('Codex가 설치돼 있지만 오케스트라가 찾지 못합니다.')
    actions.push('fixCodex')
  }
  if (c.policyError) list.push(`확장 프로그램에서 기본 규칙을 읽지 못했습니다 (${c.policyError}). 확장 프로그램을 다시 설치하거나 업데이트해 주세요.`)
  if (c.precedenceOk === false) list.push('확장 프로그램 규칙 형식이 바뀌어 우선순위 규칙을 빼지 못했을 수 있습니다. 규칙을 한 번 확인해 주세요.')
  return { list, actions }
}
