import { readFileSync } from 'fs';
import { parseXML } from './src/phase1.js';
import { phase2 } from './src/phase2.js';
import { applyConfig } from './src/phase2.js';

const xml = readFileSync('test-data/real-world/output-4outputs.bpmn', 'utf-8');
const graph = parseXML(xml);

const config = { laneOrientation: 'horizontal' };
const directions = applyConfig(config);

const { positions, flowInfos } = phase2(
  graph.elements,
  graph.flows,
  graph.lanes,
  directions,
  []
);

console.log('\n=== POSITIONS ===');
positions.forEach((pos, id) => {
  console.log(`${id}: lane=${pos.lane}, layer=${pos.layer}, row=${pos.row}`);
});

console.log('\n=== FLOW INFOS ===');
flowInfos.forEach((info, id) => {
  console.log(`${id}: ${info.sourceId} → ${info.targetId}, exitSide=${info.source?.exitSide}, waypoints=${info.waypoints?.length || 0}`);
});
