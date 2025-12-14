import { layoutBPMN } from './src/index.js';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

try {
  const result = layoutBPMN(input, { laneOrientation: 'horizontal' });
  
  if (result.success) {
    writeFileSync('viewer/output-real-world-complex.bpmn', result.bpmnXml);
    console.log('✅ Generated successfully');
  } else {
    console.log('❌ Error:', result.errors);
  }
} catch (error) {
  console.error('❌ Exception:', error.message);
  console.error(error.stack);
}
