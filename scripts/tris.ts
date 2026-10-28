// Triangle count per unit model (for the render budget).
import { UNIT_DEFS } from '../src/sim/unitTypes';
import { UNIT_VISUALS, buildGeometry } from '../src/render/visuals';
for (let t = 0; t < UNIT_VISUALS.length; t++) {
  const g = buildGeometry(UNIT_VISUALS[t]);
  console.log(UNIT_DEFS[t].key.padEnd(8), (g.index ? g.index.count : g.getAttribute('position').count) / 3, 'tris', g.getAttribute('position').count, 'verts');
}
