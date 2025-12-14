import { parseXML, validateBPMN, preProcess, detectBackEdges } from './src/phase1.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

// Phase 1
const graph = parseXML(input);
validateBPMN(graph);
const processedGraph = preProcess(graph, {});
const backEdges = detectBackEdges(processedGraph);

const { elements, flows } = processedGraph;

console.log('📊 Elements:', elements.size);
console.log('📊 Flows:', flows.size);
console.log('📊 BackEdges:', backEdges?.size || 0);

console.log('\n📋 Element incoming/outgoing:');
for (const [id, element] of elements) {
  console.log(`${id}: in=${element.incoming?.length || 0}, out=${element.outgoing?.length || 0}`);
}

console.log('\n📋 Flows:');
for (const [id, flow] of flows) {
  console.log(`${id}: ${flow.sourceRef} → ${flow.targetRef}`);
}

// Check for elements with no incoming flows (should be start events)
console.log('\n🎯 Elements with no incoming flows:');
for (const [id, element] of elements) {
  if (!element.incoming || element.incoming.length === 0) {
    console.log(`   ${id} (${element.type})`);
  }
}

// Check for elements with no outgoing flows (should be end events)
console.log('\n🏁 Elements with no outgoing flows:');
for (const [id, element] of elements) {
  if (!element.outgoing || element.outgoing.length === 0) {
    console.log(`   ${id} (${element.type})`);
  }
}
