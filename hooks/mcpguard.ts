// 겹치는 연결 막기 (전역 사용자만): 이 플러그인의 연결(plugin:<이 플러그인 이름>:cco-dispatch)이 아닌 cco-dispatch가
// 붙으려 하면 막는다. 확장 프로그램 알림에서 [Register]를 눌러 생긴 프로젝트 .mcp.json, 사용자 설정에 들어간 것 모두 해당.
// 파일은 지우지 않는다: 지우면 확장 프로그램이 다시 등록하라고 계속 묻기 때문. 막은 사실은 알림과 /mcp 목록에 보인다.
// 전역 사용자인지는 CLI(is-global)가 판단한다 (규칙 정리와 같은 기준). 판단이 실패하면 막지 않는다.
import type { EngineInterface } from 'claude-code'

import type { CoreResult } from './core'

let isTold = false

export const isOtherDispatch = (server: string, ownName: string) => server !== `plugin:${ownName}:cco-dispatch` && /(^|:)cco-dispatch$/.test(server)

export const HOLD_MESSAGE = '오케스트라가 이미 모든 프로젝트에 연결해 두어서, 겹치는 cco-dispatch 연결을 막았습니다.'

// 막아야 하면 연결 결과(안 붙음)를, 아니면 null. 판단에 실패하면 막지 않는다 (연결을 잘못 끊는 것보다 겹치는 편이 낫다).
export async function guardConnect($: EngineInterface, server: string, run: (args: string[]) => Promise<CoreResult>) {
  try {
    if (!isOtherDispatch(server, $.plugin.name)) return null
    const r = await run(['is-global'])
    if (!r.ok || r.isGlobal !== true) return null
    tellHeld($, server)
    return { isConnected: false as const, reason: 'disabled' as const, message: HOLD_MESSAGE }
  } catch (err) {
    $.ui.log(`orchestra: 연결 막기 판단 실패: ${String(err)}`, { to: 'debug' })
    return null
  }
}

function tellHeld($: EngineInterface, server: string) {
  $.ui.log(`orchestra: 겹치는 연결 막음: ${server}`, { to: 'debug' })
  if (isTold) return
  isTold = true
  $.ui.toast(`🎼 ${HOLD_MESSAGE} (확장 알림에서 [Register]를 눌러 생긴 프로젝트의 .mcp.json은 지워도 됩니다. 지우면 확장이 다시 물을 수 있으니 그때는 [Not in this workspace])`)
}
