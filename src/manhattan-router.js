/**
 * Manhattan Router
 * 
 * Unified routing for back-flows and message flows (same-lane and cross-lane)
 * Uses nearest corridor strategy to avoid element collisions
 */

import { calculateConnectionPoint } from './phase3.js';

// Constants
const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;
const ELEMENT_HEIGHT = 80;

/**
 * Calculate all corridor Y-values in a lane
 * @param {Object} laneBound - Lane bounds with y, height, maxRows
 * @returns {Array} - Array of corridor Y-values
 */
export function getCorridorsInLane(laneBound) {
  const maxRows = laneBound.maxRows || 1;
  const referenceHeight = ELEMENT_HEIGHT;
  const paddingPerGap = (laneBound.height - maxRows * referenceHeight) / (maxRows + 1);
  
  // Calculate all row center Y-values
  const rowYs = [];
  for (let row = 0; row < maxRows; row++) {
    const rowY = laneBound.y + paddingPerGap + 
      (row * (referenceHeight + paddingPerGap)) + 
      referenceHeight / 2;
    rowYs.push(rowY);
  }
  
  // Calculate corridors between rows
  const corridors = [];
  
  // Lane-top corridor
  corridors.push(laneBound.y + CORRIDOR_OFFSET);
  
  // Corridors between rows
  for (let i = 0; i < rowYs.length - 1; i++) {
    corridors.push((rowYs[i] + rowYs[i + 1]) / 2);
  }
  
  // Lane-bottom corridor
  corridors.push(laneBound.y + laneBound.height - CORRIDOR_OFFSET);
  
  return corridors;
}

/**
 * Find nearest corridor to a given Y position
 * @param {number} y - Y position
 * @param {Array} corridors - Array of corridor Y-values
 * @param {string} direction - 'up' or 'down'
 * @returns {number} - Nearest corridor Y-value
 */
export function findNearestCorridor(y, corridors, direction) {
  if (direction === 'up') {
    // Find nearest corridor above
    const above = corridors.filter(c => c < y);
    return above.length > 0 ? above[above.length - 1] : corridors[0];
  } else {
    // Find nearest corridor below
    const below = corridors.filter(c => c > y);
    return below.length > 0 ? below[0] : corridors[corridors.length - 1];
  }
}

/**
 * Unified Manhattan routing for back-flows and message flows
 * Works for both same-lane and cross-lane scenarios
 * 
 * @param {Object} flowInfo - Flow information
 * @param {Object} sourceCoord - Source coordinates
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} sourcePos - Source position (lane, layer, row)
 * @param {Object} targetPos - Target position (lane, layer, row)
 * @param {Object} directions - Direction mappings
 * @param {Map} laneBounds - Lane boundaries
 * @returns {Array} - Waypoints
 */
export function routeManhattan(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds) {
  const waypoints = [];
  
  // Get lane bounds
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  const targetLaneBounds = laneBounds.get(targetPos.lane);
  
  if (!sourceLaneBounds || !targetLaneBounds) {
    console.error('Lane bounds not found for Manhattan routing');
    return waypoints;
  }
  
  // Determine vertical relationship
  const targetAbove = targetCoord.y < sourceCoord.y;
  const exitDirection = targetAbove ? 'up' : 'down';
  
  // Step 1: Exit source element
  const exitSide = exitDirection === 'up' ? directions.oppCrossLane : directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Update flowInfo exit side
  if (flowInfo.source) {
    flowInfo.source.exitSide = exitSide;
  }
  
  // Step 2: Move to nearest corridor in source lane
  const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
  const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, exitDirection);
  waypoints.push({ x: exitPoint.x, y: corridorY });
  
  // Step 3: Move horizontally in corridor to target column
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({ x: targetX, y: corridorY });
  
  // Step 4: Move vertically to target element level
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({ x: targetX, y: entryPoint.y });
  
  // Step 5: Enter target from left
  waypoints.push(entryPoint);
  
  // Update flowInfo entry side
  if (flowInfo.target) {
    flowInfo.target.entrySide = directions.oppAlongLane;
  }
  
  return waypoints;
}
