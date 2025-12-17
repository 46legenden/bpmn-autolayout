import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

const xml = readFileSync("test-data/incident-management-complex.bpmn", "utf-8");
const result = layoutBPMN(xml);

if (result.success) {
  writeFileSync("viewer/incident-management-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/incident-management-output.bpmn");
} else {
  console.error("❌ Error:", result.errors);
}
