// 범위 적용·갱신: 연결(cco-dispatch)과 기본 규칙. 이 패키지가 넣은 것만 고치고 지우며, 사용자가 고친 것은 덮어쓰지 않는다.
import fs from 'node:fs'

import { findExtension } from './check.mjs'
import { findBlock, hasDroppedSection, hasExtBlock, hashText, readBasePolicy, removeBlock, removeExtBlock, toBlock, upsertBlock } from './rules.mjs'
import { backup, firstLine, home, log, normDir, projectRoot, readState, readText, run, serverJs, timed, writeState, writeText } from './sys.mjs'

const NAME = 'cco-dispatch'
const SCOPES = ['global', 'project']
const keyOf = (scope, root) => (scope === 'global' ? 'global' : `project:${normDir(root)}`)
const rulesFile = (scope, root) => (scope === 'global' ? `${home}/.claude/CLAUDE.md` : `${root}/CLAUDE.md`)
const scopeName = scope => (scope === 'global' ? '전역' : '이 프로젝트')

export function assertScope(scope) {
  if (!SCOPES.includes(scope)) throw new Error(`범위는 global 또는 project여야 합니다: ${scope ?? '(없음)'}`)
}

// 범위별 등록을 설정 파일에서 직접 읽는다 (읽기만, 쓰기는 claude mcp 명령으로).
function registered(scope, root) {
  const file = scope === 'global' ? `${home}/.claude.json` : `${root}/.mcp.json`
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers?.[NAME] ?? null
  } catch {
    return null
  }
}

const pointsToServer = entry => JSON.stringify(entry?.args ?? []).replace(/\\\\/g, '/').includes(serverJs.split('/').slice(-3).join('/'))

// 연결은 플러그인(.mcp.json)이 띄우므로 따로 등록하지 않는다 (플러그인을 켜면 다시 시작 없이 연결).
// 예전 버전이 등록한 것(addedMcp)은 중복되지 않게 지우고, 사용자가 직접 등록한 것은 건드리지 않고 알린다.
function migrateServer(scope, root, prev) {
  const now = registered(scope, root)
  if (!now) return { removed: false, note: null }
  if (prev?.addedMcp && pointsToServer(now)) return { removed: removeServer(scope, root), note: null }
  return { removed: false, note: `${scopeName(scope)}에 직접 등록한 cco-dispatch가 있어 그대로 두었습니다. 플러그인 연결과 같은 기능이 두 번 보일 수 있으니, 필요 없으면 claude mcp remove -s ${scope === 'global' ? 'user' : 'project'} cco-dispatch 로 지워 주세요.` }
}

function removeServer(scope, root) {
  if (!registered(scope, root)) return false
  const out = run('claude', ['mcp', 'remove', '-s', scope === 'global' ? 'user' : 'project', NAME], { cwd: root, timeoutMs: 60000 })
  if (out.code !== 0) throw new Error(`예전 연결 삭제 실패: ${firstLine(out.stderr) || firstLine(out.stdout)}`)
  return true
}

function currentBlock() {
  const ext = findExtension()
  if (!ext) throw new Error('Claude Code Orchestrator 확장 프로그램을 찾지 못했습니다.')
  const base = readBasePolicy(ext.dir)
  if (!hasDroppedSection(base)) log('경고: 기본 규칙에서 우선순위(Precedence) 구간을 찾지 못해 그대로 넣음')
  return { block: toBlock(base, ext.version), version: ext.version }
}

function writeRules(file, change) {
  const before = readText(file)
  const after = change(before)
  if (after === before) return false
  backup(file)
  writeText(file, after)
  return true
}

// 기록한 hash와 같으면 이 패키지가 넣은 그대로(고치지 않음). 기록이 없는데 구간이 있으면 누군가 넣어 둔 것으로 보고 고친 것으로 취급한다.
const isUnedited = (block, rec) => block !== null && rec?.hash !== undefined && hashText(block) === rec.hash

function savePending(block, version) {
  const saved = `${home}/.claude/orchestra/기본규칙-${version}.md`
  writeText(saved, `${block}\n`)
  return saved
}

