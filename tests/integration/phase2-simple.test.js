import { describe, test, expect } from 'vitest';
import {
  applyConfig,
  initializeMatrix,
  assignGatewayLanes,
  assignSameLanePosition,
  assignCrossLaneFreePosition,
  assignCrossLaneBlockedPosition,
  assignGatewayOutputPositions,
  sortGatewayOutputs,
  isCrossLanePathFree,
  createSameLaneFlowInfo,
  createCrossLaneFreeFlowInfo,
  createCrossLaneBlockedFlowInfo
} from '../../src/phase2.js';

describe('Phase 2: Simple Integration Example', () => {
  test('should process simple diagram with gateway and cross-lane flows', () => {
    /**
     * Diagram:
     * Lane1: [Start] → [XOR Split] → [TaskA]
     *                       ↓
     * Lane2:           [TaskB]
     *                       ↓
     * Lane3:           [End]
     */

    console.log('\n=== SIMPLE INTEGRATION TEST ===\n');

    // Setup: Elements
    const elements = new Map([
      ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: ['flow1'] }],
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1'], outgoing: ['flow2', 'flow3'] }],
      ['taskA', { id: 'taskA', type: 'task', incoming: ['flow2'], outgoing: [] }],
      ['taskB', { id: 'taskB', type: 'task', incoming: ['flow3'], outgoing: ['flow4'] }],
      ['end1', { id: 'end1', type: 'endEvent', incoming: ['flow4'], outgoing: [] }]
    ]);

    // Setup: Flows
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'xor1' }],
      ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'taskA' }],
      ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'taskB' }],
      ['flow4', { id: 'flow4', sourceRef: 'taskB', targetRef: 'end1' }]
    ]);

    // Setup: Lanes
    const lanes = new Map([
      ['lane1', { id: 'lane1', name: 'Lane 1', elements: ['start1', 'taskA'] }],
      ['lane2', { id: 'lane2', name: 'Lane 2', elements: ['taskB'] }],
      ['lane3', { id: 'lane3', name: 'Lane 3', elements: ['end1'] }]
    ]);

    // Setup: Config
    const config = { laneOrientation: 'horizontal' };
    const directions = applyConfig(config);

    console.log('Directions:', directions);

    // Step 1: Initialize Matrix
    const matrix = initializeMatrix(lanes);

    // Step 2: Assign Gateway Lanes
    const elementLanes = assignGatewayLanes(elements, flows, lanes);
    console.log('\nElement Lanes:');
    elementLanes.forEach((lane, elementId) => {
      console.log(`  ${elementId}: ${lane}`);
    });

    expect(elementLanes.get('xor1')).toBe('lane1');  // Split gateway in input lane

    // Step 3: Position Elements
    const positions = new Map();

    // start1: Lane1, Layer 0
    positions.set('start1', { lane: 'lane1', layer: 0, row: 0 });

    // xor1: Same lane as start1, layer +1
    positions.set('xor1', { lane: 'lane1', layer: 1, row: 0 });

    // Gateway outputs: taskA (lane1), taskB (lane2)
    const sortedOutputs = sortGatewayOutputs(['flow2', 'flow3'], flows, elementLanes, lanes, 'lane1');
    const gatewayOutputPositions = assignGatewayOutputPositions('xor1', sortedOutputs, positions, elementLanes, flows);
    gatewayOutputPositions.forEach((pos, targetId) => {
      positions.set(targetId, pos);
    });

    // taskB → end1: cross-lane
    const pathFree = isCrossLanePathFree('taskB', 'end1', positions, elementLanes, lanes, matrix);
    if (pathFree) {
      const pos = assignCrossLaneFreePosition('taskB', 'end1', positions, elementLanes);
      positions.set('end1', pos);
    } else {
      const pos = assignCrossLaneBlockedPosition('taskB', 'end1', positions, elementLanes);
      positions.set('end1', pos);
    }

    console.log('\nPositions:');
    positions.forEach((pos, elementId) => {
      console.log(`  ${elementId}: lane=${pos.lane}, layer=${pos.layer}, row=${pos.row}`);
    });

    // Verify positions
    expect(positions.get('start1').layer).toBe(0);
    expect(positions.get('xor1').layer).toBe(1);
    expect(positions.get('taskA').layer).toBe(2);
    expect(positions.get('taskB').layer).toBe(2);
    expect(positions.get('taskA').row).toBe(0);
    expect(positions.get('taskB').row).toBe(0);  // Cross-lane, always row 0

    // Step 4: Create Flow Infos
    const flowInfos = new Map();

    // flow1: start1 → xor1 (same-lane)
    flowInfos.set('flow1', createSameLaneFlowInfo('flow1', 'start1', 'xor1', positions, directions));

    // flow2: xor1 → taskA (same-lane)
    flowInfos.set('flow2', createSameLaneFlowInfo('flow2', 'xor1', 'taskA', positions, directions));

    // flow3: xor1 → taskB (cross-lane)
    const flow3PathFree = isCrossLanePathFree('xor1', 'taskB', positions, elementLanes, lanes, matrix);
    if (flow3PathFree) {
      flowInfos.set('flow3', createCrossLaneFreeFlowInfo('flow3', 'xor1', 'taskB', positions, elementLanes, lanes, directions));
    } else {
      flowInfos.set('flow3', createCrossLaneBlockedFlowInfo('flow3', 'xor1', 'taskB', positions, elementLanes, lanes, directions));
    }

    // flow4: taskB → end1 (cross-lane)
    const flow4PathFree = isCrossLanePathFree('taskB', 'end1', positions, elementLanes, lanes, matrix);
    if (flow4PathFree) {
      flowInfos.set('flow4', createCrossLaneFreeFlowInfo('flow4', 'taskB', 'end1', positions, elementLanes, lanes, directions));
    } else {
      flowInfos.set('flow4', createCrossLaneBlockedFlowInfo('flow4', 'taskB', 'end1', positions, elementLanes, lanes, directions));
    }

    console.log('\nFlow Infos:');
    flowInfos.forEach((info, flowId) => {
      console.log(`  ${flowId}:`);
      console.log(`    source: ${info.sourceId} (${info.source.lane}, ${info.source.layer}, ${info.source.row}) exitSide=${info.source.exitSide}`);
      if (info.waypoints.length > 0) {
        info.waypoints.forEach((wp, idx) => {
          console.log(`    waypoint[${idx}]: (${wp.lane}, ${wp.layer}, ${wp.row})`);
        });
      }
      console.log(`    target: ${info.targetId} (${info.target.lane}, ${info.target.layer}, ${info.target.row}) entrySide=${info.target.entrySide}`);
    });

    // Verify flow infos
    const flow1Info = flowInfos.get('flow1');
    expect(flow1Info.source.exitSide).toBe('right');
    expect(flow1Info.target.entrySide).toBe('left');
    expect(flow1Info.waypoints.length).toBe(0);

    const flow2Info = flowInfos.get('flow2');
    expect(flow2Info.source.exitSide).toBe('right');
    expect(flow2Info.target.entrySide).toBe('left');
    expect(flow2Info.waypoints.length).toBe(0);

    const flow3Info = flowInfos.get('flow3');
    expect(flow3Info.source.exitSide).toBe('down');  // Cross-lane, same layer
    expect(flow3Info.target.entrySide).toBe('up');
    expect(flow3Info.waypoints.length).toBe(0);  // Straight line

    const flow4Info = flowInfos.get('flow4');
    expect(flow4Info.source.exitSide).toBe('down');  // Cross-lane, same layer
    expect(flow4Info.target.entrySide).toBe('up');
    expect(flow4Info.waypoints.length).toBe(0);  // Straight line

    console.log('\n=== SIMPLE INTEGRATION TEST PASSED ===\n');
  });
});
