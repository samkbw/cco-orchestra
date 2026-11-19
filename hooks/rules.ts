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
  return ran.stdout.replace(/\r\n/g, '\n')
}

// 확장 프로그램이 우선순위 규칙 제목을 바꾸면 빼지 못하므로, 빠지는지 미리 확인한다.
export function hasDroppedSection(base: string): boolean {
  return DROPPED_SECTION.test(base.replace(/\r\n/g, '\n'))
}

// 기본 규칙 원문 → 이 패키지 구간. 확장 표시는 빼고 우선순위 규칙은 지운다.
export function toBlock(base: string, version: string): string {
  const plain = base.replace(/\r\n/g, '\n')
  const inner = plain.slice(plain.indexOf(EXT_START) + EXT_START.length, plain.indexOf(EXT_END))
  const body = inner.replace(DROPPED_SECTION, '').trim()
  return [
    START,
    `<!-- orchestra: 기본 규칙 (Claude Code Orchestrator ${version}). 내 방식에 맞게 고쳐 쓰세요. 고친 내용은 업데이트해도 자동으로 덮어쓰지 않습니다. -->`,
    '',
    body,
    END,
  ].join('\n')
}

function cut(text: string, start: string, end: string): { s: number; e: number } | null {
  const s = text.indexOf(start)
  const e = text.indexOf(end, s)
  return s >= 0 && e > s ? { s, e: e + end.length } : null
}

export function findBlock(text: string): string | null {
  const at = cut(text, START, END)
  return at ? text.slice(at.s, at.e) : null
}

// 구간이 있으면 바꾸고, 없으면 파일 끝에 붙인다.
// 규칙에 $` 같은 글자가 있어 String.replace를 쓰면 치환 패턴으로 해석되므로 잘라 붙인다.
export function upsertBlock(text: string, block: string): string {
  const at = cut(text, START, END)
  if (at) return text.slice(0, at.s) + block + text.slice(at.e)
  return text.trim() === '' ? `${block}\n` : `${text.replace(/\s*$/, '')}\n\n${block}\n`
}

function removeRange(text: string, start: string, end: string): string {
  const at = cut(text, start, end)
  if (!at) return text
  const out = `${text.slice(0, at.s).replace(/\s*$/, '')}\n\n${text.slice(at.e).replace(/^\s*/, '')}`
  return out.trim() === '' ? '' : `${out.replace(/\s*$/, '')}\n`
}

// 이 패키지 구간만 지운다 (적용 범위를 바꿀 때 예전 범위 정리용).
export function removeBlock(text: string): string {
  return removeRange(text, START, END)
}

export function hasExtBlock(text: string): boolean {
  return cut(text, EXT_START, EXT_END) !== null
}

// 확장 프로그램이 프로젝트 CLAUDE.md에 넣은 기본 규칙 구간만 지운다.
export function removeExtBlock(text: string): string {
  return removeRange(text, EXT_START, EXT_END)
}

// 고쳤는지 판단용 간단한 해시 (FNV-1a). 줄바꿈(CRLF/LF)·줄 끝 공백 차이는 고친 것으로 보지 않는다.
export function hashText(text: string): string {
  const plain = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < plain.length; i++) {
    h ^= plain.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

export async function readText($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
}
