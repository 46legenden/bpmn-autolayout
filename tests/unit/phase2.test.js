import { describe, test, expect } from 'vitest';
import {
  applyConfig,
  initializeMatrix,
  assignGatewayLanes,
  getLaneIndex,
  isCrossLane,
  getCrossLaneDirection,
  assignSameLanePosition,
  createSameLaneFlowInfo,
  isCrossLanePathFree,
  assignCrossLaneFreePosition,
  createCrossLaneFreeFlowInfo,
  assignCrossLaneBlockedPosition,
  createCrossLaneBlockedFlowInfo,
  sortGatewayOutputs,
  assignSymmetricRows,
  assignGatewayOutputPositions,
  createGatewayOutputFlowInfo,
  createBackFlowInfo
} from '../../src/phase2.js';

describe('Phase 2: Configuration', () => {
  test('should apply horizontal configuration (default)', () => {
    const directions = applyConfig({ laneOrientation: 'horizontal' });
    
    expect(directions.alongLane).toBe('right');
    expect(directions.oppAlongLane).toBe('left');
    expect(directions.crossLane).toBe('down');
    expect(directions.oppCrossLane).toBe('up');
  });

  test('should apply vertical configuration', () => {
    const directions = applyConfig({ laneOrientation: 'vertical' });
    
    expect(directions.alongLane).toBe('down');
    expect(directions.oppAlongLane).toBe('up');
    expect(directions.crossLane).toBe('right');
    expect(directions.oppCrossLane).toBe('left');
  });
});

describe('Phase 2: Matrix Initialization', () => {
  test('should initialize matrix for lanes', () => {
    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const matrix = initializeMatrix(lanes);

    expect(matrix.size).toBe(2);
    expect(matrix.has('lane1')).toBe(true);
    expect(matrix.has('lane2')).toBe(true);
  });
});

describe('Phase 2: Gateway Lane Assignment', () => {
  test('should assign split gateway to input lane', () => {
    const elements = new Map([
      ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1'], outgoing: ['flow2', 'flow3'] }]
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1', elements: ['task1'] }]
    ]);

    const elementLanes = assignGatewayLanes(elements, flows, lanes);

    expect(elementLanes.get('xor1')).toBe('lane1');
  });

  test('should assign merge gateway to output lane', () => {
    const elements = new Map([
      ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1', 'flow2'], outgoing: ['flow3'] }],
      ['task1', { id: 'task1', type: 'task', incoming: ['flow3'], outgoing: [] }]
    ]);

    const flows = new Map([
      ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task1' }]
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1', elements: ['task1'] }]
    ]);

    const elementLanes = assignGatewayLanes(elements, flows, lanes);

    expect(elementLanes.get('xor1')).toBe('lane1');
  });
});

describe('Phase 2: Same-Lane Positioning', () => {
  test('should assign position for same-lane flow', () => {
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

  test('should create flow info for same-lane flow', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane1', layer: 1, row: 0 }]
    ]);

    const directions = {
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const flowInfo = createSameLaneFlowInfo('flow1', 'task1', 'task2', positions, directions);

    expect(flowInfo.isBackFlow).toBe(false);
    expect(flowInfo.source.exitSide).toBe('right');
    expect(flowInfo.target.entrySide).toBe('left');
    expect(flowInfo.waypoints.length).toBe(0);
  });
});

