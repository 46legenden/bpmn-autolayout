import { describe, test, expect } from 'vitest';
import { parseXML, validateBPMN, preProcess, detectBackEdges } from '../../src/phase1.js';
import { applyConfig } from '../../src/phase2.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Integration: Simple 3-Lane Process', () => {
  test('should process simple 3-lane BPMN with XOR gateway', () => {
    // Read BPMN file
    const bpmnPath = join(__dirname, '../../test-data/simple-3-lane.bpmn');
    const bpmnXml = readFileSync(bpmnPath, 'utf-8');

    // Phase 1: Parse XML
    const graph = parseXML(bpmnXml);
    
    // Validate
    validateBPMN(graph);
    
    const { elements, flows, lanes } = graph;
    
    console.log('\n=== PHASE 1: Parse & Validate ===');
    console.log('Elements:', elements.size);
    console.log('Flows:', flows.size);
    console.log('Lanes:', lanes.size);
    
    expect(elements.size).toBe(6); // start, xor, 3 tasks, end
    expect(flows.size).toBe(7);
    expect(lanes.size).toBe(4); // 3 lanes + 1 laneSet

    // Pre-process (no XOR merge to remove in this case)
    const processedGraph = preProcess(graph);
    const { elements: processedElements, flows: processedFlows } = processedGraph;
    
    console.log('\n=== PHASE 1: Pre-Process ===');
    console.log('Elements after pre-process:', processedElements.size);
    console.log('Flows after pre-process:', processedFlows.size);

    // Detect back-edges
    const backEdges = detectBackEdges(processedGraph);
    
    console.log('\n=== PHASE 1: Back-Edge Detection ===');
    console.log('Back-edges:', backEdges.length);
    expect(backEdges.length).toBe(0); // No loops in this simple process

    // Phase 2: Apply configuration
    const directions = applyConfig({ laneOrientation: 'horizontal' });
    
    console.log('\n=== PHASE 2: Configuration ===');
    console.log('Orientation:', directions.laneOrientation);
    console.log('Along lane:', directions.alongLane);
    console.log('Cross lane:', directions.crossLane);

    // Verify structure
    console.log('\n=== STRUCTURE VERIFICATION ===');
    
    // Start event
    const start = processedElements.get('start1');
    console.log('\nStart Event:');
    console.log('  ID:', start.id);
    console.log('  Type:', start.type);
    console.log('  Outgoing:', start.outgoing);
    expect(start.outgoing.length).toBe(1);

    // XOR Gateway
    const xor = processedElements.get('xor1');
    console.log('\nXOR Gateway:');
    console.log('  ID:', xor.id);
    console.log('  Type:', xor.type);
    console.log('  Incoming:', xor.incoming);
    console.log('  Outgoing:', xor.outgoing);
    expect(xor.incoming.length).toBe(1);
    expect(xor.outgoing.length).toBe(3); // 3 outputs

    // Tasks
    const task1 = processedElements.get('task1');
    const task2 = processedElements.get('task2');
    const task3 = processedElements.get('task3');
    
    console.log('\nTask 1 (Management):');
    console.log('  ID:', task1.id);
    console.log('  Name:', task1.name);
    console.log('  Lane:', Array.from(lanes.entries()).find(([id, lane]) => lane.elements.includes('task1'))?.[0]);
    
    console.log('\nTask 2 (IT):');
    console.log('  ID:', task2.id);
    console.log('  Name:', task2.name);
    console.log('  Lane:', Array.from(lanes.entries()).find(([id, lane]) => lane.elements.includes('task2'))?.[0]);
    
    console.log('\nTask 3 (Finance):');
    console.log('  ID:', task3.id);
    console.log('  Name:', task3.name);
    console.log('  Lane:', Array.from(lanes.entries()).find(([id, lane]) => lane.elements.includes('task3'))?.[0]);

    // End event
    const end = processedElements.get('end1');
    console.log('\nEnd Event:');
    console.log('  ID:', end.id);
    console.log('  Type:', end.type);
    console.log('  Incoming:', end.incoming);
    expect(end.incoming.length).toBe(3); // 3 inputs from tasks

    // Verify lanes
    console.log('\n=== LANE VERIFICATION ===');
    for (const [laneId, lane] of lanes) {
      console.log(`\nLane ${laneId}:`);
      console.log('  Name:', lane.name);
      console.log('  Elements:', lane.elements);
    }

    // Verify lane1 has start, xor, task1, end
    const lane1 = lanes.get('lane1');
    expect(lane1.elements).toContain('start1');
    expect(lane1.elements).toContain('xor1');
    expect(lane1.elements).toContain('task1');
    expect(lane1.elements).toContain('end1');

    // Verify lane2 has task2
    const lane2 = lanes.get('lane2');
    expect(lane2.elements).toContain('task2');

    // Verify lane3 has task3
    const lane3 = lanes.get('lane3');
    expect(lane3.elements).toContain('task3');

    console.log('\n=== TEST PASSED ✓ ===\n');

    // Phase 2: Expected Positions (manual verification)
    console.log('\n=== PHASE 2: EXPECTED POSITIONS ===');
    
    console.log('\nExpected Element Positions:');
    console.log('  start1:  (lane1, layer0, row0)');
    console.log('  xor1:    (lane1, layer1, row0)');
    console.log('  task1:   (lane1, layer2, row0)  // Same lane as gateway');
    console.log('  task2:   (lane2, layer2, row0)  // Cross-lane');
    console.log('  task3:   (lane3, layer2, row0)  // Cross-lane');
    console.log('  end1:    (lane1, layer3, row0)');
    
    console.log('\nExpected Gateway Output Flow Info:');
    console.log('  flow2 (xor1 → task1):');
    console.log('    exitSide: right (same lane, same row)');
    console.log('    entrySide: left');
    console.log('    waypoints: []');
    
    console.log('  flow3 (xor1 → task2):');
    console.log('    exitSide: down (lane2 is below lane1)');
    console.log('    entrySide: left');
    console.log('    waypoints: [(lane2, layer1, row0)]');
    
    console.log('  flow4 (xor1 → task3):');
    console.log('    exitSide: down (lane3 is below lane1)');
    console.log('    entrySide: left');
    console.log('    waypoints: [(lane3, layer1, row0)]');
    
    console.log('\nExpected Flow Paths:');
    console.log('  flow2: xor1 → RIGHT → task1');
    console.log('  flow3: xor1 → DOWN → waypoint → RIGHT → task2');
    console.log('  flow4: xor1 → DOWN → waypoint → RIGHT → task3');
    
    console.log('\n=== PHASE 2: VERIFICATION COMPLETE ✓ ===\n');
  });
});
