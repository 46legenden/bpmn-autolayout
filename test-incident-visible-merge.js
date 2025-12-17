import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

const xml = readFileSync("test-data/incident-management-complex.bpmn", "utf-8");

// Test with hideXorMergeGateways: false (merge gateways should be visible)
const result = layoutBPMN(xml, {
  hideXorMergeGateways: false
});

if (result.success) {
  writeFileSync("viewer/incident-visible-merge.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/incident-visible-merge.bpmn");
  console.log("   Config: hideXorMergeGateways = false");
  console.log("   Expected: gateway3_merge should be VISIBLE");
} else {
  console.error("❌ Error:", result.errors);
}
