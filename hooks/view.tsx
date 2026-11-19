import type { EngineInterface } from 'claude-code'

import type { OrchestraView } from '../types'

// 버튼 글자 (키는 register.tsx의 runAction과 같다)
export const ACTION_LABELS: Record<string, string> = {
  chooseGlobal: '1. 모든 프로젝트에 적용 (추천)',
  chooseProject: '2. 프로젝트마다 따로 설정',
  setupHere: '이 프로젝트에 오케스트라 켜기',
  sync: '기본 규칙 새 버전으로 갱신',
  mergeDone: '합치기 끝냄',
  cleanExt: '확장 프로그램이 넣은 프로젝트 규칙 지우기',
  keepExt: '그대로 두기',
  fixCodex: 'Codex를 찾을 수 있게 PATH에 추가',
  viewRules: '지금 규칙 보기',
  reconfigure: '적용 범위 다시 고르기',
  recheck: '다시 확인',
}

const CHOOSE_TEXT: [string, string, string][] = [
  ['1. 모든 프로젝트에 적용 (추천)', '한 번만 설정하면 어느 폴더에서 Claude를 쓰든 오케스트라가 동작합니다.', '👉 처음 쓰는 분, 설정을 신경 쓰고 싶지 않은 분께 맞아요.'],
  ['2. 프로젝트마다 따로 설정', '필요한 프로젝트에서만 켜고, 프로젝트마다 규칙을 다르게 둘 수 있습니다.', '👉 프로젝트별로 일하는 방식을 다르게 관리하고 싶은 분(주로 개발자)께 맞아요.'],
]

export function renderPane($: EngineInterface, e: any, v: OrchestraView, press: (action: string) => () => Promise<void>) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {v.notices.map(line => <Text color="yellow">⚠ {line}</Text>)}
      {v.notices.length > 0 && <Text> </Text>}
      {v.stage === 'loading' && <Text dimColor>확인 중…</Text>}
      {v.stage === 'missing' && <Text bold>오케스트라를 쓰려면 아래 준비가 필요합니다</Text>}
      {v.stage === 'choose' && <Text bold>🎼 오케스트라를 어디에 적용할까요?</Text>}
      {v.stage === 'choose' && CHOOSE_TEXT.map(([title, about, fit]) => (
        <Box flexDirection="column">
          <Text> </Text>
          <Text bold>{title}</Text>
          <Text>   {about}</Text>
          <Text>   {fit}</Text>
        </Box>
      ))}
      {v.stage === 'status' && <Text bold color="cyan">🎼 오케스트라 상태</Text>}
      {v.rows.map(row => (
        <Text>
          <Text color={row.isOk ? 'green' : 'red'}>{row.isOk ? '✔' : '✖'} </Text>
          <Text bold>{row.label}</Text>
          <Text>  {row.value}</Text>
        </Text>
      ))}
      {v.message.length > 0 && <Text> </Text>}
      {v.message.map(line => <Text color={v.stage === 'error' ? 'red' : undefined}>{line === '' ? ' ' : line}</Text>)}
      {v.isBusy && <Text dimColor>처리 중…</Text>}
      {!v.isBusy && v.actions.length > 0 && <Text> </Text>}
      {!v.isBusy && v.actions.map(action => (
        <Button key={action} onPress={press(action)}>[ {ACTION_LABELS[action] ?? action} ]</Button>
      ))}
    </Box>
  )
}
