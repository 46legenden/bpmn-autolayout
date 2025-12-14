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

// Analyze f20 backflow
const f20 = flows.get('f20');
const sourcePos = phase2Result.positions.get(f20.sourceRef); // task10
const targetPos = phase2Result.positions.get(f20.targetRef); // task3

console.log('🔍 Analyzing f20 backflow (Reopen Ticket → Review Ticket)\n');

console.log('Source (task10 - Reopen Ticket):');
console.log('  Lane:', sourcePos.lane);
console.log('  Layer:', sourcePos.layer);
console.log('  Row:', sourcePos.row);

console.log('\nTarget (task3 - Review Ticket):');
console.log('  Lane:', targetPos.lane);
console.log('  Layer:', targetPos.layer);
console.log('  Row:', targetPos.row);

// Check lane comparison
const laneOrder = Array.from(lanes.keys());
console.log('\nLane Order:', laneOrder);

const sourceIndex = laneOrder.indexOf(sourcePos.lane);
const targetIndex = laneOrder.indexOf(targetPos.lane);

console.log('\nSource Lane Index:', sourceIndex);
console.log('Target Lane Index:', targetIndex);

const targetIsAbove = targetIndex < sourceIndex;
const targetIsBelow = targetIndex > sourceIndex;
const targetIsLeft = targetPos.layer < sourcePos.layer;

console.log('\nDirection Checks:');
console.log('  targetIsAbove:', targetIsAbove);
console.log('  targetIsBelow:', targetIsBelow);
console.log('  targetIsLeft:', targetIsLeft);

console.log('\nExpected Exit Side: UP (oppCrossLane)');
console.log('Directions:', directions);

// Check if same lane
if (sourcePos.lane === targetPos.lane) {
  console.log('\n⚠️  SAME LANE! Using row comparison instead of lane index');
  const targetIsAboveRow = targetPos.row < sourcePos.row;
  const targetIsBelowRow = targetPos.row > sourcePos.row;
  console.log('  targetIsAbove (row):', targetIsAboveRow);
  console.log('  targetIsBelow (row):', targetIsBelowRow);
}
