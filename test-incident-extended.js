import { readFileSync, writeFileSync } from 'fs';
import { layoutBPMN } from './src/index.js';

console.log("=== Testing Extended Incident Management ===\n");

const xml = readFileSync("test-data/incident-management-extended.bpmn", "utf-8");

const result = layoutBPMN(xml, {
  hideXorMergeGateways: true
});

if (result.success) {
  writeFileSync("viewer/incident-extended-output.bpmn", result.bpmnXml);
  console.log("✅ Generated viewer/incident-extended-output.bpmn");
  
  // Count elements
  const taskCount = (xml.match(/<bpmn:\w+Task /g) || []).length;
  const gatewayCount = (xml.match(/<bpmn:\w+Gateway /g) || []).length;
  const eventCount = (xml.match(/<bpmn:\w+Event /g) || []).length;
  const activityCount = (xml.match(/<bpmn:callActivity /g) || []).length;
  const subprocessCount = (xml.match(/<bpmn:subProcess /g) || []).length;
  
  console.log(`\nElement Count:`);
  console.log(`  Tasks: ${taskCount}`);
  console.log(`  Gateways: ${gatewayCount}`);
  console.log(`  Events: ${eventCount}`);
  console.log(`  Call Activities: ${activityCount}`);
  console.log(`  Subprocesses: ${subprocessCount}`);
  console.log(`  Total: ${taskCount + gatewayCount + eventCount + activityCount + subprocessCount}`);
} else {
  console.error("❌ Layout failed:");
  console.error(result.errors);
}