describe('Phase 2: Cross-Lane Positioning', () => {
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

    const isFree = isCrossLanePathFree('task1', 'task2', positions, elementLanes, lanes, matrix);

    expect(isFree).toBe(true);
  });

  test('should assign position for cross-lane free path', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const position = assignCrossLaneFreePosition('task1', 'task2', positions, elementLanes);

    expect(position.lane).toBe('lane2');
    expect(position.layer).toBe(0);  // Same layer
  });

  test('should create flow info for cross-lane free path', () => {
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

    const flowInfo = createCrossLaneFreeFlowInfo('flow1', 'task1', 'task2', positions, elementLanes, lanes, directions);

    expect(flowInfo.isBackFlow).toBe(false);
    expect(flowInfo.source.exitSide).toBe('down');
    expect(flowInfo.target.entrySide).toBe('up');
    expect(flowInfo.waypoints.length).toBe(0);  // Straight line
  });

  test('should assign position for cross-lane blocked path', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const position = assignCrossLaneBlockedPosition('task1', 'task2', positions, elementLanes);

    expect(position.lane).toBe('lane2');
    expect(position.layer).toBe(1);  // Layer +1
  });

  test('should create flow info for cross-lane blocked path', () => {
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

    const flowInfo = createCrossLaneBlockedFlowInfo('flow1', 'task1', 'task2', positions, elementLanes, lanes, directions);

    expect(flowInfo.isBackFlow).toBe(false);
    expect(flowInfo.source.exitSide).toBe('right');
    expect(flowInfo.waypoints.length).toBe(1);  // L-shape
    expect(flowInfo.waypoints[0].lane).toBe('lane1');  // exitSide=right: lane stays from source
    expect(flowInfo.waypoints[0].layer).toBe(1);  // entrySide=up: layer stays from target
    expect(flowInfo.waypoints[0].row).toBe(0);
    expect(flowInfo.target.entrySide).toBe('up');
  });
});

