// auto-clean-ext / is-global 판단: 임시 홈 폴더와 임시 git 저장소로 실제 CLI를 돌려 확인한다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'orch.mjs')
const EXT = '<!-- claude-code-orchestrator:policy:start -->\n# Dispatch policy\n<!-- claude-code-orchestrator:policy:end -->'
const OURS = '<!-- orchestra:rules:start -->\n규칙\n<!-- orchestra:rules:end -->'
const norm = dir => dir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_m, d) => `${d.toLowerCase()}:`).replace(/\/+$/, '')

function setup({ mode = 'global', globalRules = true, keep = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-ac-'))
  const home = path.join(base, 'home')
  const proj = path.join(base, 'proj')
  fs.mkdirSync(path.join(home, '.claude', 'orchestra'), { recursive: true })
  fs.mkdirSync(path.join(proj, 'sub'), { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: proj })
  const root = norm(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: proj, encoding: 'utf8' }).stdout.trim())
  const globalMd = `${norm(home)}/.claude/CLAUDE.md`
  fs.writeFileSync(globalMd, globalRules ? `# 전역\n\n${OURS}\n` : '# 전역\n')
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), `# 내 규칙\n\n${EXT}\n\n# 끝\n`)
  const state = { mode, records: { [mode === 'global' ? 'global' : `project:${root}`]: { scope: mode, target: globalMd } }, keepExt: keep ? { [root]: true } : {} }
  fs.writeFileSync(path.join(home, '.claude', 'orchestra', 'state.json'), JSON.stringify(state))
  return { home, proj }
}

function cli(home, cwd, cmd) {
  const env = { ...process.env, USERPROFILE: home, HOME: home }
  const out = spawnSync(process.execPath, [CLI, cmd, '--json', '--cwd', cwd], { env, encoding: 'utf8' })
  return JSON.parse(out.stdout.trim().split(/\r?\n/).filter(line => line.startsWith('{')).pop())
}

const projMd = proj => fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8')

test('전역 사용자 + 전역 규칙 있음: 확장 구간만 지운다 (내 규칙은 그대로)', () => {
  const { home, proj } = setup()
  assert.equal(cli(home, proj, 'auto-clean-ext').action, 'cleaned')
  assert.ok(!projMd(proj).includes('claude-code-orchestrator:policy'))
  assert.ok(projMd(proj).includes('# 내 규칙') && projMd(proj).includes('# 끝'))
})

test('하위 폴더에서 시작해도 프로젝트 루트의 CLAUDE.md를 본다', () => {
  const { home, proj } = setup()
  const r = cli(home, path.join(proj, 'sub'), 'auto-clean-ext')
  assert.equal(r.action, 'cleaned')
  assert.ok(!projMd(proj).includes('claude-code-orchestrator:policy'))
})

test('[그대로 두기] 프로젝트는 하위 폴더에서 시작해도 지우지 않는다', () => {
  const { home, proj } = setup({ keep: true })
  assert.equal(cli(home, path.join(proj, 'sub'), 'auto-clean-ext').action, 'keep')
  assert.ok(projMd(proj).includes('claude-code-orchestrator:policy'))
})

test('프로젝트 설정자는 지우지 않는다', () => {
  const { home, proj } = setup({ mode: 'project' })
  assert.equal(cli(home, proj, 'auto-clean-ext').action, 'project')
  assert.ok(projMd(proj).includes('claude-code-orchestrator:policy'))
})

test('전역 규칙을 직접 지웠으면 프로젝트 쪽도 지우지 않는다 (규칙이 어디에도 없게 되지 않게)', () => {
  const { home, proj } = setup({ globalRules: false })
  assert.equal(cli(home, proj, 'auto-clean-ext').action, 'noGlobal')
  assert.ok(projMd(proj).includes('claude-code-orchestrator:policy'))
})

test('is-global: 전역 사용자만 true, 기록이 깨졌으면 false', () => {
  assert.equal(cli(setup().home, os.tmpdir(), 'is-global').isGlobal, true)
  assert.equal(cli(setup({ mode: 'project' }).home, os.tmpdir(), 'is-global').isGlobal, false)
  const { home } = setup()
  fs.writeFileSync(path.join(home, '.claude', 'orchestra', 'state.json'), '{깨짐')
  assert.equal(cli(home, os.tmpdir(), 'is-global').isGlobal, false)
})
