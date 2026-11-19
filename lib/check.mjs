// 확인만 한다 (아무것도 바꾸지 않음): 이 PC에 무엇이 있고 무엇이 빠졌는지
import fs from 'node:fs'
import path from 'node:path'

import { hasExtBlock, readBasePolicy } from './rules.mjs'
import { firstLine, has, home, isWindows, normDir, projectRoot, readState, readText, registryFile, run, serverJs } from './sys.mjs'

export const EXT_ID = 'toragonite.claude-code-orchestrator'
const EXT_ROOTS = ['.vscode/extensions', '.vscode-insiders/extensions', '.cursor/extensions']
export const NODE_MIN_MAJOR = 18

const cmp = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

// 설치된 확장 프로그램 중 가장 높은 버전 (규칙을 꺼낼 수 있는 폴더만)
export function findExtension() {
  let best = null
  for (const root of EXT_ROOTS) {
    const dir = `${home}/${root}`
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const m = new RegExp(`^${EXT_ID.replace(/\./g, '\\.')}-(\\d+\\.\\d+\\.\\d+)`).exec(name)
      if (!m || !fs.existsSync(`${dir}/${name}/out/prompts.js`)) continue
      if (!best || cmp(m[1], best.version) > 0) best = { dir: `${dir}/${name}`, version: m[1] }
    }
  }
  return best
}

// orchestrator가 찾는 방식(Windows는 PATH의 codex.exe)으로 codex를 찾고, npm 설치면 codex.exe 폴더도 찾는다.
export function findCodex() {
  const exe = isWindows ? 'codex.exe' : 'codex'
  const isFile = f => {
    try {
      return fs.statSync(f).isFile()
    } catch {
      return false
    }
  }
  const isFound = (process.env.PATH ?? '').split(path.delimiter).some(d => d && isFile(path.join(d, exe)))
  let fixDir = null
  let viaNpm = false
  if (isWindows) {
    const npmDir = path.join(process.env.APPDATA ?? '', 'npm')
    viaNpm = isFile(path.join(npmDir, 'codex.cmd'))
    // npm 버전에 따라 node_modules/codex-win32-* 또는 node_modules/@openai/codex-win32-* 에 있다.
    const base = path.join(npmDir, 'node_modules', '@openai', 'codex', 'node_modules')
    for (const parent of [base, path.join(base, '@openai')]) {
      let names = []
      try {
        names = fs.readdirSync(parent)
      } catch {
        continue
      }
      for (const d of names.filter(n => n.startsWith('codex-win32'))) {
        let targets = []
        try {
          targets = fs.readdirSync(path.join(parent, d, 'vendor'))
        } catch {
          continue
        }
        for (const t of targets) {
          const bin = path.join(parent, d, 'vendor', t, 'bin')
          if (isFile(path.join(bin, 'codex.exe'))) fixDir = bin
        }
      }
    }
  }
  const isInstalled = isFound || viaNpm || fixDir !== null || has('codex')
  return { isInstalled, isFound, fixDir: isFound ? null : fixDir }
}

export function codexLoggedIn() {
  const out = run('codex', ['login', 'status'], { timeoutMs: 20000 })
  return { isLoggedIn: out.code === 0 && /logged in/i.test(out.stdout + out.stderr), text: `${out.stdout}${out.stderr}`.trim().split(/\r?\n/)[0] ?? '' }
}

// 없으면 null, 있는데 읽지 못하면 오류 (없다고 잘못 안내하지 않게)
export function readRegistry() {
  if (!fs.existsSync(registryFile)) return null
  const text = fs.readFileSync(registryFile, 'utf8').replace(/^﻿/, '')
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`워커 목록 파일을 읽지 못함 (${registryFile}): ${err.message}`)
  }
}

const list = value => (Array.isArray(value) ? value : [])
export const codexWorkers = reg => list(reg?.vendorWorkers).filter(w => w?.provider === 'codex')

// 연결 상태: 실제로 적용 중인 범위(where)와 연결 여부
export function mcpStatus(cwd) {
  const out = run('claude', ['mcp', 'get', 'cco-dispatch'], { cwd, timeoutMs: 40000 })
  if (out.code !== 0) return { isRegistered: false, isConnected: false, where: '', command: '' }
  const pick = re => re.exec(out.stdout)?.[1]?.trim() ?? ''
  return {
    isRegistered: true,
    isConnected: /Connected/i.test(pick(/Status:\s*(.+)/)),
    where: pick(/Scope:\s*(.+)/),
    command: `${pick(/Command:\s*(.+)/)} ${pick(/Args:\s*(.+)/)}`.trim(),
  }
}

// 지금 폴더 기준으로 적용 기록: 마지막으로 고른 범위(mode)를 따른다.
export function appliedRecord(state, root) {
  const project = state.records?.[`project:${normDir(root)}`]
  return state.mode === 'project' ? project ?? null : state.records?.global ?? null
}

export function check({ cwd = process.cwd(), withMcp = true, withLogin = true } = {}) {
  const root = projectRoot(cwd)
  const nodeMajor = Number(process.versions.node.split('.')[0])
  const ext = findExtension()
  const codex = findCodex()
  let reg = null
  let registryError = null
  try {
    reg = readRegistry()
  } catch (err) {
    registryError = err.message
  }
  const state = readState()
  const rec = appliedRecord(state, root)
  let precedenceOk = null
  let policyError = null
  if (ext) {
    try {
      precedenceOk = /\n## Precedence\n/.test(readBasePolicy(ext.dir))
    } catch (err) {
      policyError = firstLine(err?.message ?? err)
    }
  }
  return {
    root,
    node: { version: process.versions.node, isOk: nodeMajor >= NODE_MIN_MAJOR },
    vscode: { hasCli: has('code') },
    ext: ext ? { version: ext.version, dir: ext.dir } : null,
    server: fs.existsSync(serverJs),
    claudeCli: has('claude'),
    codex: { ...codex, ...(withLogin && codex.isFound ? codexLoggedIn() : {}) },
    worker: { hasRegistry: reg !== null, registryError, codexWorkers: codexWorkers(reg).map(w => w.name) },
    mcp: withMcp ? mcpStatus(root) : null,
    state: { mode: state.mode ?? null, record: rec },
    projectHasExtBlock: hasExtBlock(readText(`${root}/CLAUDE.md`)),
    keepExt: Boolean(state.keepExt?.[normDir(root)]),
    precedenceOk,
    policyError,
  }
}
