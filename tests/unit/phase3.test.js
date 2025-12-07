import { describe, test, expect } from 'vitest';
import {
  normalizeRows,
  calculateElementCoordinates,
  calculateWaypointCoordinate,
  calculateConnectionPoint,
  calculateFlowWaypoints,
  routeBackFlow,
  generateElementDI,
  generateFlowDI
} from '../../src/phase3.js';

describe('Phase 3: Coordinate Calculation', () => {
  test('should normalize rows correctly', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: -1 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }],
      ['task3', { lane: 'lane1', layer: 2, row: 1 }],
      ['task4', { lane: 'lane2', layer: 0, row: 0 }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const normalized = normalizeRows(positions, lanes);

    // Lane1: min row = -1, so -1→0, 0→1, 1→2
    expect(normalized.get('task1').normalizedRow).toBe(0);
    expect(normalized.get('task2').normalizedRow).toBe(1);
    expect(normalized.get('task3').normalizedRow).toBe(2);

    // Lane2: min row = 0, so 0→0
    expect(normalized.get('task4').normalizedRow).toBe(0);
  });

  test('should calculate element coordinates for horizontal orientation', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }],
      ['task3', { lane: 'lane2', layer: 1, row: 0 }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal'
    };

    const coordinates = calculateElementCoordinates(positions, lanes, directions);

    // task1: layer0, lane1 (index 0), row0
    expect(coordinates.get('task1')).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80
    });

    // task2: layer1, lane1 (index 0), row0
    expect(coordinates.get('task2')).toEqual({
      x: 150,
      y: 0,
      width: 100,
      height: 80
    });

    // task3: layer1, lane2 (index 1), row0
    expect(coordinates.get('task3')).toEqual({
      x: 150,
      y: 100,
      width: 100,
      height: 80
    });
  });

  test('should calculate waypoint coordinates', () => {
    const waypoint = { lane: 'lane1', layer: 1, row: 0 };

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal'
    };

    const coord = calculateWaypointCoordinate(waypoint, lanes, directions);

    expect(coord).toEqual({
      x: 150,  // layer 1 × 150
      y: 0     // lane index 0 × 100 + row 0 × 80
    });
  });

  test('should calculate connection points correctly', () => {
    const coord = { x: 100, y: 50, width: 100, height: 80 };

    expect(calculateConnectionPoint(coord, 'right')).toEqual({
      x: 200,  // x + width
      y: 90    // y + height/2
    });

    expect(calculateConnectionPoint(coord, 'left')).toEqual({
      x: 100,  // x
      y: 90    // y + height/2
    });

    expect(calculateConnectionPoint(coord, 'up')).toEqual({
      x: 150,  // x + width/2
      y: 50    // y
    });

    expect(calculateConnectionPoint(coord, 'down')).toEqual({
      x: 150,  // x + width/2
      y: 130   // y + height
    });
  });

  test('should calculate flow waypoints for straight flow', () => {
    const flowInfo = {
      sourceId: 'task1',
      targetId: 'task2',
      source: { exitSide: 'right' },
      target: { entrySide: 'left' },
      waypoints: []
    };

    const coordinates = new Map([
      ['task1', { x: 0, y: 0, width: 100, height: 80 }],
      ['task2', { x: 150, y: 0, width: 100, height: 80 }]
    ]);

    const lanes = new Map([['lane1', { id: 'lane1' }]]);
    const directions = { laneOrientation: 'horizontal' };

    const waypoints = calculateFlowWaypoints(flowInfo, coordinates, lanes, directions);

    expect(waypoints.length).toBe(2);
    expect(waypoints[0]).toEqual({ x: 100, y: 40 });  // Exit right from task1
    expect(waypoints[1]).toEqual({ x: 150, y: 40 });  // Enter left into task2
  });

  test('should calculate flow waypoints with logical waypoint', () => {
    const flowInfo = {
      sourceId: 'task1',
      targetId: 'task2',
      source: { exitSide: 'down' },
      target: { entrySide: 'left' },
      waypoints: [{ lane: 'lane2', layer: 0, row: 0 }]
    };

    const coordinates = new Map([
      ['task1', { x: 0, y: 0, width: 100, height: 80 }],
      ['task2', { x: 150, y: 100, width: 100, height: 80 }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);
    const directions = { laneOrientation: 'horizontal' };

    const waypoints = calculateFlowWaypoints(flowInfo, coordinates, lanes, directions);

    expect(waypoints.length).toBe(3);
    expect(waypoints[0]).toEqual({ x: 50, y: 80 });    // Exit down from task1
    expect(waypoints[1]).toEqual({ x: 0, y: 100 });    // Waypoint
    expect(waypoints[2]).toEqual({ x: 150, y: 140 });  // Enter left into task2
  });

  test('should route back-flow with same entry side as normal flow', () => {
    const flowInfos = new Map([
      // Normal flow: task1 → task2 (enters from left)
      ['flow1', {
        sourceId: 'task1',
        targetId: 'task2',
        isBackFlow: false,
        source: { exitSide: 'right' },
        target: { entrySide: 'left' },
        waypoints: []
      }],
      // Back-flow: task3 → task2 (should also enter from left)
      ['flow2', {
        sourceId: 'task3',
        targetId: 'task2',
        isBackFlow: true,
        source: { exitSide: null },
        target: { entrySide: null },
        waypoints: []
      }]
    ]);

    const coordinates = new Map([
      ['task1', { x: 0, y: 0, width: 100, height: 80 }],
      ['task2', { x: 150, y: 0, width: 100, height: 80 }],
      ['task3', { x: 300, y: 0, width: 100, height: 80 }]
    ]);

    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }],
      ['task3', { lane: 'lane1', layer: 2, row: 0 }]
    ]);

    const lanes = new Map([['lane1', { id: 'lane1' }]]);
    const directions = {
      laneOrientation: 'horizontal',
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const waypoints = routeBackFlow(flowInfos.get('flow2'), coordinates, positions, lanes, directions, flowInfos);

    // Should have 5 waypoints: exit, between-rows, between-layers, align, entry
    expect(waypoints.length).toBe(5);
    
    // Exit down from task3
    expect(waypoints[0]).toEqual({ x: 350, y: 80 });
    
    // Between rows (down by ROW_SPACING/2 = 40)
    expect(waypoints[1]).toEqual({ x: 350, y: 120 });
    
    // Between layers (left to before task2, x = 150 - 75 = 75)
    expect(waypoints[2]).toEqual({ x: 75, y: 120 });
    
    // Align with target entry point (y = 40, center of task2)
    expect(waypoints[3]).toEqual({ x: 75, y: 40 });
    
    // Enter from left (same as normal flow!)
    expect(waypoints[4]).toEqual({ x: 150, y: 40 });
  });

  test('should generate BPMN DI for elements', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task' }],
      ['task2', { id: 'task2', type: 'task' }]
    ]);

    const coordinates = new Map([
      ['task1', { x: 0, y: 0, width: 100, height: 80 }],
      ['task2', { x: 150, y: 100, width: 100, height: 80 }]
    ]);

    const di = generateElementDI(elements, coordinates);

    expect(di).toContain('<bpmndi:BPMNShape bpmnElement="task1">');
    expect(di).toContain('<dc:Bounds x="0" y="0" width="100" height="80"/>');
    expect(di).toContain('<bpmndi:BPMNShape bpmnElement="task2">');
    expect(di).toContain('<dc:Bounds x="150" y="100" width="100" height="80"/>');
  });

  test('should generate BPMN DI for flows', () => {
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'task2' }]
    ]);

    const flowWaypoints = new Map([
      ['flow1', [
        { x: 100, y: 40 },
        { x: 150, y: 140 }
      ]]
    ]);

    const di = generateFlowDI(flows, flowWaypoints);

    expect(di).toContain('<bpmndi:BPMNEdge bpmnElement="flow1">');
    expect(di).toContain('<di:waypoint x="100" y="40"/>');
    expect(di).toContain('<di:waypoint x="150" y="140"/>');
  });
});
