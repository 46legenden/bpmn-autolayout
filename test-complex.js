import { layoutBPMN } from './src/index.js';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');
const result = layoutBPMN(input, { laneOrientation: 'horizontal' });

if (result.success) {
  writeFileSync('viewer/output-real-world-complex.bpmn', result.bpmnXml);
  console.log('✅ Generated: viewer/output-real-world-complex.bpmn');
  console.log('📊 View: https://8080-igt4bgol5bngkce8d4e1z-beabe362.manusvm.computer/index.html?diagram=output-real-world-complex.bpmn');
} else {
  console.log('❌ Error:', result.error);
}
