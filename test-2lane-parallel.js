import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Testing 2-Lane Parallel Gateway ===\n");

const xml = readFileSync("test-data/minimal-2lane-parallel.bpmn", "utf-8");

const result = layoutBPMN(xml, {
  hideXorMergeGateways: false
});

if (result.success) {
  writeFileSync("viewer/minimal-2lane-parallel-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/minimal-2lane-parallel-output.bpmn");
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
