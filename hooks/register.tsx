import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { OrchestraView, StepRow } from '../types'
import { STEP_TIMEOUT_MS, core, installNode } from './core'
import type { CoreResult } from './core'
import { renderPane } from './view'
import { TUNE_TEXT, tunePrompt } from './tune'
import { isDispatch, renderDispatchRow, renderWorkerBoard, renderWorkerSection, rewriteSpinner, startWorkerBoard } from './workers'

const PANE = 'orchestra'
const TITLE = '🎼 오케스트라'
// lib/install.mjs의 DEPENDS_ON과 같게 유지
const DEPENDS_ON: Record<string, string> = { ext: 'vscode', claudeExt: 'vscode', server: 'ext', claudeLogin: 'claudeCli', codexPath: 'codex', codexLogin: 'codex', worker: 'codex' }
const START_MARK = '<!-- orchestra:rules:start -->'
const END_MARK = '<!-- orchestra:rules:end -->'

const EMPTY: OrchestraView = { stage: 'loading', rows: [], steps: [], notices: [], actions: [], message: [], isBusy: false }
const view = atom({ plugin: 'orchestra', key: 'view' } as const, EMPTY, { shape: 'view-2' })
// 규칙 맞추기 대상 파일 (보여 준 규칙 위치)
const tuneTarget = atom({ plugin: 'orchestra', key: 'tuneTarget' } as const, '', { shape: 'tune-1' })
const CHOOSE: Partial<OrchestraView> = { stage: 'choose', rows: [], notices: [], message: [], actions: ['chooseGlobal', 'chooseProject'] }

const DONE = [
  '🎼 오케스트라 설정이 끝났습니다',
  '',
  '이제 Claude가 큰 일을 여러 AI(워커)에게 나눠 맡기고, 결과를 모아서 확인합니다.',
  '',
  '지금은 확장 프로그램을 만든 사람이 정한 기본 규칙이 그대로 들어가 있습니다.',
  '사람마다 일하는 방식이 다르니, 한 번 읽어 보고 내 방식에 맞게 고쳐 주세요.',
  '',
  '- 규칙 보기: /orch',
  '- 규칙 고치기: Claude에게 말로 하면 됩니다. 예) "오케스트라 규칙에서 작은 일은 직접 하게 바꿔줘"',
  '',
  '고친 규칙은 확장 프로그램을 업데이트해도 바뀌지 않습니다.',
  '',
]

// 프로젝트 폴더 (하위 폴더에서 시작해도 프로젝트 루트). 매번 엔진에서 읽는다.
async function projectDir($: EngineInterface): Promise<string> {
  return (await $.session.root()).replace(/\\/g, '/').replace(/\/+$/, '')
}

async function run($: EngineInterface, args: string[], timeoutMs?: number): Promise<CoreResult> {
  const r = await core($, args, await projectDir($), timeoutMs)
  if (!r.ok) $.ui.log(`orchestra: ${args.join(' ')} 실패: ${r.error}`, { to: 'debug' })
  return r
}

async function show($: EngineInterface, next: Partial<OrchestraView>) {
  await update($, view, now => ({ ...now, steps: [], ...next, isBusy: false }))
  void $.ui.open({ id: PANE, title: TITLE })
}

async function showError($: EngineInterface, r: CoreResult) {
  if (r.isNodeMissing) {
    return show($, {
      stage: 'missing',
      rows: [{ label: 'Node.js', value: '찾지 못함 · 버튼으로 설치하거나 https://nodejs.org 에서 설치', isOk: false }],
      notices: [],
      message: [],
      actions: ['installNode', 'recheck'],
    })
  }
  return show($, { stage: 'error', rows: [], notices: [], message: ['처리하지 못했습니다.', r.error ?? '', '자세한 기록: ~/.claude/orchestra/orchestra.log'], actions: ['recheck'] })
}

// 세션 시작·다시 확인: 아직 안 했으면 설치 화면, 했으면 알릴 것만 보여 준다. isQuiet: 알릴 것이 없으면 패널을 열지 않는다.
async function boot($: EngineInterface, isQuiet: boolean) {
  const r = await run($, ['status'])
  if (!r.ok) return showError($, r)
  const rec = r.check.state.record
  if (!rec) {
    // 프로젝트마다 설정을 고른 사람에게는 새 프로젝트마다 묻지 않는다 (/orch에서 켬).
    if (r.check.state.mode === 'project') return isQuiet ? update($, view, now => ({ ...now, isBusy: false })) : showStatus($, r)
    return startWizard($, r)
  }
  // 규칙 맞추기를 아직 안 했으면 (한 번 미룬 것 포함) 먼저 묻는다.
  if (isTuneWaiting(r)) return showTune($, rec.target, [])
  if (r.notices.length > 0) {
    await showStatus($, r)
    $.ui.toast(`오케스트라: ${r.notices[0]}`)
  } else if (!isQuiet) {
    await showStatus($, r)
  } else {
    await update($, view, now => ({ ...now, isBusy: false }))
  }
}

