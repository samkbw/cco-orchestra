// 워커 현황: 입력창 바로 위 띠에 이 폴더에서 맡긴 일마다 워커·모델·상태·걸린 시간을 보여 준다 (서브에이전트 목록과 같은 자리).
// 오케스트레이터가 남기는 ~/.claude-code-orchestrator/tasks.jsonl을 읽기만 한다. 파일 크기가 바뀔 때만 다시 읽는다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { WorkerRow } from '../types'

const POLL_MS = 2000
const TAIL_BYTES = 256 * 1024
// 끝난 일은 이만큼 더 보여 주고 띠에서 뺀다.
const KEEP_DONE_MS = 10000
const STATE_MARK: Record<WorkerRow['status'], string> = { waiting: '…', running: '⠋', done: '✔', error: '✖', cancelled: '■' }
const STATE_TEXT: Record<WorkerRow['status'], string> = { waiting: '대기', running: '진행 중', done: '완료', error: '실패', cancelled: '취소' }

const board = atom({ plugin: 'orchestra', key: 'workers' } as const, [] as WorkerRow[], { shape: 'workers-2' })
let lastSize = -1
let stopTimer: (() => void) | null = null

function tasksFile($: EngineInterface) {
  return `${$.plugin.root.replace(/\\/g, '/').split('/.claude/')[0]}/.claude-code-orchestrator/tasks.jsonl`
}

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

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

async function refresh($: EngineInterface, root: string) {
  try {
    const size = (await $.fs.stat(tasksFile($)).catch(() => null))?.size ?? 0
    const now = Date.now()
    let rows = await read($, board)
    if (size !== lastSize) {
      // 처음 읽을 때는 이미 끝난 일을 띠에 올리지 않는다.
      const isFirst = lastSize === -1
      lastSize = size
      rows = size ? await readRows($, root, size) : []
      if (isFirst) rows = rows.filter(row => row.endedAt === null)
    }
    const shown = rows.filter(row => row.endedAt === null || now - row.endedAt < KEEP_DONE_MS)
    // 띠에 보일 것이 있거나 방금 사라질 때만 다시 그린다 (진행 중이면 시간이 바뀌므로 매번).
    const before = await read($, board)
    if (shown.length || before.length) await update($, board, () => shown)
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

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export async function renderWorkerBoard($: EngineInterface, e: never, next: () => Promise<unknown>) {
  const rows: WorkerRow[] = await read($, board)
  if (!rows.length) return next()
  const { Box, Text } = $.ui.resolve(e)
  const now = Date.now()
  return (
    <Box flexDirection="column">
      <Text dimColor>{`🎼 워커 ${rows.filter(row => row.endedAt === null).length}개 진행 중`}</Text>
      {rows.map(item => (
        <Text key={item.id} dimColor={item.status === 'done'} color={item.status === 'error' ? 'red' : undefined}>
          {`  ${STATE_MARK[item.status]} ${item.title}  ${[item.worker, item.model].filter(Boolean).join(' · ') || '배정 대기'}  ${STATE_TEXT[item.status]} ${clock((item.endedAt ?? now) - item.startedAt)}${item.error ? `  ${item.error}` : ''}`}
        </Text>
      ))}
    </Box>
  )
}
