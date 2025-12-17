import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Test Variant 2: Task Ops 2 goes to Support, Support goes to Merge ===\n");

const xml = readFileSync("test-data/test-variant-2.bpmn", "utf-8");

const result = layoutBPMN(xml, { hideXorMergeGateways: false });

if (result.success) {
  writeFileSync("viewer/test-variant-2-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/test-variant-2-output.bpmn");
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
