import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CheckRow, OrchestraView } from '../types'
import { addServer, serverStatus } from './connect'
import type { Scope } from './connect'
import { addCodexPath, codexLogin, detectEnv, probeCodex } from './env'
import type { Env } from './env'
import { logPath, timed, writeLog } from './log'
import { findBlock, hashText, hasExtBlock, readBasePolicy, readText, removeExtBlock, toBlock, upsertBlock } from './rules'
import { renderPane } from './view'

const PANE = 'orchestra'
const TITLE = '🎼 오케스트라'

// 적용 기록 ($.store): 'global' 또는 'project:<폴더>'
type Applied = { scope: Scope; target: string; version: string; hash: string; at: string }

const EMPTY: OrchestraView = { stage: 'loading', rows: [], notices: [], actions: [], message: [], isBusy: false }
const view = atom({ plugin: 'orchestra', key: 'view' } as const, EMPTY, { shape: 'view-1' })

let env: Env | null = null
let cwd = '.'

const projectKey = () => `project:${cwd.replace(/\\/g, '/')}`
const projectRules = () => `${cwd.replace(/\\/g, '/')}/CLAUDE.md`

async function applied($: EngineInterface): Promise<Applied | null> {
  const project = (await $.store.get(projectKey())) as Applied | undefined
  const global = (await $.store.get('global')) as Applied | undefined
  return project ?? global ?? null
}

async function show($: EngineInterface, next: Partial<OrchestraView>) {
  await update($, view, now => ({ ...now, isBusy: false, ...next }))
  void $.ui.open({ id: PANE, title: TITLE })
}

// 꼭 필요한 준비물 (Codex는 선택이라 막지 않는다)
function prerequisiteRows(found: Env | null): CheckRow[] {
  return [
    { label: 'Node.js', value: found ? '있음' : '설치 필요: https://nodejs.org 에서 설치 후 Claude 다시 시작', isOk: found !== null },
    {
      label: 'Claude Code Orchestrator 확장',
      value: found?.extVersion ? `설치됨 (${found.extVersion})` : 'VS Code 확장에서 "Claude Code Orchestrator"를 설치해 주세요',
      isOk: Boolean(found?.extVersion),
    },
    {
      label: '연결 서버',
      value: found?.hasServer ? '있음' : '확장 설치 후 VS Code를 한 번 열면 자동으로 만들어집니다',
      isOk: Boolean(found?.hasServer),
    },
  ]
}

function codexRow(found: Env, login?: string): CheckRow {
  const c = found.codex
  if (!c.isInstalled) return { label: 'Codex (선택)', value: '설치 안 됨 · 쓰려면 npm i -g @openai/codex 후 codex login', isOk: false }
  if (!c.isFound) return { label: 'Codex (선택)', value: '설치됐지만 오케스트라가 찾지 못함 · 아래 버튼으로 해결', isOk: false }
  return { label: 'Codex (선택)', value: login ?? '사용 가능', isOk: login === undefined || !/안 됨|불가/.test(login) }
}

// 세션 시작·다시 확인 때: 준비물 → 적용 여부 → 알림 순서로 본다.
async function boot($: EngineInterface, isQuiet: boolean) {
  env = await timed($, null, '환경 확인', () => detectEnv($)).catch(() => null)
  const home = env?.home ?? null
  const rows = prerequisiteRows(env)
  if (!env || rows.some(row => !row.isOk)) {
    await writeLog($, home, `준비물 부족: ${rows.filter(row => !row.isOk).map(row => row.label).join(', ')}`)
    await show($, { stage: 'missing', rows, notices: [], message: [], actions: ['recheck'] })
    return
  }
  const rec = await applied($)
  if (!rec) {
    // 프로젝트마다 설정을 고른 사람에게는 새 프로젝트마다 묻지 않는다 (/orch에서 켬).
    if ((await $.store.get('mode')) === 'project') return
    await show($, { stage: 'choose', rows: [], notices: [], message: [], actions: ['chooseGlobal', 'chooseProject'] })
    return
  }
  const notices = await noticesFor($, rec)
  if (notices.list.length > 0) {
    await show($, { stage: 'status', rows: [], notices: notices.list, message: [], actions: notices.actions })
    $.ui.toast(`오케스트라: ${notices.list[0]}`)
  } else if (!isQuiet) {
    await showStatus($)
  }
}

