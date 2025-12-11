import { describe, test, expect } from 'vitest';
import { phase1 } from '../../src/phase1.js';
import { phase2 } from '../../src/phase2.js';
import { phase3 } from '../../src/phase3.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Phase 3: Coordinate Calculation (Snapshot-based)', () => {
  
  test('should calculate correct coordinates for input-4outputs.bpmn', () => {
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

    // Phase 3: Calculate coordinates
    const phase3Result = phase3(
      phase2Result,
      graph.elements,
      graph.lanes,
      directions
    );

    // Snapshot test: element coordinates
    const coordinates = phase3Result.coordinates;
    
    const coordinatesObj = {};
    for (const [id, coord] of coordinates) {
      coordinatesObj[id] = {
        x: coord.x,
        y: coord.y,
        width: coord.width,
        height: coord.height
      };
    }

    expect(coordinatesObj).toMatchSnapshot();

    // Snapshot test: flow waypoints
    const flowWaypoints = phase3Result.flowWaypoints;
    
    const waypointsObj = {};
    for (const [id, waypoints] of flowWaypoints) {
      waypointsObj[id] = waypoints.map(wp => ({ x: wp.x, y: wp.y }));
    }

    expect(waypointsObj).toMatchSnapshot();
  });

  test('should calculate correct coordinates for simple-3-lane.bpmn', () => {
    const bpmnPath = join(__dirname, '../../test-data/simple-3-lane.bpmn');
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

    const phase3Result = phase3(
      phase2Result,
      graph.elements,
      graph.lanes,
      directions
    );

    const coordinates = phase3Result.coordinates;
    
    const coordinatesObj = {};
    for (const [id, coord] of coordinates) {
      coordinatesObj[id] = {
        x: coord.x,
        y: coord.y,
        width: coord.width,
        height: coord.height
      };
    }

    expect(coordinatesObj).toMatchSnapshot();
  });

  test('should have correct element sizes', () => {
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

    const phase3Result = phase3(
      phase2Result,
      graph.elements,
      graph.lanes,
      directions
    );

    const coordinates = phase3Result.coordinates;

    // Check element sizes
    // Start/End events should be 36x36
    expect(coordinates.get('start1').width).toBe(36);
    expect(coordinates.get('start1').height).toBe(36);
    expect(coordinates.get('end1').width).toBe(36);
    expect(coordinates.get('end1').height).toBe(36);

    // Tasks should be 100x80
    expect(coordinates.get('task1').width).toBe(100);
    expect(coordinates.get('task1').height).toBe(80);
    expect(coordinates.get('task2').width).toBe(100);
    expect(coordinates.get('task2').height).toBe(80);

    // Gateway should be 50x50
    expect(coordinates.get('gw1').width).toBe(50);
    expect(coordinates.get('gw1').height).toBe(50);
  });

  test('should have no NaN values in coordinates', () => {
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

    const phase3Result = phase3(
      phase2Result,
      graph.elements,
      graph.lanes,
      directions
    );

    // Check coordinates for NaN
    for (const [id, coord] of phase3Result.coordinates) {
      expect(Number.isNaN(coord.x)).toBe(false);
      expect(Number.isNaN(coord.y)).toBe(false);
      expect(Number.isNaN(coord.width)).toBe(false);
      expect(Number.isNaN(coord.height)).toBe(false);
    }

    // Check waypoints for NaN
    for (const [id, waypoints] of phase3Result.flowWaypoints) {
      for (const wp of waypoints) {
        expect(Number.isNaN(wp.x)).toBe(false);
        expect(Number.isNaN(wp.y)).toBe(false);
      }
    }
  });
});
