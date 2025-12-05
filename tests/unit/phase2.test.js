import { describe, test, expect } from 'vitest';
import {
  applyConfig,
  initializeMatrix,
  assignGatewayLanes,
  getLaneIndex,
  isCrossLane,
  getCrossLaneDirection,
  identifyBackFlowTargets,
  reserveBackFlowColumns,
  hasReservedColumn,
  assignSameLanePosition,
  createSameLaneWaypoints,
  isCrossLanePathFree,
  assignCrossLaneFreePosition,
  createCrossLaneWaypoints,
  assignCrossLaneBlockedPosition,
  sortGatewayOutputs,
  assignSymmetricRows,
  assignGatewayOutputPositions
} from '../../src/phase2.js';

describe('Phase 2: Configuration', () => {
  test('should apply horizontal configuration (default)', () => {
    const directions = applyConfig({ laneOrientation: 'horizontal' });

    expect(directions.laneOrientation).toBe('horizontal');
    expect(directions.alongLane).toBe('right');
    expect(directions.oppAlongLane).toBe('left');
    expect(directions.crossLane).toBe('down');
    expect(directions.oppCrossLane).toBe('up');
  });

  test('should apply vertical configuration', () => {
    const directions = applyConfig({ laneOrientation: 'vertical' });

    expect(directions.laneOrientation).toBe('vertical');
    expect(directions.alongLane).toBe('down');
    expect(directions.oppAlongLane).toBe('up');
    expect(directions.crossLane).toBe('right');
    expect(directions.oppCrossLane).toBe('left');
  });

  test('should default to horizontal when no config provided', () => {
    const directions = applyConfig();

    expect(directions.laneOrientation).toBe('horizontal');
    expect(directions.alongLane).toBe('right');
  });
});

describe('Phase 2: Matrix Initialization', () => {
  test('should initialize matrix with lanes', () => {
    const lanes = new Map([
      ['lane1', { id: 'lane1', name: 'Lane 1', elements: [] }],
      ['lane2', { id: 'lane2', name: 'Lane 2', elements: [] }]
    ]);

    const matrix = initializeMatrix(lanes);

    expect(matrix.size).toBe(2);
    expect(matrix.has('lane1')).toBe(true);
    expect(matrix.has('lane2')).toBe(true);
    expect(matrix.get('lane1') instanceof Map).toBe(true);
  });
});

describe('Phase 2: Gateway Lane Assignment', () => {
  test('should assign split gateway to input lane', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1'], outgoing: ['flow2', 'flow3'] }],
      ['task2', { id: 'task2', type: 'task', incoming: ['flow2'], outgoing: [] }],
      ['task3', { id: 'task3', type: 'task', incoming: ['flow3'], outgoing: [] }]
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }],
      ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'task2' }],
      ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task3' }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1', elements: ['task1', 'task2'] }],
      ['lane2', { id: 'lane2', elements: ['task3'] }]
    ]);

    const elementLanes = assignGatewayLanes(elements, flows, lanes);

    expect(elementLanes.get('xor1')).toBe('lane1');  // Split gateway in input lane
  });

  test('should assign merge gateway to output lane', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
      ['task2', { id: 'task2', type: 'task', incoming: [], outgoing: ['flow2'] }],
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1', 'flow2'], outgoing: ['flow3'] }],
      ['task3', { id: 'task3', type: 'task', incoming: ['flow3'], outgoing: [] }]
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }],
      ['flow2', { id: 'flow2', sourceRef: 'task2', targetRef: 'xor1' }],
      ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task3' }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1', elements: ['task1'] }],
      ['lane2', { id: 'lane2', elements: ['task2', 'task3'] }]
    ]);

    const elementLanes = assignGatewayLanes(elements, flows, lanes);

    expect(elementLanes.get('xor1')).toBe('lane2');  // Merge gateway in output lane
  });

  test('should preserve non-gateway element lanes', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: [] }]
    ]);

    const flows = new Map();

    const lanes = new Map([
      ['lane1', { id: 'lane1', elements: ['task1'] }]
    ]);

    const elementLanes = assignGatewayLanes(elements, flows, lanes);

    expect(elementLanes.get('task1')).toBe('lane1');
  });
});

