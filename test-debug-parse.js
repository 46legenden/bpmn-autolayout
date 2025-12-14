import { parseXML } from './src/phase1.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

const graph = parseXML(input);

console.log('📊 Parse result:', graph.success ? '✅' : '❌');
console.log('📊 Elements:', graph.elements?.size);
console.log('📊 Flows:', graph.flows?.size);
console.log('📊 Lanes:', graph.lanes?.size);

console.log('\n📋 Parsed elements:');
for (const [id, element] of graph.elements) {
  console.log(`   ${id}: ${element.type}`);
}

console.log('\n📋 Expected elements from XML:');
const expectedElements = [
  'start1', 'task1', 'task2', 'task3', 'gw1',
  'task4', 'event1', 'task5', 'task6', 'gw2',
  'task7', 'task8', 'gw3', 'event2', 'task9',
  'gw4', 'task10', 'task11', 'end1'
];

for (const id of expectedElements) {
  const exists = graph.elements.has(id);
  console.log(`   ${id}: ${exists ? '✅' : '❌ MISSING'}`);
}
