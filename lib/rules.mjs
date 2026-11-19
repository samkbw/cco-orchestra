// 기본 규칙: 확장 프로그램에서 꺼내기, CLAUDE.md 구간 넣기·빼기, 고쳤는지 판단
import { createRequire } from 'node:module'

export const START = '<!-- orchestra:rules:start -->'
export const END = '<!-- orchestra:rules:end -->'
export const EXT_START = '<!-- claude-code-orchestrator:policy:start -->'
export const EXT_END = '<!-- claude-code-orchestrator:policy:end -->'
// 넣지 않는 부분: 사용자 습관보다 앞선다는 우선순위 규칙
const DROPPED_SECTION = /\n## Precedence\n[\s\S]*?(?=\n## |$)/

// 설치된 확장 프로그램이 만드는 기본 규칙 원문을 그대로 꺼낸다.
export function readBasePolicy(extDir) {
  const text = createRequire(import.meta.url)(`${extDir}/out/prompts.js`).DISPATCH_POLICY_MD
  if (typeof text !== 'string' || !text.includes(EXT_START) || !text.includes(EXT_END)) {
    throw new Error('확장 프로그램에서 기본 규칙을 읽지 못함 (확장 프로그램 구조가 바뀌었을 수 있음)')
  }
  return text.replace(/\r\n/g, '\n')
}

export const hasDroppedSection = base => DROPPED_SECTION.test(base.replace(/\r\n/g, '\n'))

export function toBlock(base, version) {
  const plain = base.replace(/\r\n/g, '\n')
  const inner = plain.slice(plain.indexOf(EXT_START) + EXT_START.length, plain.indexOf(EXT_END))
  return [
    START,
    `<!-- orchestra: 기본 규칙 (Claude Code Orchestrator ${version}). 내 방식에 맞게 고쳐 쓰세요. 고친 내용은 업데이트해도 자동으로 덮어쓰지 않습니다. -->`,
    '',
    inner.replace(DROPPED_SECTION, '').trim(),
    END,
  ].join('\n')
}

function cut(text, start, end) {
  const s = text.indexOf(start)
  const e = s < 0 ? -1 : text.indexOf(end, s)
  return s >= 0 && e > s ? { s, e: e + end.length } : null
}

export function findBlock(text) {
  const at = cut(text, START, END)
  return at ? text.slice(at.s, at.e) : null
}

// 규칙에 $` 같은 글자가 있어 String.replace를 쓰면 치환 패턴으로 해석되므로 잘라 붙인다.
export function upsertBlock(text, block) {
  const at = cut(text, START, END)
  if (at) return text.slice(0, at.s) + block + text.slice(at.e)
  return text.trim() === '' ? `${block}\n` : `${text.replace(/\s*$/, '')}\n\n${block}\n`
}

function removeRange(text, start, end) {
  const at = cut(text, start, end)
  if (!at) return text
  const out = `${text.slice(0, at.s).replace(/\s*$/, '')}\n\n${text.slice(at.e).replace(/^\s*/, '')}`
  return out.trim() === '' ? '' : `${out.replace(/\s*$/, '')}\n`
}

export const removeBlock = text => removeRange(text, START, END)
export const hasExtBlock = text => cut(text, EXT_START, EXT_END) !== null
export const removeExtBlock = text => removeRange(text, EXT_START, EXT_END)

// 줄바꿈(CRLF/LF)·줄 끝 공백 차이는 고친 것으로 보지 않는다.
export function hashText(text) {
  const plain = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < plain.length; i++) {
    h ^= plain.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}
