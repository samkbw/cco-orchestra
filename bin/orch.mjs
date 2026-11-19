#!/usr/bin/env node
// 오케스트라 터미널 명령. Claude 패널도 이 명령을 --json으로 불러 같은 동작을 한다.
import readline from 'node:readline/promises'

import { apply, assertScope, cleanExt, keepExt, mergeDone, sync, tune } from '../lib/apply.mjs'
import { check } from '../lib/check.mjs'
import { DEPENDS_ON, freshPlan, plan, runStep } from '../lib/install.mjs'
import { registerPlugin } from '../lib/plugin.mjs'
import { notices, summarize } from '../lib/status.mjs'
import { isInsideVsCode, isVsCodeRunning, restartVsCode } from '../lib/restart.mjs'
import { withSpinner } from '../lib/spinner.mjs'
import { backupDir, log, logFile } from '../lib/sys.mjs'

// 사람이 직접 로그인하는 단계: 움직이는 표시 대신 안내
const LOGIN_STEPS = new Set(['claudeLogin', 'codexLogin'])

const HELP = `오케스트라 (Claude Code Orchestrator 전용 설정)

사용법: orch <명령> [옵션]

  install            전체 설치: 확인 → 빠진 것 설치 → 범위 적용 → Claude 플러그인 등록
  check              확인만 (아무것도 바꾸지 않음)
  status             상태와 알림 보기
  apply <global|project>   범위 적용 (global: 모든 프로젝트, project: 이 프로젝트)
  sync               확장 프로그램 업데이트 뒤 기본 규칙 갱신
  merge-done         고친 규칙을 새 기본 규칙과 직접 합친 뒤 실행
  clean-ext          이 프로젝트 CLAUDE.md에서 확장 프로그램이 넣은 규칙 지우기
  keep-ext           위 규칙을 그대로 두고 다시 묻지 않기
  step <id>          설치 단계 하나만 실행 (ext, server, codex, codexPath, codexLogin, worker)

옵션
  --yes              묻지 않고 진행 (install의 범위는 --scope로, 없으면 global)
  --scope <global|project>
  --skip-codex       Codex 관련 단계(선택)를 건너뜀
  --no-plugin        Claude 플러그인 등록을 건너뜀
  --cwd <폴더>       기준 폴더 (기본: 지금 폴더)
  --json             결과를 JSON으로 출력 (Claude 패널용)

기록: ${logFile}
백업: ${backupDir}`

const DONE = [
  '🎼 오케스트라 설정이 끝났습니다',
  '',
  '이제 Claude가 큰 일을 여러 AI(워커)에게 나눠 맡기고, 결과를 모아서 확인합니다.',
  '',
  '지금은 확장 프로그램을 만든 사람이 정한 기본 규칙이 그대로 들어가 있습니다.',
  '사람마다 일하는 방식이 다르니, 한 번 읽어 보고 내 방식에 맞게 고쳐 주세요.',
  '',
  '- 규칙 보기: Claude에서 /orch',
  '- 규칙 고치기: Claude에게 말로 하면 됩니다. 예) "오케스트라 규칙에서 작은 일은 직접 하게 바꿔줘"',
  '',
  '고친 규칙은 확장 프로그램을 업데이트해도 바뀌지 않습니다.',
  '',
  // hooks/tune.ts의 EXT_DETAIL과 같게 유지
  '워커 계정 추가·기본 모델·동시에 돌릴 개수·시간 제한 같은 세부 설정은',
  'VS Code 왼쪽의 Claude Code Orchestrator 화면(톱니바퀴: 설정)에서 내 환경에 맞게 조정해 주세요.',
]

// 가장 중요한 안내: 확장 프로그램의 프로젝트별 등록 알림 (hooks/tune.ts의 EXT_NOTICE와 같게 유지)
const EXT_NOTICE_BOX = `
  ╔══════════════════════════════════════════════════════════════════════╗
    ⚠ 중요 · 꼭 읽어 주세요
    VS Code에 "…MCP server is not registered in this workspace.
    Register it…?" 알림이 뜨면 반드시 [Not in this workspace]를 누르세요.

    [Register]를 누르면 연결이 두 번 겹치고 프로젝트에 파일이 생깁니다.
    오케스트라가 이미 모든 프로젝트에 연결해 두었습니다.
    (새 프로젝트를 처음 열 때마다 한 번씩 뜹니다)
  ╚══════════════════════════════════════════════════════════════════════╝`

const CHOOSE = `🎼 오케스트라를 어디에 적용할까요?

  1. 모든 프로젝트에 적용 (추천)
     한 번만 설정하면 어느 폴더에서 Claude를 쓰든 오케스트라가 동작합니다.
     👉 처음 쓰는 분, 설정을 신경 쓰고 싶지 않은 분께 맞아요.

  2. 프로젝트마다 따로 설정
     필요한 프로젝트에서만 켜고, 프로젝트마다 규칙을 다르게 둘 수 있습니다.
     👉 프로젝트별로 일하는 방식을 다르게 관리하고 싶은 분(주로 개발자)께 맞아요.
`