const toRows = (steps: any[]): StepRow[] =>
  steps.map(s => ({ id: s.id, title: s.title, detail: s.detail ?? '', manual: s.manual ?? null, isOptional: Boolean(s.isOptional), state: s.manual ? 'manual' : 'todo', result: '' }))

// 설치 화면 1/3: 지금 상태와 추가할 것
async function startWizard($: EngineInterface, given?: CoreResult) {
  const r = given?.steps ? given : await run($, ['plan'])
  if (!r.ok) return showError($, r)
  const steps = toRows(r.steps)
  if (steps.length === 0) return show($, CHOOSE)
  const isBlocked = steps.some(s => s.manual !== null && !s.isOptional)
  const hasOptional = steps.some(s => s.isOptional && s.manual === null)
  await show($, {
    stage: 'plan',
    rows: r.rows,
    steps,
    notices: [],
    message: isBlocked
      ? ['"직접 해야 함" 항목을 먼저 해 주세요. 끝나면 [다시 확인]을 누르면 됩니다.']
      : ['고치는 파일은 먼저 백업합니다: ~/.claude/orchestra/backup', 'Codex 항목은 선택입니다. 빼고 설치할 수도 있습니다.'],
    actions: isBlocked ? ['recheck'] : ['startInstall', ...(hasOptional ? ['startInstallNoCodex'] : []), 'cancel'],
  })
}

// 설치 화면 2/3: 단계마다 진행 표시. 선택 단계가 실패하면 건너뛰고 계속, 필수 단계가 실패하면 멈춘다.
async function runInstall($: EngineInterface, skipCodex: boolean) {
  const steps = (await read($, view)).steps.map(s => (skipCodex && s.isOptional ? { ...s, state: 'skipped' as const } : s))
  const setStep = (id: string, patch: Partial<StepRow>) =>
    update($, view, now => ({ ...now, stage: 'installing', isBusy: true, steps: now.steps.map(s => (s.id === id ? { ...s, ...patch } : s)) }))
  await update($, view, now => ({ ...now, stage: 'installing', isBusy: true, steps, message: [], actions: [] }))
  // 앞 단계(Codex 설치)가 실패·건너뜀·직접 해야 함이면 그에 딸린 단계도 건너뛴다.
  const notDone = new Set(steps.filter(s => s.state !== 'todo').map(s => s.id))
  for (const step of steps) {
    if (step.state !== 'todo') continue
    const parent = DEPENDS_ON[step.id]
    if (parent && notDone.has(parent)) {
      notDone.add(step.id)
      await setStep(step.id, { state: 'skipped', result: '앞 단계가 끝나지 않아 건너뜀' })
      continue
    }
    await setStep(step.id, { state: 'running', result: step.id === 'codexLogin' ? '로그인 창에서 로그인을 마쳐 주세요…' : '진행 중…' })
    const r = await run($, ['step', step.id], STEP_TIMEOUT_MS)
    if (!r.ok) notDone.add(step.id)
    await setStep(step.id, { state: r.ok ? 'ok' : 'failed', result: r.ok ? r.message : `${r.error}${step.isOptional ? ' (선택 단계라 건너뜀)' : ''}` })
    if (!r.ok && !step.isOptional) {
      return update($, view, now => ({ ...now, isBusy: false, message: ['필수 단계에서 멈췄습니다. 원인을 해결한 뒤 [다시 확인]을 눌러 주세요.'], actions: ['recheck'] }))
    }
  }
  await show($, { ...CHOOSE, steps: (await read($, view)).steps })
}

// 설치 화면 3/3 → 완료
async function apply($: EngineInterface, scope: 'global' | 'project') {
  const r = await run($, ['apply', scope], STEP_TIMEOUT_MS)
  if (!r.ok) return showError($, r)
  // 연결은 플러그인이 띄운다: 다시 시작 없이 지금 세션에 바로 붙인다.
  const linked = await $.mcp.connect('cco-dispatch').catch(err => ({ isConnected: false, message: String(err) }))
  $.ui.log(`orchestra: 연결 ${linked.isConnected ? '됨' : `안 됨 (${(linked as { message?: string }).message ?? ''})`}`, { to: 'debug' })
  const status = await run($, ['status'])
  const result = [
    ...DONE,
    `규칙 위치: ${r.target}`,
    ...(r.cleaned as string[]).map(line => `정리함: ${line}`),
    ...(r.notes as string[]).map(line => `⚠ ${line}`),
    linked.isConnected ? '✔ 연결했습니다. 바로 쓸 수 있습니다.' : '⚠ 지금 바로 연결하지 못했습니다. Claude를 다시 시작하면 연결됩니다.',
  ]
  // 마지막 단계: 규칙 맞추기 (이미 끝낸 사람은 바로 완료)
  if (status.ok && isTuneWaiting(status)) return showTune($, r.target, result)
  await show($, { stage: 'done', rows: [], notices: status.ok ? status.notices : [], message: result, actions: status.ok ? status.actions : [] })
}