describe('Phase 2: Gateway Outputs', () => {
  test('should sort gateway outputs by lane', () => {
    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'xor1', targetRef: 'task1' }],
      ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'task2' }]
    ]);

    const elementLanes = new Map([
      ['xor1', 'lane1'],
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const sorted = sortGatewayOutputs(['flow2', 'flow1'], flows, elementLanes, lanes, 'lane1');

    expect(sorted[0]).toBe('flow1');  // Same lane first
    expect(sorted[1]).toBe('flow2');
  });

  test('should assign symmetric rows for gateway outputs', () => {
    expect(assignSymmetricRows(2)).toEqual([0, 1]);
    expect(assignSymmetricRows(3)).toEqual([-1, 0, 1]);
    expect(assignSymmetricRows(4)).toEqual([0, 1, 2, 3]);
    expect(assignSymmetricRows(5)).toEqual([-2, -1, 0, 1, 2]);
  });

  test('should assign positions for gateway outputs', () => {
    const positions = new Map([
      ['xor1', { lane: 'lane1', layer: 1, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['task1', 'lane1'],
      ['task2', 'lane2']
    ]);

    const flows = new Map([
      ['flow1', { id: 'flow1', sourceRef: 'xor1', targetRef: 'task1' }],
      ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'task2' }]
    ]);

    const outputPositions = assignGatewayOutputPositions('xor1', ['flow1', 'flow2'], positions, elementLanes, flows);

    expect(outputPositions.get('task1').layer).toBe(2);
    expect(outputPositions.get('task1').row).toBe(0);  // Same-lane
    expect(outputPositions.get('task2').layer).toBe(2);
    expect(outputPositions.get('task2').row).toBe(0);  // Cross-lane, always row 0
  });

  test('should create gateway output flow info - same lane, same row (straight forward)', () => {
    const positions = new Map([
      ['xor1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task1', { lane: 'lane1', layer: 1, row: 0 }]
    ]);

    const elementLanes = new Map([
      ['xor1', 'lane1'],
      ['task1', 'lane1']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal',
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const flowInfo = createGatewayOutputFlowInfo('flow1', 'xor1', 'task1', positions, elementLanes, lanes, directions);

    expect(flowInfo.source.exitSide).toBe('right');
    expect(flowInfo.target.entrySide).toBe('left');
    expect(flowInfo.waypoints.length).toBe(0);
  });

  test('should create gateway output flow info - same lane, target below (go down first)', () => {
    const positions = new Map([
      ['xor1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task1', { lane: 'lane1', layer: 1, row: 1 }]  // row 1 > row 0
    ]);

    const elementLanes = new Map([
      ['xor1', 'lane1'],
      ['task1', 'lane1']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal',
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const flowInfo = createGatewayOutputFlowInfo('flow1', 'xor1', 'task1', positions, elementLanes, lanes, directions);

    expect(flowInfo.source.exitSide).toBe('down');  // Target below → go down first
    expect(flowInfo.target.entrySide).toBe('left');
    expect(flowInfo.waypoints.length).toBe(1);
    expect(flowInfo.waypoints[0].lane).toBe('lane1');
    expect(flowInfo.waypoints[0].layer).toBe(0);  // exitSide=down: layer stays from source
    expect(flowInfo.waypoints[0].row).toBe(1);    // entrySide=left: row from target
  });

  test('should create gateway output flow info - different lanes, target lane below (go down first)', () => {
    const positions = new Map([
      ['xor1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task1', { lane: 'lane2', layer: 1, row: 0 }]  // lane2 is below lane1
    ]);

    const elementLanes = new Map([
      ['xor1', 'lane1'],
      ['task1', 'lane2']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }],
      ['lane2', { id: 'lane2' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal',
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const flowInfo = createGatewayOutputFlowInfo('flow1', 'xor1', 'task1', positions, elementLanes, lanes, directions);

    expect(flowInfo.source.exitSide).toBe('down');  // Target lane below → go down first
    expect(flowInfo.target.entrySide).toBe('left');
    expect(flowInfo.waypoints.length).toBe(1);
    expect(flowInfo.waypoints[0].lane).toBe('lane2');  // entrySide=left: lane from target
    expect(flowInfo.waypoints[0].layer).toBe(0);       // exitSide=down: layer stays from source
    expect(flowInfo.waypoints[0].row).toBe(0);         // entrySide=left: row from target
  });

  test('should create gateway output flow info - same lane, target above (go up first)', () => {
    const positions = new Map([
      ['xor1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task1', { lane: 'lane1', layer: 1, row: -1 }]  // row -1 < row 0
    ]);

    const elementLanes = new Map([
      ['xor1', 'lane1'],
      ['task1', 'lane1']
    ]);

    const lanes = new Map([
      ['lane1', { id: 'lane1' }]
    ]);

    const directions = {
      laneOrientation: 'horizontal',
      alongLane: 'right',
      oppAlongLane: 'left',
      crossLane: 'down',
      oppCrossLane: 'up'
    };

    const flowInfo = createGatewayOutputFlowInfo('flow1', 'xor1', 'task1', positions, elementLanes, lanes, directions);

    expect(flowInfo.source.exitSide).toBe('up');  // Target above → go up first
    expect(flowInfo.target.entrySide).toBe('left');
    expect(flowInfo.waypoints.length).toBe(1);
    expect(flowInfo.waypoints[0].lane).toBe('lane1');
    expect(flowInfo.waypoints[0].layer).toBe(0);  // exitSide=up: layer stays from source
    expect(flowInfo.waypoints[0].row).toBe(-1);   // entrySide=left: row from target
  });
});

describe('Phase 2: Back-Flow', () => {
  test('should create back-flow info (no waypoints)', () => {
    const positions = new Map([
      ['task1', { lane: 'lane1', layer: 0, row: 0 }],
      ['task2', { lane: 'lane2', layer: 2, row: 0 }]
    ]);

    const flowInfo = createBackFlowInfo('flow3', 'task2', 'task1', positions);

    expect(flowInfo.isBackFlow).toBe(true);
    expect(flowInfo.source.exitSide).toBe(null);  // Will be determined in Phase 3
    expect(flowInfo.target.entrySide).toBe(null);  // Will be determined in Phase 3
    expect(flowInfo.waypoints.length).toBe(0);  // Will be calculated in Phase 3
  });
});