function parse(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--json') opts.json = true
    else if (a === '--skip-codex') opts.skipCodex = true
    else if (a === '--no-plugin') opts.noPlugin = true
    else if (a === '--scope') opts.scope = argv[++i]
    else if (a === '--cwd') opts.cwd = argv[++i]
    else opts._.push(a)
  }
  return opts
}

const printRows = rows => rows.forEach(r => console.log(`  ${r.isOk ? '✔' : '✖'} ${r.label}  ${r.value}`))

async function ask(rl, question) {
  return (await rl.question(question)).trim()
}

async function install(opts) {
  const cwd = opts.cwd ?? process.cwd()
  if (opts.scope !== undefined) assertScope(opts.scope)
  const rl = opts.yes ? null : readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const { check: c, steps: all } = await withSpinner('지금 PC 상태를 확인하는 중', () => freshPlan(cwd))
    const steps = opts.skipCodex ? all.filter(s => !s.isOptional) : all
    console.log('\n지금 PC 상태\n')
    printRows(summarize({ ...c, mcp: null }))
    console.log('\n추가할 것 (이미 있는 것은 건드리지 않습니다)\n')
    if (steps.length === 0) console.log('  없음')
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}${s.manual ? '  ← 직접 해야 함' : ''}\n     ${s.manual ?? s.detail ?? ''}`))
    console.log(`\n고치는 파일은 먼저 백업합니다: ${backupDir}\n`)
    const blocking = steps.filter(s => s.manual && !s.isOptional)
    if (blocking.length) {
      console.log('위에서 "직접 해야 함" 항목을 먼저 해 주세요. 끝나면 다시 실행하면 됩니다.')
      return 1
    }
    if (rl && !/^y(es)?$|^네$|^응$/i.test(await ask(rl, '진행할까요? (y/N) '))) {
      console.log('취소했습니다.')
      return 0
    }
    const failed = new Set(steps.filter(x => x.manual).map(x => x.id))
    for (const s of steps.filter(x => !x.manual)) {
      process.stdout.write(`\n▶ ${s.title}\n`)
      if (DEPENDS_ON[s.id] && failed.has(DEPENDS_ON[s.id])) {
        failed.add(s.id)
        console.log('  – 앞 단계가 끝나지 않아 건너뜁니다')
        continue
      }
      try {
        // 로그인 화면은 --yes여도 터미널에 보여 준다. 로그인은 사람이 하므로 움직이는 표시 대신 안내를 띄운다.
        const isLogin = LOGIN_STEPS.has(s.id)
        if (isLogin) console.log('  로그인 창(브라우저)이 열립니다. 로그인을 마치면 자동으로 다음으로 넘어갑니다.')
        const message = isLogin ? await runStep(s.id, { isInteractive: true }) : await withSpinner(`${s.title} 진행 중`, () => runStep(s.id, { isInteractive: true }))
        console.log(`  ✔ ${message}`)
      } catch (err) {
        failed.add(s.id)
        console.log(`  ✖ ${err.message}`)
        if (!s.isOptional) return 1
        console.log('  (선택 단계라 건너뛰고 계속합니다)')
      }
    }
    let scope = opts.scope
    if (!scope) {
      if (rl) {
        console.log(`\n${CHOOSE}`)
        scope = (await ask(rl, '번호를 고르세요 (1/2, 기본 1) ')) === '2' ? 'project' : 'global'
      } else scope = 'global'
    }
    const done = await withSpinner('규칙과 연결을 적용하는 중', () => apply(scope, cwd))
    if (!opts.noPlugin) {
      const p = await withSpinner('Claude 플러그인을 등록하는 중 (처음엔 1분쯤 걸릴 수 있음)', () => registerPlugin())
      console.log(p === 'already' ? '\n✔ Claude 플러그인은 이미 설치돼 있습니다.' : '\n✔ Claude 플러그인을 설치했습니다.')
    }
    console.log(`\n${DONE.join('\n')}\n`)
    console.log(`규칙 위치: ${done.target}`)
    done.cleaned.forEach(line => console.log(`정리함: ${line}`))
    done.notes.forEach(line => console.log(`⚠ ${line}`))
    if (opts.noPlugin) {
      console.log('⚠ 연결은 오케스트라 플러그인이 합니다. Claude 입력창에서 /plugin install orchestra --marketplace samkbw/cco-orchestra 로 설치해 주세요.')
      console.log(EXT_NOTICE_BOX)
      return 0
    }
    console.log('\n👉 마지막 단계: Claude를 열면 "규칙 맞추기" 화면이 뜹니다. [지금 규칙 맞추기]를 눌러 내 방식에 맞게 규칙을 정해 주세요.')
    await offerRestart(rl)
    // 창을 닫기 전 마지막으로 보이는 곳에 둔다.
    console.log(EXT_NOTICE_BOX)
    return 0
  } finally {
    rl?.close()
  }
}

// 열려 있는 VS Code는 다시 시작해야 새 플러그인·연결을 읽는다. 한 번 묻고 다시 시작한다.
async function offerRestart(rl) {
  if (!(await withSpinner('열려 있는 VS Code를 확인하는 중', () => isVsCodeRunning()))) {
    console.log('\n✔ VS Code를 열면 바로 연결됩니다.')
    return
  }
  if (isInsideVsCode()) {
    console.log('\n⚠ 이 설치는 VS Code 안에서 실행 중이라 직접 다시 시작할 수 없습니다. VS Code를 껐다 켜 주세요.')
    return
  }
  console.log('\n열려 있는 VS Code를 다시 시작해야 오케스트라가 연결됩니다. (VS Code와 Claude를 닫았다가 다시 엽니다)')
  console.log('  · 저장하지 않은 파일과 열려 있던 창은 VS Code가 그대로 다시 열어 줍니다.')
  console.log('  · 진행 중인 Claude 대화는 끊깁니다. 다시 열면 대화 기록에서 이어서 할 수 있습니다.')
  const answer = rl ? await ask(rl, '지금 다시 시작할까요? (Y/n) ') : 'n'
  if (/^n(o)?$|^아니/i.test(answer)) {
    console.log('다시 시작하지 않았습니다. 나중에 VS Code를 껐다 켜면 연결됩니다.')
    return
  }
  const result = await withSpinner('VS Code를 다시 시작하는 중', () => restartVsCode())
  console.log({
    restarted: '✔ VS Code와 Claude를 다시 열었습니다. 오케스트라가 연결되어 있고, Claude에 "규칙 맞추기" 화면이 뜹니다.',
    closeTimeout: '⚠ VS Code가 닫히지 않았습니다 (저장 여부를 묻는 창이 떠 있을 수 있음). VS Code를 직접 껐다 켜 주세요.',
    openFailed: '⚠ VS Code를 닫았지만 다시 열지 못했습니다. VS Code를 직접 열어 주세요. 열면 오케스트라가 연결되어 있습니다.',
  }[result])
}


async function main() {
  const opts = parse(process.argv.slice(2))
  const [cmd, arg] = opts._
  const cwd = opts.cwd ?? process.cwd()
  const out = (value, text) => {
    if (opts.json) console.log(JSON.stringify({ ok: true, ...value }))
    else if (text) console.log(text)
    return 0
  }
  switch (cmd) {
    case 'install':
      return install(opts)
    case 'check':
    case 'plan': {
      const { check: c, steps } = freshPlan(cwd)
      if (!opts.json) {
        printRows(summarize({ ...c, mcp: null }))
        console.log(steps.length ? `\n빠진 것: ${steps.map(s => s.title).join(', ')}` : '\n빠진 것 없음')
      }
      return out({ check: c, steps, rows: summarize({ ...c, mcp: null }) })
    }
    case 'status': {
      const c = check({ cwd })
      const n = notices(c)
      if (!opts.json) {
        printRows(summarize(c))
        n.list.forEach(line => console.log(`⚠ ${line}`))
      }
      return out({ check: c, rows: summarize(c), notices: n.list, actions: n.actions, steps: plan(c) })
    }
    case 'step':
      return out({ message: await runStep(arg, { isInteractive: !opts.json }) }, '완료')
    case 'apply': {
      const r = await apply(arg, cwd)
      return out(r, ['적용했습니다.', `규칙 위치: ${r.target}`, ...r.cleaned.map(x => `정리함: ${x}`), ...r.notes.map(x => `⚠ ${x}`)].join('\n'))
    }
    case 'sync': {
      const r = await sync(cwd)
      return out(r, r.isMerged ? `기본 규칙을 ${r.version}으로 갱신했습니다.` : `고친 규칙이 있어 새 기본 규칙을 따로 저장했습니다: ${r.saved}`)
    }
    case 'tune':
      return out(tune(arg), arg === 'start' ? '규칙 맞추기를 시작으로 기록했습니다.' : '다음에 다시 묻습니다.')
    case 'merge-done':
      return out({ changed: mergeDone(cwd) }, '기록했습니다.')
    case 'clean-ext':
      return out(cleanExt(cwd), '정리했습니다.')
    case 'keep-ext':
      keepExt(cwd)
      return out({}, '그대로 둡니다.')
    default:
      console.log(HELP)
      return cmd && cmd !== 'help' && cmd !== '--help' ? 1 : 0
  }
}

// process.exit 대신 exitCode: 큰 JSON 출력이 파이프에서 잘리지 않게
main()
  .then(code => {
    process.exitCode = code
  })
  .catch(err => {
    log(`오류: ${process.argv.slice(2).join(' ')}: ${err?.message ?? err}`)
    if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: err?.message ?? String(err) }))
    else console.error(`✖ ${err?.message ?? err}\n자세한 기록: ${logFile}`)
    process.exitCode = 1
  })
