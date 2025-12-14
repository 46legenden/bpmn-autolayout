import { layoutBPMN } from './src/index.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-order-processing.bpmn', 'utf-8');
const expected = readFileSync('test-data/real-world/output-order-processing-layouted.bpmn', 'utf-8');

const result = layoutBPMN(input, { laneOrientation: 'horizontal' });

if (result.success) {
  // Find differences
  const actualLines = result.bpmnXml.split('\n');
  const expectedLines = expected.split('\n');
  
  console.log('Checking for differences...\n');
  
  let diffCount = 0;
  for (let i = 0; i < Math.max(actualLines.length, expectedLines.length); i++) {
    if (actualLines[i] !== expectedLines[i]) {
      diffCount++;
      if (diffCount <= 10) {
        console.log(`Line ${i + 1}:`);
        console.log(`  Expected: ${expectedLines[i]}`);
        console.log(`  Actual:   ${actualLines[i]}`);
        console.log('');
      }
    }
  }
  
  console.log(`Total differences: ${diffCount}`);
}
