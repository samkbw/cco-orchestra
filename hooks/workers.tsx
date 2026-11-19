// 워커 현황: 워커에게 일을 맡긴 줄(dispatch_task·dispatch_tasks) 아래에 일마다 워커·모델·상태·걸린 시간을 보여 준다.
// 오케스트레이터가 남기는 ~/.claude-code-orchestrator/tasks.jsonl을 맡긴 동안만 몇 초마다 읽는다 (읽기만).
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { WorkerRow } from '../types'

const POLL_MS = 2000
const TAIL_BYTES = 256 * 1024
const DISPATCH_TOOL = /cco-dispatch__dispatch_tasks?$/
const STATE_MARK: Record<WorkerRow['status'], string> = { waiting: '…', running: '⠋', done: '✔', error: '✖', cancelled: '■' }
const STATE_TEXT: Record<WorkerRow['status'], string> = { waiting: '대기', running: '진행 중', done: '완료', error: '실패', cancelled: '취소' }

// 맡긴 줄(tool_use_id)마다 그 줄의 일 목록
const board = atom({ plugin: 'orchestra', key: 'workers' } as const, {} as Record<string, WorkerRow[]>, { shape: 'workers-1' })
const timers = new Map<string, () => void>()

export const isDispatch = (tool: string) => DISPATCH_TOOL.test(tool)

function titlesOf(input: unknown): string[] {
  const value = input as { tasks?: { title?: unknown }[]; title?: unknown }
  const list = Array.isArray(value?.tasks) ? value.tasks : [value]
  return list.map(task => String(task?.title ?? '')).filter(Boolean)
}

function tasksFile($: EngineInterface) {
  return `${$.plugin.root.replace(/\\/g, '/').split('/.claude/')[0]}/.claude-code-orchestrator/tasks.jsonl`
}

function toStatus(raw: unknown): WorkerRow['status'] {
  const text = String(raw ?? '')
  if (text === 'done' || text === 'error' || text === 'running' || text === 'cancelled') return text
  return /cancel/i.test(text) ? 'cancelled' : 'waiting'
}

// 맡긴 뒤(since)에 생긴 기록 중 이 줄의 일 이름과 같은 것만 고른다. 같은 id는 마지막 기록이 지금 상태다.
async function readRows($: EngineInterface, titles: string[], since: number): Promise<WorkerRow[]> {
  const file = tasksFile($)
  const size = (await $.fs.stat(file).catch(() => null))?.size ?? 0
  if (!size) return titles.map(title => ({ id: '', title, worker: '', model: '', status: 'waiting', startedAt: since, endedAt: null, error: '' }))
  const offset = Math.max(0, size - TAIL_BYTES)
  const text = await $.fs.read(file, { offset, length: size - offset })
  const rows = new Map<string, WorkerRow>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const ts = Number(rec.ts ?? 0)
    if (ts < since - 5000 || !titles.includes(String(rec.title ?? ''))) continue
    const id = String(rec.id ?? '')
    const prev = rows.get(id)
    const status = toStatus(rec.status)
    rows.set(id, {
      id,
      title: String(rec.title ?? ''),
      worker: String(rec.worker ?? prev?.worker ?? ''),
      model: String(rec.modelUsed ?? rec.model ?? prev?.model ?? ''),
      status,
      startedAt: prev?.startedAt ?? ts,
      endedAt: status === 'done' || status === 'error' || status === 'cancelled' ? ts : null,
      error: status === 'error' ? String(rec.error ?? '').split('\n')[0].slice(0, 120) : '',
    })
  }
  // 아직 기록이 없는 일은 대기로 보인다.
  const seen = [...rows.values()]
  const waiting = titles.filter(title => !seen.some(row => row.title === title))
  return [...seen, ...waiting.map(title => ({ id: '', title, worker: '', model: '', status: 'waiting' as const, startedAt: since, endedAt: null, error: '' }))]
}

async function refresh($: EngineInterface, toolUseId: string, titles: string[], since: number) {
  try {
    const rows = await readRows($, titles, since)
    await update($, board, now => ({ ...now, [toolUseId]: rows }))
  } catch (err) {
    $.ui.log(`orchestra: 워커 현황 읽기 실패: ${String(err)}`, { to: 'debug' })
  }
}

// 맡기는 동안만 읽고, 끝나면 한 번 더 읽어 마지막 상태를 남긴 뒤 멈춘다.
export async function watchDispatch($: EngineInterface, toolUseId: string, input: unknown, run: () => Promise<unknown>) {
  const titles = titlesOf(input)
  const since = Date.now()
  $.ui.log(`orchestra: 워커 현황 시작 (${titles.length}개)`, { to: 'debug' })
  await refresh($, toolUseId, titles, since)
  timers.set(toolUseId, $.clock.every(POLL_MS, () => void refresh($, toolUseId, titles, since)))
  try {
    return await run()
  } finally {
    timers.get(toolUseId)?.()
    timers.delete(toolUseId)
    await refresh($, toolUseId, titles, since)
    $.ui.log(`orchestra: 워커 현황 끝 (${Math.round((Date.now() - since) / 1000)}초)`, { to: 'debug' })
  }
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export async function renderWorkers($: EngineInterface, e: { props: { tool_use_id: string } }, row: unknown) {
  const rows = (await read($, board))[e.props.tool_use_id]
  if (!rows?.length) return row
  const { Box, Text } = $.ui.resolve(e as never)
  const now = Date.now()
  return (
    <Box flexDirection="column">
      {row}
      <Box flexDirection="column" paddingLeft={2}>
        {rows.map(item => (
          <Text key={item.id || item.title} dimColor={item.status === 'done'} color={item.status === 'error' ? 'red' : undefined}>
            {`${STATE_MARK[item.status]} ${item.title}  ${[item.worker, item.model].filter(Boolean).join(' · ') || '배정 대기'}  ${STATE_TEXT[item.status]} ${clock((item.endedAt ?? now) - item.startedAt)}${item.error ? `  ${item.error}` : ''}`}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
