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
 * Check if vertical path from corridor to target is clear
 * @param {number} corridorY - Y position of corridor
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} targetPos - Target position (lane, layer, row)
 * @param {Map} positions - All element positions
 * @param {Map} coordinates - All element coordinates
 * @param {string} flowId - Current flow ID (to exclude from check)
 * @returns {boolean} - True if path is clear
 */
function isVerticalPathToTargetClear(corridorY, targetCoord, targetPos, positions, coordinates, targetId) {
  // Check if any elements are in the target column between corridor and target
  const targetX = targetCoord.x + targetCoord.width / 2;
  const minY = Math.min(corridorY, targetCoord.y);
  const maxY = Math.max(corridorY, targetCoord.y + targetCoord.height);
  
  for (const [elementId, pos] of positions) {
    // Skip the target element itself
    if (elementId === targetId) continue;
    
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
    // Check if element is in same column (layer)
    if (pos.layer === targetPos.layer) {
      // Check if element is between corridor and target
      const elementCenterY = coord.y + coord.height / 2;
      if (elementCenterY > minY && elementCenterY < maxY) {
        return false; // Element blocks the path
      }
    }
  }
  
  return true; // Path is clear
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
 * @param {Map} positions - All element positions (for path checking)
 * @param {Map} coordinates - All element coordinates (for path checking)
 * @returns {Array} - Waypoints
 */
export function routeManhattan(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates) {
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
  
  // Step 3: Move horizontally in corridor
  // Check if we can go directly to target column or need to go left first
  const targetCenterX = targetCoord.x + targetCoord.width / 2;
  const canEnterDirectly = positions && coordinates && 
    isVerticalPathToTargetClear(corridorY, targetCoord, targetPos, positions, coordinates, flowInfo.targetId);
  
  if (canEnterDirectly) {
    // Optimized path: Go directly to target column, then enter from top/bottom
    waypoints.push({ x: targetCenterX, y: corridorY });
    
    // Enter from top or bottom (depending on where we came from)
    const entrySide = exitDirection === 'up' ? directions.crossLane : directions.oppCrossLane;
    const entryPoint = calculateConnectionPoint(targetCoord, entrySide);
    waypoints.push(entryPoint);
    
    // Update flowInfo entry side
    if (flowInfo.target) {
      flowInfo.target.entrySide = entrySide;
    }
  } else {
    // Default path: Go left of target, then enter from left
    const targetX = targetCoord.x - LAYER_OFFSET / 2;
    waypoints.push({ x: targetX, y: corridorY });
    
    // Move vertically to target element level
    const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
    waypoints.push({ x: targetX, y: entryPoint.y });
    
    // Enter target from left
    waypoints.push(entryPoint);
    
    // Update flowInfo entry side
    if (flowInfo.target) {
      flowInfo.target.entrySide = directions.oppAlongLane;
    }
  }
  
  return waypoints;
}
