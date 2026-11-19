// 워커 현황: 이 폴더에서 워커에게 맡긴 일마다 워커·모델·상태·걸린 시간을 여러 곳에 보여 준다.
//  - 맡긴 줄 아래 (모든 화면)      - 입력창 위 띠 (터미널·데스크톱·모바일)
//  - 진행 중 문구 줄 (모든 화면 중 Claude가 답하는 동안)   - 오케스트라 패널 "워커 현황" 칸   - 끝날 때 알림
// 오케스트레이터가 남기는 ~/.claude-code-orchestrator/tasks.jsonl을 읽기만 한다. 파일 크기가 바뀔 때만 다시 읽는다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { WorkerRow } from '../types'

const POLL_MS = 2000
const TAIL_BYTES = 256 * 1024
// 끝난 일: 띠·맡긴 줄에는 이만큼만, 패널에는 RECENT_MS 동안 최근 RECENT_MAX개까지 보여 준다.
const KEEP_DONE_MS = 10000
const RECENT_MS = 30 * 60 * 1000
const RECENT_MAX = 8
const STATE_MARK: Record<WorkerRow['status'], string> = { waiting: '…', running: '⠋', done: '✔', error: '✖', cancelled: '■' }
const STATE_TEXT: Record<WorkerRow['status'], string> = { waiting: '대기', running: '진행 중', done: '완료', error: '실패', cancelled: '취소' }

// 진행 중 + 최근 끝난 일 (새것 먼저)
const board = atom({ plugin: 'orchestra', key: 'workers' } as const, [] as WorkerRow[], { shape: 'workers-3' })
let lastSize = -1
let stopTimer: (() => void) | null = null
// 알림을 이미 띄운 일
const told = new Set<string>()

function tasksFile($: EngineInterface) {
  return `${$.plugin.root.replace(/\\/g, '/').split('/.claude/')[0]}/.claude-code-orchestrator/tasks.jsonl`
}

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const isActive = (row: WorkerRow) => row.endedAt === null
const isFresh = (row: WorkerRow, now: number) => row.endedAt === null || now - row.endedAt < KEEP_DONE_MS

function toStatus(raw: unknown): WorkerRow['status'] {
  const text = String(raw ?? '')
  if (text === 'done' || text === 'error' || text === 'running' || text === 'cancelled') return text
  return /cancel/i.test(text) ? 'cancelled' : 'waiting'
}

// 같은 id는 마지막 기록이 지금 상태다. 이 폴더(cwd)에서 맡긴 일만 고른다.
async function readRows($: EngineInterface, root: string, size: number): Promise<WorkerRow[]> {
  const offset = Math.max(0, size - TAIL_BYTES)
  const text = await $.fs.read(tasksFile($), { offset, length: size - offset })
  const rows = new Map<string, WorkerRow>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (!samePath(String(rec.cwd ?? ''), root)) continue
    const id = String(rec.id ?? '')
    const ts = Number(rec.ts ?? 0)
    const prev = rows.get(id)
    const status = toStatus(rec.status)
    const isEnded = status === 'done' || status === 'error' || status === 'cancelled'
    rows.set(id, {
      id,
      title: String(rec.title ?? ''),
      worker: String(rec.worker ?? prev?.worker ?? ''),
      model: String(rec.modelUsed ?? rec.model ?? prev?.model ?? ''),
      status,
      startedAt: prev?.startedAt ?? ts,
      endedAt: isEnded ? ts : null,
      error: status === 'error' ? String(rec.error ?? '').split('\n')[0].slice(0, 100) : '',
    })
  }
  return [...rows.values()]
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const who = (row: WorkerRow) => [row.worker, row.model].filter(Boolean).join(' · ') || '배정 대기'

// C. 끝날 때 알림: 이번 세션에서 진행 중으로 본 일이 끝나면 한 번만.
function tellEnded($: EngineInterface, before: WorkerRow[], rows: WorkerRow[]) {
  for (const row of rows) {
    if (isActive(row) || told.has(row.id)) continue
    const wasActive = before.some(old => old.id === row.id && isActive(old))
    told.add(row.id)
    if (!wasActive) continue
    const took = clock((row.endedAt ?? 0) - row.startedAt)
    $.ui.toast(`🎼 ${STATE_MARK[row.status]} ${row.title} ${STATE_TEXT[row.status]} · ${who(row)} · ${took}${row.error ? ` · ${row.error}` : ''}`)
    $.ui.log(`orchestra: 워커 일 ${STATE_TEXT[row.status]}: ${row.title} (${who(row)}, ${took})`, { to: 'debug' })
  }
}