// 범위 적용. 연결 등록 직후 기록을 먼저 남기고, 규칙은 고친 것이 없을 때만 넣거나 바꾼다.
// 범위를 바꾸면 예전 범위에서 이 패키지가 넣은 그대로인 것만 지운다. 전역 연결은 다른 프로젝트도 쓰므로 자동으로 지우지 않는다.
export async function apply(scope, cwd) {
  assertScope(scope)
  const root = projectRoot(cwd)
  return timed(`범위 적용(${scope === 'global' ? '모든 프로젝트' : root})`, async () => {
    const { block, version } = currentBlock()
    const state = readState()
    state.records ??= {}
    const key = keyOf(scope, root)
    const prev = state.records[key]
    const target = rulesFile(scope, root)
    const notes = []

    const server = migrateServer(scope, root, prev)
    if (server.note) notes.push(server.note)
    const cleaned = []
    if (server.removed) cleaned.push(`예전 방식 cco-dispatch 등록(${scopeName(scope)}) → 플러그인 연결로 바꿈`)
    state.records[key] = { ...(prev ?? {}), scope, target, version: prev?.version ?? version, addedMcp: false, at: new Date().toISOString() }
    state.mode = scope
    // 처음 적용할 때만 규칙 맞추기를 기다림으로 둔다 (다시 적용해도 끝낸 기록은 그대로).
    state.tune ??= 'pending'
    writeState(state)

    const now = findBlock(readText(target))
    if (now === null || isUnedited(now, prev)) {
      writeRules(target, text => upsertBlock(text, block))
      state.records[key] = { ...state.records[key], version, hash: hashText(block), pendingVersion: undefined, savedPath: undefined }
    } else if (prev?.version === version && !prev?.pendingVersion) {
      // 같은 버전에서 고친 규칙: 새로 합칠 것이 없으므로 그대로 둔다.
      notes.push(`${target}의 고친 규칙은 그대로 두었습니다.`)
    } else if (hashText(now) !== hashText(block)) {
      const saved = savePending(block, version)
      // 기록이 없던 구간은 누가 넣었는지 모르므로 계속 '고친 것'으로 본다 (다음 갱신에서도 덮어쓰지 않게).
      state.records[key] = { ...state.records[key], hash: prev?.hash ?? 'unknown', pendingVersion: version, savedPath: saved }
      notes.push(`${target}에 고친 규칙이 있어 그대로 두었습니다. 새 기본 규칙은 ${saved}에 저장했습니다.`)
    } else {
      state.records[key] = { ...state.records[key], version, hash: hashText(block) }
    }
    writeState(state)

    const other = scope === 'global' ? 'project' : 'global'
    const old = state.records[keyOf(other, root)]
    if (old && other === 'project') {
      try {
        const oldBlock = findBlock(readText(old.target))
        if (isUnedited(oldBlock, old)) {
          if (writeRules(old.target, removeBlock)) cleaned.push(`${old.target}의 오케스트라 규칙 구간`)
        } else if (oldBlock !== null) notes.push(`${old.target}의 오케스트라 규칙은 고친 내용이 있어 그대로 두었습니다. 필요 없으면 직접 지워 주세요.`)
        if (old.addedMcp && removeServer('project', root)) cleaned.push('이 프로젝트 cco-dispatch 연결')
        delete state.records[keyOf('project', root)]
        writeState(state)
      } catch (err) {
        notes.push(`예전 프로젝트 설정 정리 중 문제가 있어 일부를 남겨 두었습니다: ${err.message}`)
      }
    }
    if (old && other === 'global') {
      notes.push('전역 오케스트라 규칙·연결은 다른 프로젝트도 쓰므로 그대로 두었습니다. 이 프로젝트에는 프로젝트 설정이 함께 적용됩니다. 전역 규칙을 지우려면 ~/.claude/CLAUDE.md의 orchestra 구간을 직접 지워 주세요.')
    }
    if (cleaned.length) log(`예전 범위(${other}) 정리: ${cleaned.join(', ')}`)
    if (notes.length) log(`알림: ${notes.join(' / ')}`)
    return { scope, target, version, cleaned, notes }
  })
}

function activeKey(state, root) {
  return state.mode === 'project' ? keyOf('project', root) : 'global'
}

