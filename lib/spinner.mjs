// 터미널 기다림 표시: 확인·설치처럼 기다리는 동안 움직이는 표시와 걸린 시간을 보여 준다.
// 확인·설치 코드는 동기 실행(spawnSync)이라 이 프로세스의 타이머가 멈추므로, 표시는 작은 별도 프로세스가 그린다.
import { spawn } from 'node:child_process'

const DRAW = `
const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
const label = process.argv[1]
const started = Date.now()
let i = 0
const draw = () => {
  const s = Math.floor((Date.now() - started) / 1000)
  process.stdout.write('\\r  ' + frames[i++ % frames.length] + ' ' + label + ' (' + s + '초)   ')
}
draw()
setInterval(draw, 100)
process.on('SIGTERM', () => process.exit(0))
`

// 터미널이 아니면(파이프·Claude 패널의 --json) 아무것도 그리지 않는다.
export async function withSpinner(label, work, { isEnabled = process.stdout.isTTY } = {}) {
  if (!isEnabled) return work()
  const child = spawn(process.execPath, ['-e', DRAW, label], { stdio: ['ignore', 'inherit', 'ignore'] })
  const started = Date.now()
  try {
    return await work()
  } finally {
    child.kill()
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      setTimeout(resolve, 500)
    })
    // 표시 줄을 지우고, 오래 걸렸으면 걸린 시간을 남긴다.
    const s = Math.round((Date.now() - started) / 1000)
    process.stdout.write(`\r${' '.repeat(label.length * 2 + 20)}\r${s >= 3 ? `  (${label}: ${s}초)\n` : ''}`)
  }
}
