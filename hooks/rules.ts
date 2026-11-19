import type { EngineInterface } from 'claude-code'

// 이 패키지가 CLAUDE.md에 넣는 구간. 확장 프로그램은 자기 표시(EXT_*) 안쪽만 고치므로 이 구간은 건드리지 않는다.
export const START = '<!-- orchestra:rules:start -->'
export const END = '<!-- orchestra:rules:end -->'
export const EXT_START = '<!-- claude-code-orchestrator:policy:start -->'
export const EXT_END = '<!-- claude-code-orchestrator:policy:end -->'
// 기본 규칙 중 넣지 않는 부분: 사용자 습관보다 앞선다는 우선순위 규칙
const DROPPED_SECTION = /\n## Precedence\n[\s\S]*?(?=\n## |$)/

const READ_POLICY = 'process.stdout.write(require(process.argv[1]).DISPATCH_POLICY_MD)'

// 설치된 확장 프로그램이 만드는 기본 규칙 원문을 그대로 꺼낸다.
export async function readBasePolicy($: EngineInterface, node: string, extDir: string): Promise<string> {
  const ran = await $.process.run([node, '-e', READ_POLICY, `${extDir}/out/prompts.js`], { timeoutMs: 15000 })
  if (ran.exitCode !== 0 || !ran.stdout.includes(EXT_START) || !ran.stdout.includes(EXT_END)) {
    throw new Error(`확장 프로그램에서 기본 규칙을 읽지 못함 (구조가 바뀌었을 수 있음): ${ran.stderr.trim().split(/\r?\n/)[0] ?? ''}`)
  }
  return ran.stdout
}

// 기본 규칙 원문 → 이 패키지 구간. 확장 표시는 빼고 우선순위 규칙은 지운다.
export function toBlock(base: string, version: string): string {
  const inner = base.slice(base.indexOf(EXT_START) + EXT_START.length, base.indexOf(EXT_END))
  const body = inner.replace(DROPPED_SECTION, '').trim()
  return [
    START,
    `<!-- orchestra: 기본 규칙 (Claude Code Orchestrator ${version}). 내 방식에 맞게 고쳐 쓰세요. 고친 내용은 업데이트해도 자동으로 덮어쓰지 않습니다. -->`,
    '',
    body,
    END,
  ].join('\n')
}

export function findBlock(text: string): string | null {
  const s = text.indexOf(START)
  const e = text.indexOf(END)
  return s >= 0 && e > s ? text.slice(s, e + END.length) : null
}

// 구간이 있으면 바꾸고, 없으면 파일 끝에 붙인다.
export function upsertBlock(text: string, block: string): string {
  const old = findBlock(text)
  if (old !== null) return text.replace(old, block)
  return text.trim() === '' ? `${block}\n` : `${text.replace(/\s*$/, '')}\n\n${block}\n`
}

export function hasExtBlock(text: string): boolean {
  return text.includes(EXT_START) && text.includes(EXT_END)
}

// 확장 프로그램이 프로젝트 CLAUDE.md에 넣은 기본 규칙 구간을 지운다.
export function removeExtBlock(text: string): string {
  const s = text.indexOf(EXT_START)
  const e = text.indexOf(EXT_END)
  if (s < 0 || e < s) return text
  const out = `${text.slice(0, s).replace(/\s*$/, '')}\n${text.slice(e + EXT_END.length).replace(/^\s*/, '\n')}`
  return `${out.replace(/\s*$/, '')}\n`
}

// 고쳤는지 판단용 간단한 해시 (FNV-1a)
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

export async function readText($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
}
