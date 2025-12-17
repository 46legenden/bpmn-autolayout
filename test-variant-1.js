import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Test Variant 1: Task Ops 2 goes cross-lane ===\n");

const xml = readFileSync("test-data/test-variant-1.bpmn", "utf-8");

const result = layoutBPMN(xml, { hideXorMergeGateways: false });

if (result.success) {
  writeFileSync("viewer/test-variant-1-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/test-variant-1-output.bpmn");
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
