// Offline oracle-fixture generator. No app engine or solver is imported.
// From the repository root:
// npm install --prefix .tools/cube-oracle --no-save --ignore-scripts cubejs@1.3.2
// node cubiq/scripts/generate-cube-fixtures.cjs
const fs = require('node:fs')
const path = require('node:path')
const oraclePath = path.resolve('.tools/cube-oracle/node_modules/cubejs')
const Cube = require(oraclePath)
const oraclePackage = require(path.join(oraclePath, 'package.json'))
if (oraclePackage.version !== '1.3.2') throw new Error('Expected cubejs 1.3.2')

let seed = 0xc0be1b
function integer(max) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return Math.floor((seed / 0x100000000) * max)
}
function shuffle(size) {
  const values = Array.from({ length: size }, (_, i) => i)
  for (let i = size - 1; i > 0; i--) {
    const j = integer(i + 1)
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values
}
function parity(values) {
  return values.reduce((sum, value, i) => sum + values.slice(i + 1).filter(v => value > v).length, 0) % 2
}
function sequence(rotations) {
  const faces = rotations ? 'URFDLBxyz' : 'URFDLB'
  return Array.from({ length: integer(40) + 1 }, () => faces[integer(faces.length)] + ['', '2', "'"][integer(3)]).join(' ')
}
function reference(sequence) {
  const cube = new Cube().move(sequence)
  return { sequence, facelets: cube.asString() }
}
const named = ['', ...'URFDLBxyz'.split('').flatMap(m => [m, m + "'", m + '2']),
  "R U R' U'", "R U R' U R U2 R'", "F R U R' U' F'", "x y R U2 z' F' D L2 B"]
const references = named.map(reference)
const random = Array.from({ length: 1000 }, (_, i) => reference(sequence(i >= 500)))
const arbitrary = Array.from({ length: 128 }, () => {
  const cp = shuffle(8), ep = shuffle(12)
  if (parity(cp) !== parity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]]
  const co = Array.from({ length: 7 }, () => integer(3))
  co.push((3 - co.reduce((a, b) => a + b, 0) % 3) % 3)
  const eo = Array.from({ length: 11 }, () => integer(2))
  eo.push(eo.reduce((a, b) => a + b, 0) % 2)
  const state = { cp, co, ep, eo, frame: 'URFDLB', schema_version: 1 }
  const moves = sequence(true)
  const cube = new Cube({ cp, co, ep, eo, center: [0, 1, 2, 3, 4, 5] })
  return { state, initial_facelets: cube.asString(), sequence: moves, facelets: cube.move(moves).asString() }
})
const metadata = {
  oracle: 'cubejs', version: oraclePackage.version, license: 'MIT', seed: '0xc0be1b',
  source: 'https://github.com/ldez/cubejs',
  generator: 'cubiq/scripts/generate-cube-fixtures.cjs',
  note: 'Oracle output only. Cubejs does not validate our engine; comparisons do. No solver initialized.',
}
const destination = path.resolve('cubiq/backend/tests/fixtures/cubejs-1.3.2.json')
fs.mkdirSync(path.dirname(destination), { recursive: true })
// One record per line keeps the corpus compact and reviewable.
const lines = Object.entries(metadata).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
for (const [key, values] of Object.entries({ references, random, arbitrary })) {
  lines.push(`${JSON.stringify(key)}:[\n${values.map(value => JSON.stringify(value)).join(',\n')}\n]`)
}
fs.writeFileSync(destination, '{\n' + lines.join(',\n') + '\n}\n')
console.log(`Generated ${references.length} named, ${random.length} seeded, ${arbitrary.length} arbitrary-state cases: ${destination}`)
