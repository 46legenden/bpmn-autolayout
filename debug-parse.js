import { readFileSync } from 'fs';
import { parseXML } from './src/phase1.js';

const xml = readFileSync('test-data/real-world/output-4outputs.bpmn', 'utf-8');
const graph = parseXML(xml);

console.log('\n=== PARSED ELEMENTS ===');
graph.elements.forEach((el, id) => {
  console.log(`${id}: incoming=[${el.incoming.join(', ')}] outgoing=[${el.outgoing.join(', ')}]`);
});

console.log('\n=== PARSED FLOWS ===');
graph.flows.forEach((flow, id) => {
  console.log(`${id}: ${flow.sourceRef} → ${flow.targetRef}`);
});
