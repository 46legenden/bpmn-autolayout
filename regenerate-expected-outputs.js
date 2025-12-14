import { layoutBPMN } from './src/index.js';
import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Regenerating all expected test outputs with current code...\n');

const testCases = [
  {
    input: 'test-data/real-world/input-order-processing.bpmn',
    output: 'test-data/real-world/output-order-processing-layouted.bpmn',
    name: 'Order Processing'
  },
  {
    input: 'test-data/real-world/input-4outputs.bpmn',
    output: 'test-data/real-world/output-4outputs-layouted.bpmn',
    name: '4 Outputs'
  },
  {
    input: 'test-data/real-world/input-mixed-gateway-outputs.bpmn',
    output: 'test-data/real-world/output-mixed-gateway-outputs-layouted.bpmn',
    name: 'Mixed Gateway Outputs'
  }
];

let successCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  try {
    const inputXml = readFileSync(testCase.input, 'utf-8');
    const result = layoutBPMN(inputXml, { laneOrientation: 'horizontal' });
    
    if (result.success) {
      writeFileSync(testCase.output, result.bpmnXml);
      console.log(`✅ ${testCase.name}: ${testCase.output}`);
      successCount++;
    } else {
      console.log(`❌ ${testCase.name}: Layout failed`);
      failCount++;
    }
  } catch (error) {
    console.log(`❌ ${testCase.name}: ${error.message}`);
    failCount++;
  }
}

console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);

if (failCount === 0) {
  console.log('\n✅ All expected outputs regenerated successfully!');
  console.log('👉 Run "npm test" to verify tests pass');
} else {
  console.log('\n⚠️  Some outputs failed to regenerate!');
  process.exit(1);
}