async function refresh($: EngineInterface, root: string) {
  try {
    const size = (await $.fs.stat(tasksFile($)).catch(() => null))?.size ?? 0
    const now = Date.now()
    const before: WorkerRow[] = await read($, board)
    let rows = before
    if (size !== lastSize) {
      const isFirst = lastSize === -1
      lastSize = size
      rows = size ? await readRows($, root, size) : []
      // 처음 읽을 때 이미 끝나 있던 일은 알리지 않는다.
      if (isFirst) rows.filter(row => !isActive(row)).forEach(row => told.add(row.id))
      else tellEnded($, before, rows)
    }
    const kept = rows
      .filter(row => isActive(row) || now - (row.endedAt ?? 0) < RECENT_MS)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, RECENT_MAX)
    // 진행 중이면 시간이 바뀌므로 매번, 아니면 바뀌었거나 방금 끝난 일이 띠에서 빠질 때만 다시 그린다.
    const isChanged = JSON.stringify(kept) !== JSON.stringify(before)
    const isTicking = kept.some(row => isActive(row) || now - (row.endedAt ?? 0) < KEEP_DONE_MS + POLL_MS)
    if (isChanged || isTicking) await update($, board, () => kept)
  } catch (err) {
    $.ui.log(`orchestra: 워커 현황 읽기 실패: ${String(err)}`, { to: 'debug' })
  }
}

export async function startWorkerBoard($: EngineInterface) {
  stopTimer?.()
  lastSize = -1
  const root = await $.session.root()
  await refresh($, root)
  stopTimer = $.clock.every(POLL_MS, () => void refresh($, root))
  $.ui.log('orchestra: 워커 현황 시작', { to: 'debug' })
}

function lines($: EngineInterface, e: any, rows: WorkerRow[], indent: string, withAgo: boolean) {
  const { Text } = $.ui.resolve(e)
  const now = Date.now()
  return rows.map(item => {
    const ago = withAgo && item.endedAt !== null ? ` (${Math.max(1, Math.round((now - item.endedAt) / 60000))}분 전)` : ''
    return (
      <Text key={item.id} dimColor={item.status === 'done'} color={item.status === 'error' ? 'red' : undefined}>
        {`${indent}${STATE_MARK[item.status]} ${item.title}  ${who(item)}  ${STATE_TEXT[item.status]} ${clock((item.endedAt ?? now) - item.startedAt)}${ago}${item.error ? `  ${item.error}` : ''}`}
      </Text>
    )
  })
}

// 맡긴 줄 아래 (VS Code 채팅창 포함 모든 화면): 그 줄의 일만
const DISPATCH_TOOL = /cco-dispatch__dispatch_tasks?$/
export const isDispatch = (tool: string) => DISPATCH_TOOL.test(tool)

function titlesOf(input: unknown): string[] {
  const value = input as { tasks?: { title?: unknown }[]; title?: unknown }
  const list = Array.isArray(value?.tasks) ? value.tasks : [value]
  return list.map(task => String(task?.title ?? '')).filter(Boolean)
}

export async function renderDispatchRow($: EngineInterface, e: any, row: unknown) {
  const props = (e as { props: { input: unknown; isRunning: boolean } }).props
  if (!props.isRunning) return row
  const titles = titlesOf(props.input)
  const now = Date.now()
  const rows = (await read($, board)).filter((item: WorkerRow) => titles.includes(item.title) && isFresh(item, now))
  if (!rows.length) return row
  const { Box } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {row}
      {lines($, e, rows, '  ', false)}
    </Box>
  )
}

// 입력창 위 띠 (터미널·데스크톱·모바일)
export async function renderWorkerBoard($: EngineInterface, e: any, next: () => Promise<unknown>) {
  const now = Date.now()
  const rows = (await read($, board)).filter((row: WorkerRow) => isFresh(row, now))
  if (!rows.length) return next()
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text dimColor>{`🎼 워커 ${rows.filter(isActive).length}개 진행 중`}</Text>
      {lines($, e, rows, '  ', false)}
    </Box>
  )
}

// A. 진행 중 문구 줄: Claude가 답하는 동안 "· 워커 N개 진행 중"을 덧붙인다.
export async function rewriteSpinner($: EngineInterface, e: any, next: (e: any) => Promise<unknown>) {
  const count = (await read($, board)).filter(isActive).length
  if (!count) return next(e)
  const suffix = `${e.props.suffix ?? '…'} · 🎼 워커 ${count}개 진행 중`
  return next({ ...e, props: { ...e.props, suffix } })
}

// B. 오케스트라 패널의 "워커 현황" 칸: 진행 중과 최근 끝난 일
export async function renderWorkerSection($: EngineInterface, e: any) {
  const rows: WorkerRow[] = await read($, board)
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>── 워커 현황 ──</Text>
      {rows.length ? lines($, e, rows, '', true) : <Text dimColor>최근 30분 동안 이 폴더에서 맡긴 일이 없습니다.</Text>}
    </Box>
  )
}
