const faces = ['U', 'R', 'F', 'D', 'L', 'B']
const variants = ['', "'", '2']
const faceLabels: Record<string, string> = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' }

/** Notation buttons only; the controller and backend own all cube changes. */
export function MoveGrid({ disabled, onMove }: { disabled: boolean; onMove: (notation: string) => void }) {
  return <>
    <div className="face-turn-scroll"><div className="face-move-grid explorer-move-grid" role="group" aria-label="Face turns">
      {variants.flatMap(variant => faces.map(face => <button type="button" key={face + variant} aria-label={`Apply ${face}${variant}`} disabled={disabled} onClick={() => onMove(face + variant)}><span>{face}{variant}</span><small>{faceLabels[face]}</small></button>))}
    </div></div>
    <div className="grip-heading"><span>Rotate the grip</span><small>0 HTM</small></div>
    <div className="grip-controls explorer-grip-grid" role="group" aria-label="Grip rotations">
      {variants.flatMap(variant => ['x', 'y', 'z'].map(axis => <button type="button" key={axis + variant} aria-label={`Rotate ${axis}${variant}`} disabled={disabled} onClick={() => onMove(axis + variant)}>{axis}{variant}</button>))}
    </div>
  </>
}