async function noticesFor($: EngineInterface, rec: Applied): Promise<{ list: string[]; actions: string[] }> {
  const list: string[] = []
  const actions: string[] = []
  if (env?.extVersion && rec.version !== env.extVersion) {
    list.push(`확장 프로그램이 ${rec.version} → ${env.extVersion}로 바뀌었습니다. 기본 규칙을 갱신해 주세요.`)
    actions.push('sync')
  }
  const keep = await $.store.get(`keepExt:${cwd.replace(/\\/g, '/')}`)
  if (rec.scope === 'global' && !keep && hasExtBlock(await readText($, projectRules()))) {
    list.push('이 프로젝트 CLAUDE.md에 확장 프로그램이 넣은 기본 규칙이 있어 전역 규칙과 겹칩니다.')
    actions.push('cleanExt', 'keepExt')
  }
  if (env && env.codex.isInstalled && !env.codex.isFound && env.codex.fixDir) {
    list.push('Codex가 설치돼 있지만 오케스트라가 찾지 못합니다.')
    actions.push('fixCodex')
  }
  return { list, actions }
}

async function showStatus($: EngineInterface) {
  if (!env) return boot($, false)
  const rec = await applied($)
  const link = await serverStatus($, cwd)
  env = { ...env, codex: await probeCodex($, env.node) }
  const login = env.codex.isFound ? await codexLogin($) : undefined
  const rows: CheckRow[] = [
    { label: '적용 범위', value: rec ? (rec.scope === 'global' ? '모든 프로젝트' : '이 프로젝트') : '아직 설정 안 됨', isOk: rec !== null },
    { label: '규칙 파일', value: rec?.target ?? '-', isOk: rec !== null },
    {
      label: '기본 규칙 버전',
      value: rec ? `${rec.version}${env.extVersion && env.extVersion !== rec.version ? ` (설치된 확장 ${env.extVersion} · 갱신 필요)` : ''}` : '-',
      isOk: rec !== null && rec.version === env.extVersion,
    },
    { label: '연결 (cco-dispatch)', value: link.text, isOk: link.isOk },
    codexRow(env, login),
    { label: '기록', value: logPath(env.home), isOk: true },
  ]
  const notices = rec ? await noticesFor($, rec) : { list: [], actions: [] }
  const actions = rec ? [...notices.actions, 'viewRules', 'reconfigure'] : ['setupHere', 'chooseGlobal']
  await show($, { stage: 'status', rows, notices: notices.list, message: [], actions: [...new Set(actions)] })
}

function doneMessage(scope: Scope, target: string): string[] {
  return [
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
    `규칙 위치: ${target}`,
    scope === 'global'
      ? '⚠ Claude를 다시 시작하면 연결이 적용됩니다.'
      : '⚠ Claude를 다시 시작하면 연결이 적용됩니다. 시작할 때 cco-dispatch 사용을 물으면 허용해 주세요.',
  ]
}

// 고른 범위에 기본 규칙과 연결을 넣는다.
async function apply($: EngineInterface, scope: Scope) {
  if (!env?.extDir || !env.extVersion) return boot($, false)
  const found = env
  const target = scope === 'global' ? `${found.home}/.claude/CLAUDE.md` : projectRules()
  await timed($, found.home, `설정 적용(${scope === 'global' ? '모든 프로젝트' : cwd})`, async () => {
    const block = toBlock(await readBasePolicy($, found.node, found.extDir!), found.extVersion!)
    await $.fs.write(target, upsertBlock(await readText($, target), block))
    await addServer($, scope, found.node, found.serverJs, cwd)
    const rec: Applied = { scope, target, version: found.extVersion!, hash: hashText(block), at: new Date().toISOString() }
    await $.store.set(scope === 'global' ? 'global' : projectKey(), rec)
    await $.store.set('mode', scope)
  })
  const rec = (await applied($))!
  const notices = await noticesFor($, rec)
  await show($, { stage: 'done', rows: [], notices: notices.list, message: doneMessage(scope, target), actions: notices.actions })
}

// 기본 규칙 갱신: 고치지 않았으면 바꾸고, 고쳤으면 새 규칙을 따로 저장하고 알린다.
async function sync($: EngineInterface) {
  const rec = await applied($)
  if (!rec || !env?.extDir || !env.extVersion) return boot($, false)
  const found = env
  const key = rec.scope === 'global' ? 'global' : projectKey()
  const message = await timed($, found.home, `기본 규칙 갱신 ${rec.version} → ${found.extVersion}`, async () => {
    const block = toBlock(await readBasePolicy($, found.node, found.extDir!), found.extVersion!)
    const text = await readText($, rec.target)
    const current = findBlock(text)
    if (current === null || hashText(current) === rec.hash) {
      await $.fs.write(rec.target, upsertBlock(text, block))
      await $.store.set(key, { ...rec, version: found.extVersion!, hash: hashText(block), at: new Date().toISOString() })
      return [`기본 규칙을 ${found.extVersion} 버전으로 갱신했습니다.`, `규칙 위치: ${rec.target}`]
    }
    const saved = `${found.home}/.claude/orchestra/기본규칙-${found.extVersion}.md`
    await $.fs.write(saved, `${block}\n`)
    await $.store.set(key, { ...rec, version: found.extVersion! })
    return [
      '규칙을 고친 내용이 있어서 자동으로 바꾸지 않았습니다.',
      `새 기본 규칙은 여기 저장했습니다: ${saved}`,
      'Claude에게 "오케스트라 규칙을 새 기본 규칙과 합쳐줘"라고 하면 고친 내용을 살려서 합쳐 줍니다.',
    ]
  })
  await show($, { stage: 'done', rows: [], notices: [], message, actions: [] })
}

