// 패널이 보여 주는 단계
export type Stage = 'loading' | 'missing' | 'choose' | 'working' | 'done' | 'status' | 'error'

// 확인 결과 한 줄 (상태 화면·준비물 화면)
export type CheckRow = {
  label: string
  value: string
  isOk: boolean
}

export type OrchestraView = {
  stage: Stage
  rows: CheckRow[]
  // 패널 위쪽에 띄울 알림 (업데이트 필요, 확장 규칙 정리 필요 등)
  notices: string[]
  // 지금 보일 버튼 (register.tsx의 ACTIONS 키)
  actions: string[]
  // 완료·오류 안내 문장
  message: string[]
  isBusy: boolean
}

declare module 'claude-code' {
  interface PluginState {
    orchestra: {
      view: OrchestraView
    }
  }
}