// 기본 규칙 갱신: 고치지 않았으면 바꾸고, 고쳤으면 새 규칙을 따로 저장하고 합치기 대기로 둔다.
export async function sync(cwd) {
  const root = projectRoot(cwd)
  const state = readState()
  const key = activeKey(state, root)
  const rec = state.records?.[key]
  if (!rec) throw new Error('아직 적용하지 않았습니다. 먼저 범위를 골라 적용해 주세요.')
  return timed(`기본 규칙 갱신(${rec.version})`, async () => {
    const { block, version } = currentBlock()
    const now = findBlock(readText(rec.target))
    if (now === null || isUnedited(now, rec)) {
      writeRules(rec.target, t => upsertBlock(t, block))
      state.records[key] = { ...rec, version, hash: hashText(block), at: new Date().toISOString(), pendingVersion: undefined, savedPath: undefined }
      writeState(state)
      return { isMerged: true, version, target: rec.target }
    }
    const saved = savePending(block, version)
    state.records[key] = { ...rec, pendingVersion: version, savedPath: saved }
    writeState(state)
    return { isMerged: false, version, target: rec.target, saved }
  })
}

// 고친 규칙을 직접 합친 뒤: 새 버전 기준으로 기록한다.
export function mergeDone(cwd) {
  const root = projectRoot(cwd)
  const state = readState()
  const key = activeKey(state, root)
  const rec = state.records?.[key]
  if (!rec?.pendingVersion) return false
  state.records[key] = { ...rec, version: rec.pendingVersion, pendingVersion: undefined, savedPath: undefined, at: new Date().toISOString() }
  writeState(state)
  log(`합치기 끝냄: ${rec.version} → ${rec.pendingVersion}`)
  return true
}

// 규칙 맞추기 기록: start(시작함 → 더 묻지 않음), later(미룸: 한 번은 다음에 다시 묻고, 두 번째부터는 묻지 않음)
export function tune(action) {
  if (action !== 'start' && action !== 'later') throw new Error(`tune은 start 또는 later여야 합니다: ${action ?? '(없음)'}`)
  const state = readState()
  const before = state.tune ?? 'pending'
  state.tune = action === 'start' ? 'done' : before === 'pending' ? 'later' : 'skipped'
  writeState(state)
  log(`규칙 맞추기: ${before} → ${state.tune}`)
  return { tune: state.tune }
}

export function cleanExt(cwd) {
  const file = `${projectRoot(cwd)}/CLAUDE.md`
  const changed = writeRules(file, removeExtBlock)
  log(`프로젝트 확장 규칙 삭제(${file}): ${changed ? '지움' : '없음'}`)
  return { file, changed }
}

// 전역 사용자: 모든 프로젝트에 적용을 고르고 적용까지 마친 사람. 플러그인(연결 막기·자동 정리)도 이 판정을 쓴다.
export function isGlobalUser(state = readState()) {
  return state.mode === 'global' && Boolean(state.records?.global)
}

// 확장 프로그램이 프로젝트 CLAUDE.md에 넣은 규칙 자동 정리. 판단을 모두 여기서 한다 (프로젝트 루트·keepExt 키를 cleanExt·keepExt와 같은 계산으로).
// 지우는 경우: 전역 사용자 + 전역 CLAUDE.md에 오케스트라 규칙이 실제로 있음 + 이 프로젝트를 [그대로 두기] 하지 않음 + 확장 표시 구간이 있음.
// 결과 action: none(구간 없음) | project(프로젝트 설정자) | keep(그대로 두기) | noGlobal(전역 규칙 없음: 지우면 규칙이 어디에도 없게 됨) | cleaned
export function autoCleanExt(cwd) {
  const root = projectRoot(cwd)
  const file = `${root}/CLAUDE.md`
  const mtimeMs = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0
  const done = action => ({ action, file, mtimeMs: fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0 })
  if (!hasExtBlock(readText(file))) return { action: 'none', file, mtimeMs }
  const state = readState()
  if (!isGlobalUser(state)) return done('project')
  if (state.keepExt?.[normDir(root)]) return done('keep')
  if (findBlock(readText(state.records.global.target ?? rulesFile('global', root))) === null) {
    log(`확장 규칙 자동 정리 안 함: 전역 규칙 구간이 없음 (${file})`)
    return done('noGlobal')
  }
  const changed = writeRules(file, removeExtBlock)
  log(`확장 규칙 자동 정리(${file}): ${changed ? '지움' : '없음'}`)
  return done(changed ? 'cleaned' : 'none')
}

export function keepExt(cwd) {
  const state = readState()
  state.keepExt = { ...(state.keepExt ?? {}), [normDir(projectRoot(cwd))]: true }
  writeState(state)
  log(`프로젝트 확장 규칙 유지(${projectRoot(cwd)})`)
}
