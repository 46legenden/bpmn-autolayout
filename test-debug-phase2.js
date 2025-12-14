import { parseXML, validateBPMN, preProcess, detectBackEdges } from './src/phase1.js';
import { applyConfig, phase2 } from './src/phase2.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

// Phase 1
const graph = parseXML(input);
console.log('📖 Phase 1 - Parse:', graph.success ? '✅' : '❌');
console.log('   Elements:', graph.elements?.size);
console.log('   Flows:', graph.flows?.size);

validateBPMN(graph);
console.log('✅ Phase 1 - Validate:', graph.success ? '✅' : '❌');

const processedGraph = preProcess(graph, {});
console.log('✅ Phase 1 - PreProcess');
console.log('   Elements after:', processedGraph.elements.size);
console.log('   Flows after:', processedGraph.flows.size);

const backEdges = detectBackEdges(processedGraph);
console.log('✅ Phase 1 - BackEdges:', backEdges.size);

const { elements, flows, lanes } = processedGraph;

// Phase 2
const directions = applyConfig({ laneOrientation: 'horizontal' });
console.log('\n📊 Phase 2 - Starting...');

try {
  const phase2Result = phase2(elements, flows, lanes, directions, backEdges);
  console.log('✅ Phase 2 - Complete');
  console.log('   Positions:', phase2Result.positions.size);
  console.log('   FlowInfos:', phase2Result.flowInfos.size);
  
  // Check which elements have positions
  console.log('\n📍 Elements with positions:');
  for (const [id, pos] of phase2Result.positions) {
    console.log(`   ${id}: lane=${pos.lane}, layer=${pos.layer}, row=${pos.row}`);
  }
  
  // Check which elements don't have positions
  console.log('\n❌ Elements without positions:');
  for (const [id] of elements) {
    if (!phase2Result.positions.has(id)) {
      console.log(`   ${id}`);
    }
  }
} catch (error) {
  console.error('❌ Phase 2 Error:', error.message);
  console.error(error.stack);
}
