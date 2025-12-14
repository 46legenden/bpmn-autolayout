import { parseXML, validateBPMN, preProcess, detectBackEdges } from './src/phase1.js';
import { applyConfig, phase2 } from './src/phase2.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

// Phase 1
const graph = parseXML(input);
validateBPMN(graph);
const processedGraph = preProcess(graph, {});
const backEdges = detectBackEdges(processedGraph);

const { elements, flows, lanes } = processedGraph;

// Phase 2
const directions = applyConfig({ laneOrientation: 'horizontal' });
const phase2Result = phase2(elements, flows, lanes, directions, backEdges);

console.log('📊 Analyzing layer assignments...\n');

// Group elements by layer
const layerMap = new Map();
for (const [id, pos] of phase2Result.positions) {
  if (!layerMap.has(pos.layer)) {
    layerMap.set(pos.layer, []);
  }
  layerMap.get(pos.layer).push({ id, ...pos });
}

// Sort layers
const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b);

console.log('📋 Elements by Layer:\n');
for (const layer of sortedLayers) {
  const els = layerMap.get(layer);
  console.log(`Layer ${layer}:`);
  for (const el of els) {
    const element = elements.get(el.id);
    console.log(`  ${el.id} (${element.type}) - lane: ${el.lane}, row: ${el.row}`);
  }
  console.log('');
}

// Analyze flows between layers
console.log('📋 Flows Analysis:\n');

const problemFlows = [];

for (const [flowId, flow] of flows) {
  const sourcePos = phase2Result.positions.get(flow.sourceRef);
  const targetPos = phase2Result.positions.get(flow.targetRef);
  
  if (!sourcePos || !targetPos) continue;
  
  const sourceLane = sourcePos.lane;
  const targetLane = targetPos.lane;
  const sourceLayer = sourcePos.layer;
  const targetLayer = targetPos.layer;
  
  const isCrossLane = sourceLane !== targetLane;
  const layerDiff = targetLayer - sourceLayer;
  
  console.log(`${flowId}: ${flow.sourceRef} (L${sourceLayer}, ${sourceLane}) → ${flow.targetRef} (L${targetLayer}, ${targetLane})`);
  
  if (isCrossLane) {
    console.log(`  ⚠️  Cross-Lane Flow (${sourceLane} → ${targetLane})`);
    
    // Check if there are other flows in the same layer
    const sameLayerFlows = [];
    for (const [fId, f] of flows) {
      if (fId === flowId) continue;
      const sPos = phase2Result.positions.get(f.sourceRef);
      const tPos = phase2Result.positions.get(f.targetRef);
      if (!sPos || !tPos) continue;
      
      // Check if this flow uses the same layer
      if (sPos.layer === sourceLayer || tPos.layer === sourceLayer ||
          sPos.layer === targetLayer || tPos.layer === targetLayer) {
        sameLayerFlows.push({
          id: fId,
          from: f.sourceRef,
          to: f.targetRef,
          fromLane: sPos.lane,
          toLane: tPos.lane,
          fromLayer: sPos.layer,
          toLayer: tPos.layer
        });
      }
    }
    
    if (sameLayerFlows.length > 0) {
      console.log(`  📍 Other flows in layers ${sourceLayer}-${targetLayer}:`);
      for (const sf of sameLayerFlows) {
        const sfCrossLane = sf.fromLane !== sf.toLane;
        console.log(`    ${sf.id}: ${sf.from} (L${sf.fromLayer}, ${sf.fromLane}) → ${sf.to} (L${sf.toLayer}, ${sf.toLane}) ${sfCrossLane ? '⚠️ CROSS-LANE' : ''}`);
      }
    }
  }
  
  console.log('');
}

// Specific problem: f2 and f3
console.log('\n🔍 Analyzing the specific problem (f2 and f3):\n');

const f2 = flows.get('f2');
const f3 = flows.get('f3');

const f2Source = phase2Result.positions.get(f2.sourceRef);
const f2Target = phase2Result.positions.get(f2.targetRef);
const f3Source = phase2Result.positions.get(f3.sourceRef);
const f3Target = phase2Result.positions.get(f3.targetRef);

console.log('f2:', f2.sourceRef, '→', f2.targetRef);
console.log('  Source:', f2.sourceRef, '- Layer', f2Source.layer, ', Lane', f2Source.lane);
console.log('  Target:', f2.targetRef, '- Layer', f2Target.layer, ', Lane', f2Target.lane);
console.log('  Direction:', f2Source.lane, '→', f2Target.lane, '(DOWN)');

console.log('\nf3:', f3.sourceRef, '→', f3.targetRef);
console.log('  Source:', f3.sourceRef, '- Layer', f3Source.layer, ', Lane', f3Source.lane);
console.log('  Target:', f3.targetRef, '- Layer', f3Target.layer, ', Lane', f3Target.lane);
console.log('  Direction:', f3Source.lane, '→', f3Target.lane, '(UP)');

console.log('\n❌ PROBLEM: Both flows use Layer 1, but go in opposite vertical directions!');
console.log('   f2 goes DOWN (customer → system)');
console.log('   f3 goes UP (system → agent)');
console.log('   This creates a visual conflict in Layer 1!');