const isTuneWaiting = (r: CoreResult) => r.check?.state?.record && (r.check.state.tune === 'pending' || r.check.state.tune === 'later')

async function showTune($: EngineInterface, target: string, before: string[]) {
  await update($, tuneTarget, () => target)
  await show($, { stage: 'tune', rows: [], notices: [], message: [...before, ...(before.length ? ['', '────────'] : []), ...TUNE_TEXT], actions: ['tuneStart', 'tuneLater'] })
}

// 버튼: 기록 → Claude에게 질문 시작을 맡긴다.
async function tuneStart($: EngineInterface) {
  const r = await run($, ['tune', 'start'])
  if (!r.ok) return showError($, r)
  const target = await read($, tuneTarget)
  await show($, { stage: 'done', rows: [], notices: [], message: ['Claude가 대화창에서 질문을 시작합니다. 답해 주시면 규칙을 고쳐 줍니다.', '', '앞으로도 "오케스트라 규칙에서 ○○ 바꿔줘"라고 말하면 언제든 고칠 수 있습니다.'], actions: [] })
  void $.prompt.submit({ text: tunePrompt(target) }).catch(err => $.ui.log(`orchestra: 규칙 맞추기 요청 실패: ${String(err)}`, { to: 'debug' }))
}

async function tuneLater($: EngineInterface) {
  const r = await run($, ['tune', 'later'])
  if (!r.ok) return showError($, r)
  const message = r.tune === 'later'
    ? ['다음에 Claude를 열 때 한 번 더 물어봅니다.', '언제든 /orch 에서 [지금 규칙 맞추기]를 누르거나, "오케스트라 규칙 맞추자"라고 말하면 됩니다.']
    : ['더는 묻지 않습니다. 언제든 /orch 에서 [지금 규칙 맞추기]를 누르거나, "오케스트라 규칙 맞추자"라고 말하면 됩니다.']
  await show($, { stage: 'done', rows: [], notices: [], message, actions: [] })
}

async function showStatus($: EngineInterface, given?: CoreResult) {
  const r = given ?? (await run($, ['status']))
  if (!r.ok) return showError($, r)
  const rec = r.check.state.record
  const actions = rec
    ? [...r.actions, ...(r.steps.length ? ['install'] : []), 'tuneOpen', 'viewRules', 'reconfigure']
    : ['setupHere', 'chooseGlobal']
  await show($, { stage: 'status', rows: r.rows, notices: r.notices, message: [], actions: [...new Set<string>(actions)] })
}

// 상태 화면의 [규칙 맞추기] 버튼: 끝낸 뒤에도 언제든 다시 할 수 있다.
async function showTuneFromStatus($: EngineInterface) {
  const r = await run($, ['status'])
  if (!r.ok) return showError($, r)
  const target: string | undefined = r.check.state.record?.target
  if (!target) return showStatus($, r)
  return showTune($, target, [])
}

async function sync($: EngineInterface) {
  const r = await run($, ['sync'], STEP_TIMEOUT_MS)
  if (!r.ok) return showError($, r)
  const message = r.isMerged
    ? [`기본 규칙을 ${r.version} 버전으로 갱신했습니다.`, `규칙 위치: ${r.target}`]
    : [
        '규칙을 고친 내용이 있어서 자동으로 바꾸지 않았습니다.',
        `새 기본 규칙은 여기 저장했습니다: ${r.saved}`,
        'Claude에게 "오케스트라 규칙을 새 기본 규칙과 합쳐줘"라고 하면 고친 내용을 살려서 합쳐 줍니다.',
        '합친 뒤 /orch에서 [합치기 끝냄]을 눌러 주세요.',
      ]
  await show($, { stage: 'done', rows: [], notices: [], message, actions: [] })
}

async function simple($: EngineInterface, args: string[], done: string[]) {
  const r = await run($, args, STEP_TIMEOUT_MS)
  if (!r.ok) return showError($, r)
  await show($, { stage: 'done', rows: [], notices: [], message: [r.message ?? '', ...done].filter(Boolean), actions: ['recheck'] })
}