describe('Phase 2: Lane Utilities', () => {
  test('should get lane index correctly', () => {
    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }],
      ['lane3', { id: 'lane3' }]
    ]);

    expect(getLaneIndex('lane1', lanes)).toBe(0);
    expect(getLaneIndex('lane2', lanes)).toBe(1);
    expect(getLaneIndex('lane3', lanes)).toBe(2);
  });

  test('should detect cross-lane flows', () => {
    const flow = { sourceRef: 'task1', targetRef: 'task2' };
    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    expect(isCrossLane(flow, elementLanes)).toBe(true);
  });

  test('should detect same-lane flows', () => {
    const flow = { sourceRef: 'task1', targetRef: 'task2' };
    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane1']
    ]);

    expect(isCrossLane(flow, elementLanes)).toBe(false);
  });

  test('should determine crossLane direction (going down/right)', () => {
    const flow = { sourceRef: 'task1', targetRef: 'task2' };
    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);
    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);
    const directions = { crossLane: 'down', oppCrossLane: 'up' };

    const direction = getCrossLaneDirection(flow, elementLanes, lanes, directions);

    expect(direction).toBe('crossLane');
  });

  test('should determine oppCrossLane direction (going up/left)', () => {
    const flow = { sourceRef: 'task1', targetRef: 'task2' };
    const elementLanes = new Map([
      ['task1', 'lane2'],
      ['task2', 'lane1']
    ]);
    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);
    const directions = { crossLane: 'down', oppCrossLane: 'up' };

    const direction = getCrossLaneDirection(flow, elementLanes, lanes, directions);

    expect(direction).toBe('oppCrossLane');
  });
});


describe('Phase 2: Back-Flow Reservation', () => {
  test('should identify elements that receive back-flows', () => {
    const elements = new Map([
      ['start1', { id: 'start1', type: 'startEvent' }],
      ['task1', { id: 'task1', type: 'task' }],
      ['task2', { id: 'task2', type: 'task' }]
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'task1' }],
      ['flow2', { id: 'flow2', sourceRef: 'task1', targetRef: 'task2' }],
      ['flow3', { id: 'flow3', sourceRef: 'task2', targetRef: 'task1' }]  // Back-edge
    ]);

    const backEdges = ['flow3'];

    const backFlowTargets = identifyBackFlowTargets(elements, backEdges, flows);

    expect(backFlowTargets.has('task1')).toBe(true);
    expect(backFlowTargets.has('task2')).toBe(false);
  });

  test('should reserve columns for back-flow targets', () => {
    const backFlowTargets = new Set(['task1', 'task3']);
    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane1'],
      ['task3', 'lane2']
    ]);

    const reservations = reserveBackFlowColumns(backFlowTargets, elementLanes);

    expect(reservations.has('task1')).toBe(true);
    expect(reservations.get('task1').reservedColumn).toBe(true);
    expect(reservations.has('task3')).toBe(true);
    expect(reservations.has('task2')).toBe(false);
  });

  test('should check if element has reserved column', () => {
    const reservations = new Map([
      ['task1', { reservedColumn: true }],
      ['task2', { reservedColumn: false }]
    ]);

    expect(hasReservedColumn('task1', reservations)).toBe(true);
    expect(hasReservedColumn('task2', reservations)).toBe(false);
    expect(hasReservedColumn('task3', reservations)).toBe(false);
  });

  test('should handle multiple back-flows to same element', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task' }],
      ['task2', { id: 'task2', type: 'task' }],
      ['task3', { id: 'task3', type: 'task' }]
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'task2', targetRef: 'task1' }],  // Back-edge
      ['flow2', { id: 'flow2', sourceRef: 'task3', targetRef: 'task1' }]   // Back-edge
    ]);

    const backEdges = ['flow1', 'flow2'];

    const backFlowTargets = identifyBackFlowTargets(elements, backEdges, flows);

    expect(backFlowTargets.size).toBe(1);
    expect(backFlowTargets.has('task1')).toBe(true);
  });
});


