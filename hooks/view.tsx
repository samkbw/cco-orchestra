import type { EngineInterface } from 'claude-code'

import type { OrchestraView, StepRow } from '../types'

// 버튼 글자 (키는 register.tsx의 runAction과 같다)
export const ACTION_LABELS: Record<string, string> = {
  installNode: 'Node.js 설치',
  startInstall: '설치',
  startInstallNoCodex: 'Codex 없이 설치',
  cancel: '취소',
  chooseGlobal: '1. 모든 프로젝트에 적용 (추천)',
  chooseProject: '2. 프로젝트마다 따로 설정',
  setupHere: '이 프로젝트에 오케스트라 켜기',
  sync: '기본 규칙 새 버전으로 갱신',
  mergeDone: '합치기 끝냄',
  cleanExt: '확장 프로그램이 넣은 프로젝트 규칙 지우기',
  keepExt: '그대로 두기',
  fixCodex: 'Codex를 찾을 수 있게 PATH에 추가',
  install: '빠진 것 설치하기',
  viewRules: '지금 규칙 보기',
  reconfigure: '적용 범위 다시 고르기',
  recheck: '다시 확인',
  tuneStart: '👉 지금 규칙 맞추기',
  tuneLater: '나중에',
  tuneOpen: '규칙 맞추기',
}

const CHOOSE_TEXT: [string, string, string][] = [
  ['1. 모든 프로젝트에 적용 (추천)', '한 번만 설정하면 어느 폴더에서 Claude를 쓰든 오케스트라가 동작합니다.', '👉 처음 쓰는 분, 설정을 신경 쓰고 싶지 않은 분께 맞아요.'],
  ['2. 프로젝트마다 따로 설정', '필요한 프로젝트에서만 켜고, 프로젝트마다 규칙을 다르게 둘 수 있습니다.', '👉 프로젝트별로 일하는 방식을 다르게 관리하고 싶은 분(주로 개발자)께 맞아요.'],
]

const STEP_MARK: Record<StepRow['state'], [string, string | undefined]> = {
  todo: ['○', undefined],
  running: ['⏳', 'yellow'],
  ok: ['✔', 'green'],
  failed: ['✖', 'red'],
  skipped: ['–', undefined],
  manual: ['✋', 'yellow'],
}

const TITLES: Partial<Record<OrchestraView['stage'], string>> = {
  missing: '오케스트라를 쓰려면 Node.js가 필요합니다',
  plan: '🎼 오케스트라 설치 · 1/3 확인',
  installing: '🎼 오케스트라 설치 · 2/3 설치 중',
  choose: '🎼 오케스트라 설치 · 3/3 오케스트라를 어디에 적용할까요?',
  status: '🎼 오케스트라 상태',
  tune: '🎼 마지막 단계 · 규칙을 내 방식에 맞추기',
}

// workers: 상태·완료 화면 아래에 붙이는 "워커 현황" 칸 (설치 중에는 보이지 않음)
export function renderPane($: EngineInterface, e: any, v: OrchestraView, press: (action: string) => () => Promise<void>, workers?: unknown) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {v.notices.map(line => <Text color="yellow">⚠ {line}</Text>)}
      {v.notices.length > 0 && <Text> </Text>}
      {v.stage === 'loading' && <Text dimColor>확인 중…</Text>}
      {TITLES[v.stage] && <Text bold color="cyan">{TITLES[v.stage]}</Text>}
      {v.rows.length > 0 && <Text> </Text>}
      {v.rows.map(row => (
        <Text>
          <Text color={row.isOk ? 'green' : 'red'}>{row.isOk ? '✔' : '✖'} </Text>
          <Text bold>{row.label}</Text>
          <Text>  {row.value}</Text>
        </Text>
      ))}
      {v.stage === 'plan' && <Text> </Text>}
      {v.stage === 'plan' && <Text bold>{v.steps.length ? '추가할 것 (이미 있는 것은 건드리지 않습니다)' : '추가할 것 없음 · 바로 적용 범위를 고릅니다'}</Text>}
      {v.steps.map(step => (
        <Box flexDirection="column">
          <Text>
            <Text color={STEP_MARK[step.state][1]}>{STEP_MARK[step.state][0]} </Text>
            <Text bold>{step.title}</Text>
            {step.manual !== null && <Text color="yellow">  ← 직접 해야 함</Text>}
          </Text>
          {(step.result || step.manual || step.detail) && <Text dimColor>   {step.result || step.manual || step.detail}</Text>}
        </Box>
      ))}
      {v.stage === 'choose' && CHOOSE_TEXT.map(([title, about, fit]) => (
        <Box flexDirection="column">
          <Text> </Text>
          <Text bold>{title}</Text>
          <Text>   {about}</Text>
          <Text>   {fit}</Text>
        </Box>
      ))}
      {v.message.length > 0 && <Text> </Text>}
      {v.message.map(line => <Text color={v.stage === 'error' ? 'red' : undefined}>{line === '' ? ' ' : line}</Text>)}
      {v.isBusy && <Text dimColor>처리 중…</Text>}
      {!v.isBusy && v.actions.length > 0 && <Text> </Text>}
      {!v.isBusy && v.actions.map(action => (
        <Button key={action} onPress={press(action)}>[ {ACTION_LABELS[action] ?? action} ]</Button>
      ))}
      {(v.stage === 'status' || v.stage === 'done') && workers}
    </Box>
  )
}
