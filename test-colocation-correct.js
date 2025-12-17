import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Testing Co-Location CMDB (Correct Version) ===\n");

const xml = readFileSync("test-data/colocation-cmdb-correct.bpmn", "utf-8");

const result = layoutBPMN(xml, { hideXorMergeGateways: false });

if (result.success) {
  writeFileSync("viewer/colocation-cmdb-correct-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/colocation-cmdb-correct-output.bpmn");
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
