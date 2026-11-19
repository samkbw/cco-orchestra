// 터미널로 설치할 때(git clone, npx) Claude 플러그인 등록까지 한다. 이미 있으면 그대로 둔다.
import { firstLine, log, run } from './sys.mjs'

export const MARKETPLACE = 'samkbw/cco-orchestra'
export const PLUGIN_ID = 'orchestra@cco-orchestra'

export function isPluginInstalled() {
  const out = run('claude', ['plugin', 'list'], { timeoutMs: 60000 })
  return out.code === 0 && out.stdout.includes(PLUGIN_ID)
}

export function registerPlugin() {
  if (isPluginInstalled()) return 'already'
  const market = run('claude', ['plugin', 'marketplace', 'list'], { timeoutMs: 60000 })
  if (!market.stdout.includes('cco-orchestra')) {
    const add = run('claude', ['plugin', 'marketplace', 'add', MARKETPLACE], { timeoutMs: 120000 })
    if (add.code !== 0) throw new Error(`마켓플레이스 등록 실패: ${firstLine(add.stderr) || firstLine(add.stdout)}`)
  }
  const install = run('claude', ['plugin', 'install', PLUGIN_ID], { timeoutMs: 180000 })
  if (install.code !== 0) throw new Error(`플러그인 설치 실패: ${firstLine(install.stderr) || firstLine(install.stdout)}`)
  log('Claude 플러그인 등록 완료')
  return 'installed'
}
