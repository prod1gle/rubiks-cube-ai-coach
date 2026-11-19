import { useCallback, useEffect, useRef, useState } from 'react'
import { bindingFor, referenceRows } from './keyboardMap'
import type { KeyboardLayout, KeyBinding, LayerWidth } from './keyboardMap'

export function KeyboardControls({ disabled, onMove, onUndo, onRedo }: { disabled: boolean; onMove: (word: string) => void; onUndo: () => void; onRedo: () => void }) {
  const [layout, setLayout] = useState<KeyboardLayout>('reference'), [enabled, setEnabled] = useState(true), [widths, setWidths] = useState<{ left: LayerWidth; right: LayerWidth }>({ left: 1, right: 1 })
  const currentWidths = useRef(widths)
  const resetWidths = useCallback(() => { currentWidths.current = { left: 1, right: 1 }; setWidths(currentWidths.current) }, [])
  const execute = useCallback((binding: KeyBinding) => {
    if (disabled) return
    if (binding.move) onMove(binding.move)
    else if (binding.selector) {
      const value = currentWidths.current
      const next = { ...value }
      if (binding.selector === 'left-less') next.left = 1
      if (binding.selector === 'left-more') next.left = 2
      if (binding.selector === 'right-more') next.right = 2
      if (binding.selector === 'right-less') next.right = 1
      currentWidths.current = next; setWidths(next)
    }
  }, [disabled, onMove])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!enabled || disabled || event.repeat || event.defaultPrevented || event.isComposing || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]')) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) onRedo(); else onUndo(); return }
      if ((event.metaKey || event.ctrlKey) && key === 'y') { event.preventDefault(); onRedo(); return }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (layout === 'face-letters') {
        if (['u', 'd', 'l', 'r', 'f', 'b', 'x', 'y', 'z'].includes(key)) { event.preventDefault(); onMove((['x', 'y', 'z'].includes(key) ? key : key.toUpperCase()) + (event.shiftKey ? "'" : '')) }
        return
      }
      if (event.code === 'Space' || event.key === ' ') {
        if (event.target instanceof Element && event.target.closest('button,a,summary,[role="button"],[role="tab"]')) return
        event.preventDefault(); resetWidths(); return
      }
      const binding = bindingFor(event, currentWidths.current.left, currentWidths.current.right)
      if (!binding) return
      event.preventDefault(); execute(binding)
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
    // Widths are read synchronously from the ref so a selector then a move in
    // the same event batch uses the new selection. No cube rules live here.
  }, [enabled, disabled, layout, onMove, onUndo, onRedo, execute, resetWidths])
  return <section className="panel keyboard-panel" aria-labelledby="keymap-title"><div className="keyboard-heading"><div><p className="eyebrow">YOUR HANDS. YOUR CUBE.</p><h2 id="keymap-title">Virtual cube key map</h2></div><label>Keyboard layout<select value={layout} onChange={e => { setLayout(e.target.value as KeyboardLayout); resetWidths() }}><option value="reference">Reference layout · pictured mapping</option><option value="face-letters">Face-letter shortcuts · legacy</option></select></label><label className="keyboard-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enable keyboard shortcuts</label></div>
    {layout === 'reference' ? <><div className="keyboard-scroll"><div className="keyboard-grid" aria-label="Reference keyboard layout">{referenceRows(widths.left, widths.right).flat().map(binding => <button className={`keyboard-key ${binding.selector ? 'layer-key' : ''}`} disabled={disabled} key={binding.code} aria-label={binding.move ? `Key ${binding.key}: ${binding.move}` : `Key ${binding.key}: ${binding.selector?.replace('-', ' ')} layers`} title={binding.selector ? 'Adjust which side layers the corresponding keys turn; no cube move' : `Apply ${binding.move}`} onClick={() => execute(binding)}><kbd>{binding.key}</kbd><strong>{binding.label}</strong></button>)}</div></div><div className="keyboard-selection"><span>Left width: <strong>{widths.left} {widths.left === 1 ? 'layer' : 'layers'}</strong></span><span>Right width: <strong>{widths.right} {widths.right === 1 ? 'layer' : 'layers'}</strong></span><button className="text-button" onClick={resetWidths}>Reset layer widths</button></div><p className="analysis-help">Physical QWERTY positions match the pictured layout. Shift keeps these bindings unchanged. 3 / 4 adjust left width; 7 / 8 adjust right width. Space resets both to one layer. Labels update with the selected widths; selectors never turn the cube. Move-grid buttons are independent of these exact key bindings.</p><p className="analysis-help">Wide turns move two layers; M / E / S move the middle slice. HTM: outer or wide turn = 1, slice = 2, whole-cube rotation = 0; double turns have the same cost.</p></> : <p className="analysis-help">U D L R F B turn faces. X Y Z rotate the grip. Shift selects inverse. Use the move grid for double turns.</p>}
    <p className="analysis-help">Shortcuts pause while typing, choosing a field, solving, or using an IME. Held keys do not repeat moves. Ctrl / Command Z undoes; Shift Z or Ctrl / Command Y redoes. Click a key above to try it.</p>
  </section>
}
