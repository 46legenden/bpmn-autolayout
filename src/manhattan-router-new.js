/**
 * Manhattan Router (Refactored)
 * 
 * Unified routing for back-flows and message flows (same-lane and cross-lane)
 * Uses nearest corridor strategy with full waypoint collision detection
 */

import { calculateConnectionPoint } from './phase3.js';
import { hasWaypointCollision } from './waypoint-collision.js';

// Constants
const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;
const ELEMENT_HEIGHT = 80;

/**
 * Get all corridor Y-values in a lane
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
 * Find nearest corridor to a Y position
 * @param {number} y - Source Y position
 * @param {Array} corridors - Available corridors (sorted)
 * @param {string} direction - 'up' or 'down'
 * @returns {number} - Nearest corridor Y value
 */
export function findNearestCorridor(y, corridors, direction) {
  if (corridors.length === 0) return y;
  
  // Filter corridors by direction
  const above = corridors.filter(c => c < y);
  const below = corridors.filter(c => c > y);
  
  if (direction === 'up') {
    return above.length > 0 ? above[above.length - 1] : corridors[0];
  } else {
    return below.length > 0 ? below[0] : corridors[corridors.length - 1];
  }
}

/**
 * Check if vertical path to target is clear
 */
function isVerticalPathToTargetClear(corridorY, targetCoord, targetPos, positions, coordinates, targetId) {
  const targetCenterX = targetCoord.x + targetCoord.width / 2;
  const targetLayer = targetPos.layer;
  const targetLane = targetPos.lane;
  
  // Check if any other element is in the same column (layer) and lane
  for (const [elementId, pos] of positions) {
    if (elementId === targetId) continue;
    if (pos.lane !== targetLane) continue;
    if (pos.layer !== targetLayer) continue;
    
    // Element in same column - check if it blocks the path
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
    const minY = Math.min(corridorY, targetCoord.y);
    const maxY = Math.max(corridorY, targetCoord.y + targetCoord.height);
    
    if (coord.y < maxY && coord.y + coord.height > minY) {
      return false; // Element blocks the path
    }
  }
  
  return true;
}

/**
 * Calculate waypoints for a given corridor
 */
function calculateWaypointsWithCorridor(corridorY, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, exitDirection) {
  const waypoints = [];
  
  // Step 1: Exit source element
  const exitSide = exitDirection === 'up' ? directions.oppCrossLane : directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to corridor
  waypoints.push({ x: exitPoint.x, y: corridorY });
  
  // Step 3: Move horizontally in corridor
  const targetCenterX = targetCoord.x + targetCoord.width / 2;
  const canEnterDirectly = positions && coordinates && 
    isVerticalPathToTargetClear(corridorY, targetCoord, targetPos, positions, coordinates, flowInfo.targetId);
  
  if (canEnterDirectly) {
    // Optimized path: Go directly to target column, then enter from top/bottom
    waypoints.push({ x: targetCenterX, y: corridorY });
    
    // Enter from top or bottom
    const entrySide = exitDirection === 'up' ? directions.crossLane : directions.oppCrossLane;
    const entryPoint = calculateConnectionPoint(targetCoord, entrySide);
    waypoints.push(entryPoint);
    
    // Update flowInfo
    if (flowInfo.source) flowInfo.source.exitSide = exitSide;
    if (flowInfo.target) flowInfo.target.entrySide = entrySide;
  } else {
    // Default path: Go left of target, then enter from left
    const targetX = targetCoord.x - LAYER_OFFSET / 2;
    waypoints.push({ x: targetX, y: corridorY });
    
    // Move vertically to target element level
    const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
    waypoints.push({ x: targetX, y: entryPoint.y });
    
    // Enter target from left
    waypoints.push(entryPoint);
    
    // Update flowInfo
    if (flowInfo.source) flowInfo.source.exitSide = exitSide;
    if (flowInfo.target) flowInfo.target.entrySide = directions.oppAlongLane;
  }
  
  return waypoints;
}

/**
 * Manhattan routing with full waypoint collision detection
 */
export function routeManhattan(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, corridorUsage = null, flowInfos = null, flowWaypoints = null) {
  // Get lane bounds
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  const targetLaneBounds = laneBounds.get(targetPos.lane);
  
  if (!sourceLaneBounds || !targetLaneBounds) {
    console.error('Lane bounds not found for Manhattan routing');
    return [];
  }
  
  // Determine vertical relationship
  const targetAbove = targetCoord.y < sourceCoord.y;
  const exitDirection = targetAbove ? 'up' : 'down';
  
  // Get available corridors
  const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
  
  // Try corridors in order of proximity until we find one without collision
  const triedCorridors = new Set();
  
  while (triedCorridors.size < sourceCorridors.length) {
    // Find nearest untried corridor
    const remainingCorridors = sourceCorridors.filter(c => !triedCorridors.has(c));
    if (remainingCorridors.length === 0) break;
    
    const corridorY = findNearestCorridor(sourceCoord.y, remainingCorridors, exitDirection);
    triedCorridors.add(corridorY);
    
    // Calculate complete waypoints with this corridor
    const waypoints = calculateWaypointsWithCorridor(
      corridorY, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
      directions, laneBounds, positions, coordinates, exitDirection
    );
    
    // Test for collision with existing flows
    if (flowWaypoints && hasWaypointCollision(waypoints, flowWaypoints, flowInfo.flowId)) {
      // Collision detected - try next corridor
      continue;
    }
    
    // No collision - use these waypoints
    return waypoints;
  }
  
  // All corridors have collisions - use the first one anyway (fallback)
  const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, exitDirection);
  return calculateWaypointsWithCorridor(
    corridorY, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
    directions, laneBounds, positions, coordinates, exitDirection
  );
}
