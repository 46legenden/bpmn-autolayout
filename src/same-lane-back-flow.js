/**
 * Same-Lane Back-Flow Router
 * 
 * Special routing for back-flows within the same lane.
 * Prefers going left (within lane corridors) over going right.
 */

import { isVerticalPathClear } from './path-checker.js';
import { calculateConnectionPoint } from './phase3.js';

// Constants
const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;

/**
 * Route same-lane back-flow with left-around preference
 * @param {Object} flowInfo - Flow information
 * @param {Object} sourceCoord - Source coordinates
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} sourcePos - Source position
 * @param {Object} targetPos - Target position
 * @param {Map} positions - All positions
 * @param {Map} coordinates - All coordinates
 * @param {string} targetPosition - "above" or "below"
 * @param {boolean} upAvailable - Up exit available
 * @param {boolean} downAvailable - Down exit available
 * @param {boolean} leftAvailable - Left exit available
 * @param {boolean} rightAvailable - Right exit available
 * @param {Object} directions - Direction mappings
 * @param {Map} flowInfos - All flow information
 * @returns {Array} - Waypoints
 */
export function routeSameLaneBackFlow(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, positions, coordinates, targetPosition, upAvailable, downAvailable, leftAvailable, rightAvailable, directions, flowInfos, laneBounds) {
  // Get lane bounds for source lane
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  
  // Strategy 1: Try up → left → down → right (if target above and up clear)
  if (targetPosition === "above" && upAvailable) {
    if (isVerticalPathClear(flowInfo.sourceId, flowInfo.targetId, sourcePos, targetPos, positions, coordinates, "up")) {
      // Update flowInfo exitSide
      if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
      return routeUpLeftDownRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
    }
  }
  
  // Strategy 2: Try down → left → up → right (if target above but up blocked, down available)
  if (targetPosition === "above" && downAvailable) {
    // Update flowInfo exitSide
    if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
    return routeDownLeftUpRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
  }
  
  // Strategy 3: Try down → left → up → right (if target below and down clear)
  if (targetPosition === "below" && downAvailable) {
    if (isVerticalPathClear(flowInfo.sourceId, flowInfo.targetId, sourcePos, targetPos, positions, coordinates, "down")) {
      // Update flowInfo exitSide
      if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
      return routeDownLeftUpRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
    }
  }
  
  // Strategy 4: Try up → left → down → right (if target below but down blocked, up available)
  if (targetPosition === "below" && upAvailable) {
    // Update flowInfo exitSide
    if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
    return routeUpLeftDownRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
  }
  
  // Strategy 5: Try right → up/down → left → right (if left blocked, right available)
  if (rightAvailable) {
    // Update flowInfo exitSide
    if (flowInfo.source) flowInfo.source.exitSide = directions.alongLane;
    if (targetPosition === "above") {
      return routeRightUpLeftRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
    } else {
      return routeRightDownLeftRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
    }
  }
  
  // Strategy 6: Default - go through even if blocked
  if (targetPosition === "above") {
    if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
    return routeUpLeftDownRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
  } else {
    if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
    return routeDownLeftUpRight(sourceCoord, targetCoord, directions, sourceLaneBounds);
  }
}

/**
 * Route: Up → Left → Down → Right
 */
function routeUpLeftDownRight(sourceCoord, targetCoord, directions, laneBounds) {
  const waypoints = [];
  
  // Exit up
  const exitPoint = calculateConnectionPoint(sourceCoord, directions.oppCrossLane);
  waypoints.push(exitPoint);
  
  // Go up to corridor (lane top + offset)
  const corridorY = laneBounds.y + CORRIDOR_OFFSET;
  waypoints.push({
    x: exitPoint.x,
    y: corridorY
  });
  
  // Go left to target column
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Go down to target entry level
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  // Enter target from left
  waypoints.push(entryPoint);
  
  return waypoints;
}

/**
 * Route: Down → Left → Up → Right
 */
function routeDownLeftUpRight(sourceCoord, targetCoord, directions, laneBounds) {
  const waypoints = [];
  
  // Exit down
  const exitPoint = calculateConnectionPoint(sourceCoord, directions.crossLane);
  waypoints.push(exitPoint);
  
  // Go down to corridor (lane bottom - offset)
  const corridorY = laneBounds.y + laneBounds.height - CORRIDOR_OFFSET;
  waypoints.push({
    x: exitPoint.x,
    y: corridorY
  });
  
  // Go left to target column
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Go up to target entry level
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  // Enter target from left
  waypoints.push(entryPoint);
  
  return waypoints;
}

/**
 * Route: Right → Up → Left → Right
 */
function routeRightUpLeftRight(sourceCoord, targetCoord, directions, laneBounds) {
  const waypoints = [];
  
  // Exit right
  const exitPoint = calculateConnectionPoint(sourceCoord, directions.alongLane);
  waypoints.push(exitPoint);
  
  // Go right to clear source
  const corridorX = sourceCoord.x + sourceCoord.width + CORRIDOR_OFFSET;
  waypoints.push({
    x: corridorX,
    y: exitPoint.y
  });
  
  // Go up to corridor (lane top + offset)
  const corridorY = laneBounds.y + CORRIDOR_OFFSET;
  waypoints.push({
    x: corridorX,
    y: corridorY
  });
  
  // Go left to target column
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Go down to target entry
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  // Enter target from left
  waypoints.push(entryPoint);
  
  return waypoints;
}

/**
 * Route: Right → Down → Left → Right
 */
function routeRightDownLeftRight(sourceCoord, targetCoord, directions, laneBounds) {
  const waypoints = [];
  
  // Exit right
  const exitPoint = calculateConnectionPoint(sourceCoord, directions.alongLane);
  waypoints.push(exitPoint);
  
  // Go right to clear source
  const corridorX = sourceCoord.x + sourceCoord.width + CORRIDOR_OFFSET;
  waypoints.push({
    x: corridorX,
    y: exitPoint.y
  });
  
  // Go down to corridor (lane bottom - offset)
  const corridorY = laneBounds.y + laneBounds.height - CORRIDOR_OFFSET;
  waypoints.push({
    x: corridorX,
    y: corridorY
  });
  
  // Go left to target column
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Go up to target entry
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  // Enter target from left
  waypoints.push(entryPoint);
  
  return waypoints;
}
