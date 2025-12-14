import { layoutBPMN } from './src/index.js';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');
console.log('📖 Input BPMN length:', input.length);

const result = layoutBPMN(input, { laneOrientation: 'horizontal' });

console.log('📊 Result:', {
  success: result.success,
  error: result.error,
  bpmnXmlLength: result.bpmnXml?.length,
  elementsCount: result.elements?.length,
  flowsCount: result.flows?.length
});

if (result.success) {
  console.log('✅ Elements:', result.elements?.map(e => e.id).join(', '));
  console.log('✅ Flows:', result.flows?.map(f => f.id).join(', '));
  
  writeFileSync('viewer/output-real-world-complex.bpmn', result.bpmnXml);
  console.log('✅ Generated: viewer/output-real-world-complex.bpmn');
} else {
  console.log('❌ Error:', result.error);
}
