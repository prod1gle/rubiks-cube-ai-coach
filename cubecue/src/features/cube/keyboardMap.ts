/** Input bindings only. All cube semantics and animation plans come from Python. */
export type KeyboardLayout = 'reference' | 'face-letters'
export type LayerWidth = 1 | 2
export interface KeyBinding { code: string; key: string; label: string; move?: string; selector?: 'left-less' | 'left-more' | 'right-more' | 'right-less' }
export function referenceRows(left: LayerWidth = 1, right: LayerWidth = 1): KeyBinding[][] {
  const moves = [
    ["S'", 'E', '<', '>', left === 1 ? 'M' : "R'", right === 1 ? 'M' : 'L', '<', '>', "E'", 'S'],
    ["z'", 'B', left === 1 ? "L'" : "Lw'", left === 1 ? "Lw'" : 'x', 'x', 'x', right === 1 ? 'Rw' : 'x', right === 1 ? 'R' : 'Rw', "B'", 'z'],
    ["y'", 'D', left === 1 ? 'L' : 'Lw', "U'", "F'", 'F', 'U', right === 1 ? "R'" : "Rw'", "D'", 'y'],
    ['Dw', left === 1 ? "M'" : 'R', "Uw'", left === 1 ? 'Lw' : "x'", "x'", "x'", right === 1 ? "Rw'" : "x'", 'Uw', right === 1 ? "M'" : "L'", "Dw'"],
  ]
  const labels = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./']
  const punctuation: Record<string, string> = { ';': 'Semicolon', ',': 'Comma', '.': 'Period', '/': 'Slash' }
  const selectors: Record<string, KeyBinding['selector']> = { '3': 'left-less', '4': 'left-more', '7': 'right-more', '8': 'right-less' }
  return labels.map((row, ri) => [...row].map((key, ci) => ({
    key, code: punctuation[key] ?? (/\d/.test(key) ? `Digit${key}` : `Key${key}`), label: moves[ri][ci],
    ...(selectors[key] ? { selector: selectors[key] } : { move: moves[ri][ci] }),
  })))
}
export function bindingFor(event: Pick<KeyboardEvent, 'code' | 'key'>, left: LayerWidth, right: LayerWidth) {
  const rows = referenceRows(left, right).flat()
  // Physical QWERTY positions take precedence, including shifted punctuation.
  return event.code ? rows.find(b => b.code === event.code) : rows.find(b => b.key.toLowerCase() === event.key.toLowerCase())
}
