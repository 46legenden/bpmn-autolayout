import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Testing Minimal Parallel Gateway ===\n");

const xml = readFileSync("test-data/minimal-parallel-test.bpmn", "utf-8");

const result = layoutBPMN(xml, {
  hideXorMergeGateways: false
});

if (result.success) {
  writeFileSync("viewer/minimal-parallel-test-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/minimal-parallel-test-output.bpmn");
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
