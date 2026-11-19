import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import os from 'node:os'

import { timed } from './sys.mjs'

const USAGE_REQUEST = `${JSON.stringify({
  type: 'control_request',
  request_id: 'u1',
  request: { subtype: 'get_usage' },
})}\n`

function killChild(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true })
  } else {
    child.kill()
  }
}

export async function claudeUsage({ timeoutMs = 60000 } = {}) {
  return timed('Claude 사용량 확인', async () => {
    let child
    try {
      child = spawn('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
        cwd: os.tmpdir(),
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const lines = createInterface({ input: child.stdout })
      return await new Promise(resolve => {
        let done = false
        let requested = false
        let stderr = ''

        const finish = result => {
          if (done) return
          done = true
          clearTimeout(requestTimer)
          clearTimeout(timeoutTimer)
          lines.close()
          resolve(result)
        }
        const requestUsage = () => {
          if (requested || done) return
          requested = true
          try {
            child.stdin.write(USAGE_REQUEST)
          } catch (err) {
            finish({ ok: false, error: err.message })
          }
        }
        const requestTimer = setTimeout(requestUsage, 800)
        const timeoutTimer = setTimeout(
          () => finish({ ok: false, error: `시간 초과 (${timeoutMs}ms)` }),
          timeoutMs,
        )

        child.stderr.on('data', chunk => {
          stderr += chunk.toString()
        })
        child.stdin.on('error', err => finish({ ok: false, error: err.message }))
        child.on('error', err => finish({ ok: false, error: err.message }))
        child.on('close', code => finish({
          ok: false,
          error: stderr.trim() || `Claude 종료 (코드 ${code ?? '없음'})`,
        }))
        lines.on('line', line => {
          requestUsage()
          try {
            const message = JSON.parse(line)
            const response = message.response
            if (
              message.type !== 'control_response'
              || response?.request_id !== 'u1'
              || response?.subtype !== 'success'
            ) return

            const usage = response.response
            finish({
              ok: true,
              fiveHour: usage?.rate_limits?.five_hour?.utilization ?? null,
              sevenDay: usage?.rate_limits?.seven_day?.utilization ?? null,
              fiveHourResetsAt: usage?.rate_limits?.five_hour?.resets_at ?? null,
              sevenDayResetsAt: usage?.rate_limits?.seven_day?.resets_at ?? null,
              plan: usage?.subscription_type ?? null,
            })
          } catch {
            // JSON이 아닌 진행 메시지는 건너뛴다.
          }
        })
      })
    } catch (err) {
      return { ok: false, error: err.message }
    } finally {
      if (child) killChild(child)
    }
  })
}
