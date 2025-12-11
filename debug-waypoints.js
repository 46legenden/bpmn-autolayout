import { readFileSync } from 'fs';
import { parseXML, preProcess, detectBackEdges } from './src/phase1.js';
import { applyConfig, phase2 } from './src/phase2.js';

const bpmnXml = readFileSync('test-data/real-world/output-4outputs.bpmn', 'utf-8');

// Phase 1
const graph = parseXML(bpmnXml);
if (!graph.success) {
  console.error('Parse failed:', graph.errors);
  process.exit(1);
}

const preprocessed = preProcess(graph);
const backEdges = detectBackEdges(preprocessed);
const backEdgeSet = new Set(backEdges);

// Phase 2
const directions = applyConfig({ laneOrientation: 'horizontal' });
const phase2Result = phase2(
  preprocessed.elements,
  preprocessed.flows,
  preprocessed.lanes,
  directions,
  backEdges
);

// Check positions
console.log('\n=== POSITIONS ===');
console.log('task2:', phase2Result.positions.get('task2'));
console.log('end1:', phase2Result.positions.get('end1'));

// Check flow info
console.log('\n=== FLOW INFO (f7) ===');
const f7 = phase2Result.flowInfos.get('f7');
console.log('Source:', f7.source);
console.log('Target:', f7.target);
console.log('Waypoints:', f7.waypoints);

console.log('\n=== FLOW INFO (f1 - same lane) ===');
const f1 = phase2Result.flowInfos.get('f1');
console.log('Source:', f1.source);
console.log('Target:', f1.target);
console.log('Waypoints:', f1.waypoints);

console.log('\n=== FLOW INFO (f2 - same lane) ===');
const f2 = phase2Result.flowInfos.get('f2');
console.log('Source:', f2.source);
console.log('Target:', f2.target);
console.log('Waypoints:', f2.waypoints);

console.log('\n=== FLOW INFO (f3 - gateway output) ===');
const f3 = phase2Result.flowInfos.get('f3');
console.log('Source:', f3.source);
console.log('Target:', f3.target);
console.log('Waypoints:', f3.waypoints);
