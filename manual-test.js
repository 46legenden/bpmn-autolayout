import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

// Test file
const testFile = process.argv[2] || 'test-data/real-world/output-4outputs.bpmn';

console.log(`\n=== MANUAL TEST: ${testFile} ===\n`);

// Read input
const inputXml = readFileSync(testFile, 'utf-8');
console.log(`Input file size: ${inputXml.length} bytes`);

// Apply layout
console.log('\nApplying layout...');
const result = layoutBPMN(inputXml, {
  laneOrientation: 'horizontal'
});

// Check result
if (result.success) {
  console.log('✅ Layout successful!');
  console.log(`Output file size: ${result.bpmnXml.length} bytes`);
  
  // Write output
  const outputFile = testFile.replace('.bpmn', '-layouted.bpmn');
  writeFileSync(outputFile, result.bpmnXml, 'utf-8');
  console.log(`\n✅ Output written to: ${outputFile}`);
  
  // Check for DI
  const hasDiagram = result.bpmnXml.includes('<bpmndi:BPMNDiagram');
  const hasShapes = result.bpmnXml.includes('<bpmndi:BPMNShape');
  const hasEdges = result.bpmnXml.includes('<bpmndi:BPMNEdge');
  const hasBounds = result.bpmnXml.includes('<dc:Bounds');
  const hasWaypoints = result.bpmnXml.includes('<di:waypoint');
  
  console.log('\nBPMN DI Check:');
  console.log(`  BPMNDiagram: ${hasDiagram ? '✅' : '❌'}`);
  console.log(`  BPMNShape: ${hasShapes ? '✅' : '❌'}`);
  console.log(`  BPMNEdge: ${hasEdges ? '✅' : '❌'}`);
  console.log(`  Bounds: ${hasBounds ? '✅' : '❌'}`);
  console.log(`  Waypoints: ${hasWaypoints ? '✅' : '❌'}`);
  
} else {
  console.log('❌ Layout failed!');
  console.log('Errors:', result.errors);
}

console.log('\n=== TEST COMPLETE ===\n');
