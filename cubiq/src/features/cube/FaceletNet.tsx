import type { CubeSnapshot } from '../../api/cube'

export function FaceletNet({ snapshot }: { snapshot: CubeSnapshot }) {
  return <div className="cube-net" aria-label="Cube facelet net returned by the backend">
    {snapshot.faces.map(face => <div key={face.face} className={`net-face net-${face.face}`}>
      <div className="face-label">{face.face}<span>center {face.center}</span></div>
      <div className="sticker-grid">{Array.from(face.stickers, (color, index) => <span className="sticker" key={index} style={{ backgroundColor: snapshot.palette[color] }} title={`${face.face}${index + 1}: ${color}`} aria-label={`${face.face}${index + 1}: ${color}`}><span>{color}</span></span>)}</div>
    </div>)}
  </div>
}
