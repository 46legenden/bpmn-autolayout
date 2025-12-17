import { readFileSync } from 'fs';

const xml = readFileSync("viewer/incident-management-output.bpmn", "utf-8");

console.log("=== LANE BOUNDS ===\n");

const lanes = ['lane1', 'lane1a', 'lane1b', 'lane2', 'lane2a', 'lane2b', 'lane3', 'lane3a', 'lane3b', 'lane4'];

for (const laneId of lanes) {
  const match = xml.match(new RegExp(`<bpmndi:BPMNShape id="${laneId}_di"[^>]*>[\\s\\S]*?<dc:Bounds x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`));
  if (match) {
    const x = parseInt(match[1]);
    const width = parseInt(match[3]);
    const rightEdge = x + width;
    console.log(`${laneId.padEnd(6)}: x=${x.toString().padStart(3)}, width=${width.toString().padStart(4)}, rightEdge=${rightEdge}`);
  }
}
