import type { EngineInterface } from 'claude-code'

// 기록 파일: ~/.claude/orchestra/orchestra.log (최근 LOG_KEEP줄만 유지)
const LOG_KEEP = 500
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function logPath(home: string): string {
  return `${home}/.claude/orchestra/orchestra.log`
}

// 한 번 알게 된 홈 폴더는 기억해 두고, home을 모르는 곳(null)에서도 파일에 남긴다.
let knownHome: string | null = null
// 기록이 겹쳐 줄이 빠지지 않게 차례로 쓴다.
let queue: Promise<void> = Promise.resolve()

// 기록에 실패해도 설정 작업은 막지 않는다.
export async function writeLog($: EngineInterface, home: string | null, text: string): Promise<void> {
  $.ui.log(`orchestra: ${text}`, { to: 'debug' })
  if (home) knownHome = home
  const at = home ?? knownHome
  if (!at) return
  queue = queue.then(() => appendLine($, at, text))
  return queue
}

async function appendLine($: EngineInterface, home: string, text: string): Promise<void> {
  try {
    const path = logPath(home)
    const stamp = new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
    const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    const lines = [...before.split(/\r?\n/).filter(line => line !== ''), `[${stamp}] ${text}`].slice(-LOG_KEEP)
    await $.fs.write(path, `${lines.join('\n')}\n`)
  } catch (err) {
    $.ui.log(`orchestra: 기록 실패 ${String(err)}`, { to: 'debug' })
  }
}

// 걸린 시간을 붙여 기록한다.
export async function timed<T>($: EngineInterface, home: string | null, what: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now()
  await writeLog($, home, `${what} 시작`)
  try {
    const result = await work()
    await writeLog($, home, `${what} 완료 (${Date.now() - started}ms)`)
    return result
  } catch (err) {
    await writeLog($, home, `오류: ${what} 실패 (${Date.now() - started}ms): ${String(err)}`)
    throw err
  }
}
