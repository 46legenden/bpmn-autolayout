import { describe, test, expect } from 'vitest';
import {
  applyConfig,
  initializeMatrix,
  assignGatewayLanes,
  assignSameLanePosition,
  assignGatewayOutputPositions,
  sortGatewayOutputs,
  isCrossLanePathFree,
  createSameLaneFlowInfo,
  createGatewayOutputFlowInfo,
  createCrossLaneFreeFlowInfo,
  createCrossLaneBlockedFlowInfo
} from '../../src/phase2.js';

describe('Phase 2: Complex Example 1 - Gateway with 3 Outputs', () => {
  test('should handle gateway with 2 same-lane and 1 cross-lane outputs', () => {
    /**
     * Diagram:
     * Lane1: [Start] → [XOR] → [TaskA]
     *                     ↓
     *                   [TaskB]
     *                     ↓
     * Lane2:          [TaskC]
     */

    console.log('\n=== COMPLEX TEST 1: Gateway with 3 Outputs ===\n');

    // Setup: Elements
    const elements = new Map([
      ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: ['flow1'] }],
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1'], outgoing: ['flow2', 'flow3', 'flow4'] }],
      ['taskA', { id: 'taskA', type: 'task', incoming: ['flow2'], outgoing: [] }],
      ['taskB', { id: 'taskB', type: 'task', incoming: ['flow3'], outgoing: [] }],
      ['taskC', { id: 'taskC', type: 'task', incoming: ['flow4'], outgoing: [] }]
    ]);

    // Setup: Flows
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'xor1' }],
      ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'taskA' }],
      ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'taskB' }],
      ['flow4', { id: 'flow4', sourceRef: 'xor1', targetRef: 'taskC' }]
    ]);

    // Setup: Lanes
    const lanes = new Map([
      ['lane1', { id: 'lane1', name: 'Lane 1', elements: ['start1', 'taskA', 'taskB'] }],
      ['lane2', { id: 'lane2', name: 'Lane 2', elements: ['taskC'] }]
    ]);

    // Setup: Config
    const config = { laneOrientation: 'horizontal' };
    const directions = applyConfig(config);

    // Step 1: Initialize Matrix
    const matrix = initializeMatrix(lanes);

    // Step 2: Assign Gateway Lanes
    const elementLanes = assignGatewayLanes(elements, flows, lanes);
    console.log('Element Lanes:');
    elementLanes.forEach((lane, elementId) => {
      console.log(`  ${elementId}: ${lane}`);
    });

    expect(elementLanes.get('xor1')).toBe('lane1');

    // Step 3: Position Elements
    const positions = new Map();

    // start1: Lane1, Layer 0
    positions.set('start1', { lane: 'lane1', layer: 0, row: 0 });

    // xor1: Same lane as start1, layer +1
    const xorPos = assignSameLanePosition('start1', 'xor1', positions, elementLanes);
    positions.set('xor1', xorPos);

    // Gateway outputs: taskA, taskB (lane1), taskC (lane2)
    const sortedOutputs = sortGatewayOutputs(['flow2', 'flow3', 'flow4'], flows, elementLanes, lanes, 'lane1');
    console.log('\nSorted Outputs:', sortedOutputs);

    const gatewayOutputPositions = assignGatewayOutputPositions('xor1', sortedOutputs, positions, elementLanes, flows);
    gatewayOutputPositions.forEach((pos, targetId) => {
      positions.set(targetId, pos);
    });

    console.log('\nPositions:');
    positions.forEach((pos, elementId) => {
      console.log(`  ${elementId}: lane=${pos.lane}, layer=${pos.layer}, row=${pos.row}`);
    });

    // Verify positions
    expect(positions.get('start1').layer).toBe(0);
    expect(positions.get('xor1').layer).toBe(1);
    
    // All outputs at layer 2
    expect(positions.get('taskA').layer).toBe(2);
    expect(positions.get('taskB').layer).toBe(2);
    expect(positions.get('taskC').layer).toBe(2);

    // Same-lane outputs (taskA, taskB) should have symmetric rows
    expect(positions.get('taskA').lane).toBe('lane1');
    expect(positions.get('taskB').lane).toBe('lane1');
    expect(positions.get('taskA').row).toBe(0);
    expect(positions.get('taskB').row).toBe(1);

    // Cross-lane output (taskC) should have row 0
    expect(positions.get('taskC').lane).toBe('lane2');
    expect(positions.get('taskC').row).toBe(0);

    // Step 4: Create Flow Infos
    const flowInfos = new Map();

    // flow1: start1 → xor1 (same-lane)
    flowInfos.set('flow1', createSameLaneFlowInfo('flow1', 'start1', 'xor1', positions, directions));

    // flow2: xor1 → taskA (gateway output)
    flowInfos.set('flow2', createGatewayOutputFlowInfo('flow2', 'xor1', 'taskA', positions, elementLanes, lanes, directions));

    // flow3: xor1 → taskB (gateway output)
    flowInfos.set('flow3', createGatewayOutputFlowInfo('flow3', 'xor1', 'taskB', positions, elementLanes, lanes, directions));

    // flow4: xor1 → taskC (gateway output)
    flowInfos.set('flow4', createGatewayOutputFlowInfo('flow4', 'xor1', 'taskC', positions, elementLanes, lanes, directions));

    console.log('\nFlow Infos:');
    flowInfos.forEach((info, flowId) => {
      console.log(`  ${flowId}:`);
      console.log(`    source: ${info.sourceId} exitSide=${info.source.exitSide}`);
      if (info.waypoints.length > 0) {
        info.waypoints.forEach((wp, idx) => {
          console.log(`    waypoint[${idx}]: (${wp.lane}, ${wp.layer}, ${wp.row})`);
        });
      }
      console.log(`    target: ${info.targetId} entrySide=${info.target.entrySide}`);
    });

    // Verify flow infos
    const flow1Info = flowInfos.get('flow1');
    expect(flow1Info.source.exitSide).toBe('right');
    expect(flow1Info.target.entrySide).toBe('left');

    const flow2Info = flowInfos.get('flow2');
    expect(flow2Info.source.exitSide).toBe('right');  // Same row, no waypoint
    expect(flow2Info.target.entrySide).toBe('left');
    expect(flow2Info.waypoints.length).toBe(0);

    const flow3Info = flowInfos.get('flow3');
    expect(flow3Info.source.exitSide).toBe('down');  // Different row, waypoint needed
    expect(flow3Info.target.entrySide).toBe('left');
    expect(flow3Info.waypoints.length).toBe(1);
    expect(flow3Info.waypoints[0].lane).toBe('lane1');
    expect(flow3Info.waypoints[0].layer).toBe(1);  // Gateway layer!
    expect(flow3Info.waypoints[0].row).toBe(1);    // Target row

    const flow4Info = flowInfos.get('flow4');
    expect(flow4Info.source.exitSide).toBe('down');  // Cross-lane, waypoint needed
    expect(flow4Info.target.entrySide).toBe('left');
    expect(flow4Info.waypoints.length).toBe(1);
    expect(flow4Info.waypoints[0].lane).toBe('lane2');  // Target lane
    expect(flow4Info.waypoints[0].layer).toBe(1);       // Gateway layer!
    expect(flow4Info.waypoints[0].row).toBe(0);         // Target row

    console.log('\n=== COMPLEX TEST 1 PASSED ===\n');
  });
});
