import { describe, test, expect } from 'vitest';
import { phase1 } from '../../src/phase1.js';
import { phase2 } from '../../src/phase2.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Phase 2: Layer and Row Assignment (Snapshot-based)', () => {
  
  test('should assign correct positions and flow infos for input-4outputs.bpmn', () => {
    // Load known-good BPMN file
    const bpmnPath = join(__dirname, '../../test-data/real-world/input-4outputs.bpmn');
    const inputXml = readFileSync(bpmnPath, 'utf-8');

    // Phase 1: Parse
    const phase1Result = phase1(inputXml, { laneOrientation: 'horizontal' });
    expect(phase1Result.success).toBe(true);

    const { graph, backEdges } = phase1Result;
    const directions = { 
      alongLane: 'right', 
      oppAlongLane: 'left', 
      crossLane: 'down', 
      oppCrossLane: 'up' 
    };

    // Phase 2: Assign positions
    const phase2Result = phase2(
      graph.elements, 
      graph.flows, 
      graph.lanes, 
      directions, 
      backEdges
    );

    // Snapshot test: positions
    const positions = phase2Result.positions;
    
    // Convert Map to object for snapshot
    const positionsObj = {};
    for (const [id, pos] of positions) {
      positionsObj[id] = {
        lane: pos.lane,
        layer: pos.layer,
        row: pos.row
      };
    }

    // Snapshot: positions should match expected structure
    expect(positionsObj).toMatchSnapshot();

    // Snapshot test: flowInfos
    const flowInfos = phase2Result.flowInfos;
    
    // Convert Map to object for snapshot
    const flowInfosObj = {};
    for (const [id, info] of flowInfos) {
      flowInfosObj[id] = {
        exitSide: info.source.exitSide,
        entrySide: info.target.entrySide,
        hasWaypoint: info.waypoint !== null,
        waypoint: info.waypoint ? {
          lane: info.waypoint.lane,
          layer: info.waypoint.layer,
          row: info.waypoint.row
        } : null
      };
    }

    // Snapshot: flowInfos should match expected structure
    expect(flowInfosObj).toMatchSnapshot();
  });

  test('should assign correct positions for simple-3-lane.bpmn', () => {
    // Load another known-good BPMN file
    const bpmnPath = join(__dirname, '../../test-data/simple-3-lane.bpmn');
    const inputXml = readFileSync(bpmnPath, 'utf-8');

    // Phase 1: Parse
    const phase1Result = phase1(inputXml, { laneOrientation: 'horizontal' });
    expect(phase1Result.success).toBe(true);

    const { graph, backEdges } = phase1Result;
    const directions = { 
      alongLane: 'right', 
      oppAlongLane: 'left', 
      crossLane: 'down', 
      oppCrossLane: 'up' 
    };

    // Phase 2: Assign positions
    const phase2Result = phase2(
      graph.elements, 
      graph.flows, 
      graph.lanes, 
      directions, 
      backEdges
    );

    // Snapshot test: positions
    const positions = phase2Result.positions;
    
    const positionsObj = {};
    for (const [id, pos] of positions) {
      positionsObj[id] = {
        lane: pos.lane,
        layer: pos.layer,
        row: pos.row
      };
    }

    expect(positionsObj).toMatchSnapshot();
  });

  test('should handle gateway with multiple outputs correctly', () => {
    // This tests the 4outputs pattern specifically
    const bpmnPath = join(__dirname, '../../test-data/real-world/input-4outputs.bpmn');
    const inputXml = readFileSync(bpmnPath, 'utf-8');

    const phase1Result = phase1(inputXml, { laneOrientation: 'horizontal' });
    const { graph, backEdges } = phase1Result;
    const directions = { 
      alongLane: 'right', 
      oppAlongLane: 'left', 
      crossLane: 'down', 
      oppCrossLane: 'up' 
    };

    const phase2Result = phase2(
      graph.elements, 
      graph.flows, 
      graph.lanes, 
      directions, 
      backEdges
    );

    const positions = phase2Result.positions;

    // Specific assertions for this pattern
    // Gateway should be at row 0
    expect(positions.get('gw1').row).toBe(0);

    // Gateway outputs should be in different rows (symmetric)
    const task2Row = positions.get('task2').row;
    const task3Row = positions.get('task3').row;
    const task4Row = positions.get('task4').row;
    const task5Row = positions.get('task5').row;

    // All tasks should have different rows
    const rows = new Set([task2Row, task3Row, task4Row, task5Row]);
    expect(rows.size).toBe(4); // All unique

    // End event should be shifted (multi-input adjustment)
    const endLayer = positions.get('end1').layer;
    const task2Layer = positions.get('task2').layer;
    expect(endLayer).toBeGreaterThan(task2Layer);
  });
});