describe('Phase 2: Rule 1 - Same Lane Positioning', () => {
  test('should assign layer + 1 for same-lane flow', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane1']
    ]);

    const position = assignSameLanePosition('task1', 'task2', positions, elementLanes);

    expect(position.lane).toBe('lane1');
    expect(position.layer).toBe(1);
    expect(position.row).toBe(0);
  });

  test('should create waypoints for same-lane flow (horizontal)', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }]
    ]);

    const directions = {
      alongLane: 'right',
      oppAlongLane: 'left'
    };

    const waypoints = createSameLaneWaypoints('flow1', 'task1', 'task2', positions, directions);

    expect(waypoints.length).toBe(2);
    expect(waypoints[0].side).toBe('right');  // alongLane
    expect(waypoints[1].side).toBe('left');   // oppAlongLane
    expect(waypoints[0].layer).toBe(0);
    expect(waypoints[1].layer).toBe(1);
  });

  test('should create waypoints for same-lane flow (vertical)', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }]
    ]);

    const directions = {
      alongLane: 'down',
      oppAlongLane: 'up'
    };

    const waypoints = createSameLaneWaypoints('flow1', 'task1', 'task2', positions, directions);

    expect(waypoints.length).toBe(2);
    expect(waypoints[0].side).toBe('down');  // alongLane
    expect(waypoints[1].side).toBe('up');    // oppAlongLane
  });

  test('should preserve row for same-lane flow', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 2, row: 3 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane1']
    ]);

    const position = assignSameLanePosition('task1', 'task2', positions, elementLanes);

    expect(position.row).toBe(3);  // Same row as source
  });
});


describe('Phase 2: Rule 3 - Cross-Lane Free Path', () => {
  test('should detect free cross-lane path', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const matrix = new Map([
      ['lane1', new Map()],
      ['lane2', new Map()]
    ]);

    const reservations = new Map();

    const isFree = isCrossLanePathFree('task1', 'task2', positions, elementLanes, lanes, matrix, reservations);

    expect(isFree).toBe(true);
  });

  test('should detect blocked cross-lane path (element in between)', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task3', { lane: 'lane2', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane3'],
      ['task3', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }],
      ['lane3', { id: 'lane3' }]
    ]);

    const matrix = new Map([
      ['lane1', new Map()],
      ['lane2', new Map([[0, { elements: ['task3'] }]])],
      ['lane3', new Map()]
    ]);

    const reservations = new Map();

    const isFree = isCrossLanePathFree('task1', 'task2', positions, elementLanes, lanes, matrix, reservations);

    expect(isFree).toBe(false);
  });

  test('should detect blocked path when target has reserved column', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const matrix = new Map([
      ['lane1', new Map()],
      ['lane2', new Map()]
    ]);

    const reservations = new Map([
      ['task2', { reservedColumn: true }]
    ]);

    const isFree = isCrossLanePathFree('task1', 'task2', positions, elementLanes, lanes, matrix, reservations);

    expect(isFree).toBe(false);
  });

  test('should assign same layer for cross-lane free path', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 2, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const position = assignCrossLaneFreePosition('task1', 'task2', positions, elementLanes);

    expect(position.lane).toBe('lane2');
    expect(position.layer).toBe(2);  // Same layer as source
  });

  test('should create straight line waypoints for cross-lane flow with same layer', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane2', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const waypoints = createCrossLaneWaypoints('flow1', 'task1', 'task2', positions, elementLanes, lanes, directions);

    expect(waypoints.length).toBe(2);  // Straight line!
    expect(waypoints[0].side).toBe('down');  // crossLane (going down)
    expect(waypoints[1].side).toBe('up');    // oppCrossLane (coming from up)
  });

  test('should create L-shape waypoints for cross-lane flow with different layers', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane2', layer: 1, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const waypoints = createCrossLaneWaypoints('flow1', 'task1', 'task2', positions, elementLanes, lanes, directions);

    expect(waypoints.length).toBe(3);  // L-shape
    expect(waypoints[0].side).toBe('right');  // alongLane (going right)
    expect(waypoints[1].side).toBe('down');   // crossLane (bending down)
    expect(waypoints[2].side).toBe('up');     // oppCrossLane (coming from up)
  });
});


describe('Phase 2: Rule 4 - Cross-Lane Blocked Path', () => {
  test('should assign layer + 1 for cross-lane blocked path', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const position = assignCrossLaneBlockedPosition('task1', 'task2', positions, elementLanes);

    expect(position.lane).toBe('lane2');
    expect(position.layer).toBe(1);  // Layer + 1 because blocked
  });

  test('should use L-shape waypoints for blocked cross-lane (different layers)', () => {
    // Blocked path means different layers, so waypoints are L-shape
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane2', layer: 1, row: 0 }]  // Different layer
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const waypoints = createCrossLaneWaypoints('flow1', 'task1', 'task2', positions, elementLanes, lanes, directions);

    expect(waypoints.length).toBe(3);  // L-shape
    expect(waypoints[0].side).toBe('right');  // alongLane
    expect(waypoints[1].side).toBe('down');   // crossLane
    expect(waypoints[2].side).toBe('up');     // oppCrossLane
  });

  test('should increment layer even if source is at higher layer', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 5, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const position = assignCrossLaneBlockedPosition('task1', 'task2', positions, elementLanes);

    expect(position.layer).toBe(6);  // 5 + 1
  });
});


