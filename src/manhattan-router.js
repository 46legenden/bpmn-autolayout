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
 * Check if vertical path to target column has flow collision
 */
function hasVerticalFlowCollision(corridorY, targetCenterX, targetCoord, flowWaypoints, flowId) {
  const minY = Math.min(corridorY, targetCoord.y);
  const maxY = Math.max(corridorY, targetCoord.y + targetCoord.height);
  const tolerance = 5; // Allow small tolerance
  
  for (const [existingFlowId, waypoints] of flowWaypoints) {
    if (existingFlowId === flowId) continue;
    
    // Check each segment
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      
      // Check if this is a vertical segment near target column
      if (Math.abs(p1.x - p2.x) < 1 && Math.abs(p1.x - targetCenterX) < tolerance) {
        const segMinY = Math.min(p1.y, p2.y);
        const segMaxY = Math.max(p1.y, p2.y);
        
        // Check for Y overlap
        if (!(maxY < segMinY || minY > segMaxY)) {
          return true; // Collision!
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if vertical path to target is clear (element collision)
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
function calculateWaypointsWithCorridor(corridorY, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, exitDirection, flowWaypoints) {
  const waypoints = [];
  
  // Step 1: Exit source element
  const exitSide = exitDirection === 'up' ? directions.oppCrossLane : directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to corridor
  waypoints.push({ x: exitPoint.x, y: corridorY });
  
  // Step 3: Move horizontally in corridor
  const targetCenterX = targetCoord.x + targetCoord.width / 2;
  
  // Check both element collision and flow collision
  const noElementCollision = positions && coordinates && 
    isVerticalPathToTargetClear(corridorY, targetCoord, targetPos, positions, coordinates, flowInfo.targetId);
  const noFlowCollision = !flowWaypoints || 
    !hasVerticalFlowCollision(corridorY, targetCenterX, targetCoord, flowWaypoints, flowInfo.flowId);
  
  const canEnterDirectly = noElementCollision && noFlowCollision;
  
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
    // Fallback path: Go left of target, then enter from bottom
    const targetX = targetCoord.x - LAYER_OFFSET / 2;
    waypoints.push({ x: targetX, y: corridorY });
    
    // Move vertically to below target (with offset)
    const belowTargetY = targetCoord.y + targetCoord.height + 20;
    waypoints.push({ x: targetX, y: belowTargetY });
    
    // Move horizontally to target center
    waypoints.push({ x: targetCenterX, y: belowTargetY });
    
    // Enter target from bottom
    const entryPoint = calculateConnectionPoint(targetCoord, directions.crossLane);
    waypoints.push(entryPoint);
    
    // Update flowInfo
    if (flowInfo.source) flowInfo.source.exitSide = exitSide;
    if (flowInfo.target) flowInfo.target.entrySide = directions.crossLane;
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
      directions, laneBounds, positions, coordinates, exitDirection, flowWaypoints
    );
    
    // Test for collision with existing flows
    if (flowWaypoints) {
      const hasCollision = hasWaypointCollision(waypoints, flowWaypoints, flowInfo.flowId);
      if (hasCollision) {
        // Collision detected - try next corridor
        continue;
      }
    }
    
    // No collision - use these waypoints
    return waypoints;
  }
  
  // All corridors have collisions - use the first one anyway (fallback)
  const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, exitDirection);
  return calculateWaypointsWithCorridor(
    corridorY, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
    directions, laneBounds, positions, coordinates, exitDirection, flowWaypoints
  );
}