async function viewRules($: EngineInterface) {
  const r = await run($, ['status'])
  if (!r.ok) return showError($, r)
  const target: string | undefined = r.check.state.record?.target
  const text = target && (await $.fs.exists(target)) ? await $.fs.read(target) : ''
  const s = text.indexOf(START_MARK)
  const e = text.indexOf(END_MARK, s)
  const lines = s >= 0 && e > s ? text.slice(s, e + END_MARK.length).split(/\r?\n/) : ['규칙 구간을 찾지 못했습니다. [적용 범위 다시 고르기]로 다시 넣어 주세요.']
  await show($, { stage: 'status', rows: [], notices: [], message: [`파일: ${target ?? '-'}`, '', ...lines], actions: ['reconfigure'] })
}

async function nodeSetup($: EngineInterface) {
  const message = await installNode($)
  await show($, { stage: 'done', rows: [], notices: [], message: [message], actions: [] })
}

// 버튼 키 → 동작 (키 목록은 view.tsx의 ACTION_LABELS)
async function runAction($: EngineInterface, action: string) {
  switch (action) {
    case 'installNode': return nodeSetup($)
    case 'install': return startWizard($)
    case 'startInstall': return runInstall($, false)
    case 'startInstallNoCodex': return runInstall($, true)
    case 'cancel': return show($, { stage: 'done', rows: [], notices: [], message: ['취소했습니다. 나중에 /orch install 로 다시 시작할 수 있습니다.'], actions: [] })
    case 'chooseGlobal': return apply($, 'global')
    case 'chooseProject': return apply($, 'project')
    case 'setupHere': return apply($, 'project')
    case 'sync': return sync($)
    case 'mergeDone': return simple($, ['merge-done'], ['합친 규칙을 새 버전 기준으로 기록했습니다.'])
    case 'cleanExt': return simple($, ['clean-ext'], ['이 프로젝트 CLAUDE.md에서 확장 프로그램이 넣은 기본 규칙을 지웠습니다.'])
    case 'keepExt': return simple($, ['keep-ext'], ['그대로 두고 다시 묻지 않습니다.'])
    case 'fixCodex': return simple($, ['step', 'codexPath'], ['⚠ VS Code를 창만 닫지 말고 완전히 껐다 켜야 적용됩니다.'])
    case 'viewRules': return viewRules($)
    case 'reconfigure': return show($, CHOOSE)
    case 'tuneStart': return tuneStart($)
    case 'tuneLater': return tuneLater($)
    case 'tuneOpen': return showTuneFromStatus($)
    default: return boot($, false)
  }
}

// 버튼: 처리 중 표시 → 실행 → 실패하면 이유를 보여 준다.
const press = ($: EngineInterface) => (action: string) => async () => {
  await update($, view, now => ({ ...now, isBusy: true }))
  try {
    await runAction($, action)
  } catch (err) {
    $.ui.log(`orchestra: ${action} 실패: ${String(err)}`, { to: 'debug' })
    await showError($, { ok: false, error: String(err) })
  }
}

// /orch [install | status | check | apply global | apply project | sync]
async function command($: EngineInterface, args: string) {
  const [cmd, arg] = args.trim().split(/\s+/)
  switch (cmd) {
    case 'install': return startWizard($)
    case 'apply': return arg === 'project' ? apply($, 'project') : apply($, 'global')
    case 'sync': return sync($)
    default: return showStatus($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'orch', description: '오케스트라 상태·설치 (install · status · apply global|project · sync)' })
    // 세션 시작을 늦추지 않도록 확인은 뒤에서 한다.
    void boot($, true).catch(err => $.ui.log(`orchestra: 시작 확인 실패: ${String(err)}`, { to: 'debug' }))
    void startWorkerBoard($).catch(err => $.ui.log(`orchestra: 워커 현황 시작 실패: ${String(err)}`, { to: 'debug' }))
    return next(e)
  })

  on('command.run', { command: 'orch' }, async ($, e) => {
    await update($, view, now => ({ ...now, isBusy: true }))
    void $.ui.open({ id: PANE, title: TITLE })
    void command($, String((e as { args?: string }).args ?? '')).catch(err => showError($, { ok: false, error: String(err) }))
    return { text: '오케스트라 패널을 열었습니다.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => renderPane($, e, await read($, view), press($), await renderWorkerSection($, e)))
  // 진행 중 문구 줄에 "· 워커 N개 진행 중"
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => rewriteSpinner($, e, next))

  // 워커 현황: 입력창 위 띠
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => renderWorkerBoard($, e as never, () => next(e)))
  // VS Code 채팅창: 워커에게 맡긴 줄 아래 (AbovePrompt는 VS Code에 그려지지 않음)
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    return isDispatch(e.props.tool) ? renderDispatchRow($, e as never, row) : row
  })
}