describe('Phase 2: Rule 5 - Gateway Output Sorting and Positioning', () => {
  test('should sort gateway outputs by target lane (oppCrossLane first, crossLane last)', () => {
    const outputFlowIds = ['flow1', 'flow2', 'flow3'];
    
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'gw1', targetRef: 'task1' }],  // Lane 2 (middle)
      ['flow2', { id: 'flow2', sourceRef: 'gw1', targetRef: 'task2' }],  // Lane 1 (up)
      ['flow3', { id: 'flow3', sourceRef: 'gw1', targetRef: 'task3' }]   // Lane 3 (down)
    ]);
    
    const elementLanes = new Map([
      ['gw1', 'lane2'],
      ['task1', 'lane2'],
      ['task2', 'lane1'],
      ['task3', 'lane3']
    ]);
    
    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }],
      ['lane3', { id: 'lane3' }]
    ]);
    
    const sorted = sortGatewayOutputs(outputFlowIds, flows, elementLanes, lanes, 'lane2');
    
    expect(sorted[0]).toBe('flow2');  // Lane 1 (up) first
    expect(sorted[1]).toBe('flow1');  // Lane 2 (same) middle
    expect(sorted[2]).toBe('flow3');  // Lane 3 (down) last
  });
  
  test('should assign symmetric rows for 2 outputs', () => {
    const rows = assignSymmetricRows(2);
    
    expect(rows).toEqual([0, 1]);
  });
  
  test('should assign symmetric rows for 3 outputs', () => {
    const rows = assignSymmetricRows(3);
    
    expect(rows).toEqual([-1, 0, 1]);
  });
  
  test('should assign symmetric rows for 4 outputs', () => {
    const rows = assignSymmetricRows(4);
    
    expect(rows).toEqual([-1, 0, 1, 2]);
  });
  
  test('should assign symmetric rows for 5 outputs', () => {
    const rows = assignSymmetricRows(5);
    
    expect(rows).toEqual([-2, -1, 0, 1, 2]);
  });
  
  test('should assign positions for gateway outputs with layer + 1', () => {
    const positions = new Map([
      ['gw1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);
    
    const outputFlowIds = ['flow1', 'flow2'];
    
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'gw1', targetRef: 'task1' }],
      ['flow2', { id: 'flow2', sourceRef: 'gw1', targetRef: 'task2' }]
    ]);
    
    const elementLanes = new Map([
      ['gw1', 'lane1'],
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);
    
    const outputPositions = assignGatewayOutputPositions('gw1', outputFlowIds, positions, elementLanes, flows);
    
    expect(outputPositions.get('task1').layer).toBe(1);  // Layer + 1
    expect(outputPositions.get('task2').layer).toBe(1);  // Layer + 1
  });
  
  test('should assign symmetric rows for gateway outputs', () => {
    const positions = new Map([
      ['gw1', { lane: 'lane2', layer: 0, row: 0 }]
    ]);
    
    const outputFlowIds = ['flow1', 'flow2', 'flow3'];
    
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'gw1', targetRef: 'task1' }],
      ['flow2', { id: 'flow2', sourceRef: 'gw1', targetRef: 'task2' }],
      ['flow3', { id: 'flow3', sourceRef: 'gw1', targetRef: 'task3' }]
    ]);
    
    const elementLanes = new Map([
      ['gw1', 'lane2'],
      ['task1', 'lane1'],
      ['task2', 'lane2'],
      ['task3', 'lane3']
    ]);
    
    const outputPositions = assignGatewayOutputPositions('gw1', outputFlowIds, positions, elementLanes, flows);
    
    // Rows should be [-1, 0, 1] for 3 outputs
    expect(outputPositions.get('task1').row).toBe(-1);  // First output
    expect(outputPositions.get('task2').row).toBe(0);   // Second output
    expect(outputPositions.get('task3').row).toBe(1);   // Third output
  });
});
