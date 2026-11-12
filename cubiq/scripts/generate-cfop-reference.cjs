// Independent test oracle. No application engine or registry is imported.
// Requires the existing optional cubejs@1.3.2 oracle and the preceding Python tool.
const fs = require('node:fs')
const path = require('node:path')
const oracle = path.resolve('.tools/cube-oracle/node_modules/cubejs')
const Cube = require(oracle)
if (require(path.join(oracle, 'package.json')).version !== '1.3.2') throw new Error('Expected cubejs 1.3.2')
const reference = JSON.parse(fs.readFileSync('.cache/cfop-reference/reference-algorithms.json', 'utf8'))
function fixed(raw) {
  const alg = raw.replace(/[()]/g, ' ').replace(/2'/g, '2').trim().replace(/\s+/g, ' ')
  const cube = new Cube().move(alg)
  return `${alg} ${cube.upright()}`.trim()
}
const cases = reference.cases.map(row => {
  const cube = new Cube().move(Cube.inverse(fixed(row.algorithm)))
  return { id: row.id, facelets: cube.asString() }
})
// Full 54-sticker transformations for compiler conformance, not just self-inversion.
const notation = [...'MESurfdlbxyz'].flatMap(face => ['', '2', "'"].map(suffix => {
  const original = face + suffix
  const cube = new Cube().move(fixed(original))
  return { original, canonical_facelets: cube.asString() }
}))
fs.writeFileSync('cubiq/backend/tests/fixtures/cfop-reference.json', JSON.stringify({
  source: reference.source, retrieved: reference.retrieved,
  source_sha256: reference.source_sha256, oracle: 'cubejs@1.3.2', cases, notation,
}, null, 2) + '\n')