async function cleanExt($: EngineInterface) {
  const path = projectRules()
  await timed($, env?.home ?? null, `프로젝트 확장 규칙 삭제(${path})`, async () => {
    await $.fs.write(path, removeExtBlock(await readText($, path)))
  })
  await show($, { stage: 'done', rows: [], notices: [], message: ['이 프로젝트 CLAUDE.md에서 확장 프로그램이 넣은 기본 규칙을 지웠습니다.', `파일: ${path}`], actions: [] })
}

async function viewRules($: EngineInterface) {
  const rec = await applied($)
  const block = rec ? findBlock(await readText($, rec.target)) : null
  const lines = block ? block.split(/\r?\n/) : ['규칙 구간을 찾지 못했습니다. "적용 범위 다시 고르기"로 다시 넣어 주세요.']
  await show($, { stage: 'status', rows: [], notices: [], message: [`파일: ${rec?.target ?? '-'}`, '', ...lines], actions: ['reconfigure'] })
}

async function fixCodex($: EngineInterface) {
  const dir = env?.codex.fixDir
  if (!dir) return showStatus($)
  await timed($, env?.home ?? null, `Codex PATH 추가(${dir})`, () => addCodexPath($, dir))
  await show($, {
    stage: 'done',
    rows: [],
    notices: [],
    message: ['Codex를 찾을 수 있게 PATH에 추가했습니다.', '⚠ VS Code를 창만 닫지 말고 완전히 껐다 켜야 적용됩니다.'],
    actions: [],
  })
}

async function keepExt($: EngineInterface) {
  await $.store.set(`keepExt:${cwd.replace(/\\/g, '/')}`, true)
  await writeLog($, env?.home ?? null, `프로젝트 확장 규칙 유지(${cwd})`)
  await showStatus($)
}

// 버튼 키 → 동작 (키 목록은 view.tsx의 ACTION_LABELS)
async function runAction($: EngineInterface, action: string) {
  switch (action) {
    case 'chooseGlobal': return apply($, 'global')
    case 'chooseProject': return apply($, 'project')
    case 'setupHere': return apply($, 'project')
    case 'sync': return sync($)
    case 'cleanExt': return cleanExt($)
    case 'keepExt': return keepExt($)
    case 'fixCodex': return fixCodex($)
    case 'viewRules': return viewRules($)
    case 'reconfigure': return show($, { stage: 'choose', rows: [], notices: [], message: [], actions: ['chooseGlobal', 'chooseProject'] })
    default: return boot($, false)
  }
}

// 버튼: 처리 중 표시 → 실행 → 실패하면 이유와 기록 위치를 보여 준다.
const press = ($: EngineInterface) => (action: string) => async () => {
  await update($, view, now => ({ ...now, isBusy: true }))
  try {
    await runAction($, action)
  } catch (err) {
    await writeLog($, env?.home ?? null, `오류: ${action} 실패: ${String(err)}`)
    await show($, {
      stage: 'error',
      rows: [],
      notices: [],
      message: ['처리하지 못했습니다.', String(err), env ? `자세한 기록: ${logPath(env.home)}` : ''],
      actions: ['recheck'],
    })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'orch', description: '오케스트라 상태 보기·설정' })
    // 세션 시작을 늦추지 않도록 확인은 뒤에서 한다.
    void boot($, true).catch(err => writeLog($, env?.home ?? null, `오류: 시작 확인 실패: ${String(err)}`))
    return next(e)
  })

  on('command.run', { command: 'orch' }, async $ => {
    await update($, view, now => ({ ...now, isBusy: true }))
    void $.ui.open({ id: PANE, title: TITLE })
    await showStatus($).catch(err => show($, { stage: 'error', rows: [], notices: [], message: ['상태를 확인하지 못했습니다.', String(err)], actions: ['recheck'] }))
    return { text: '오케스트라 패널을 열었습니다.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => renderPane($, e, await read($, view), press($)))
}
