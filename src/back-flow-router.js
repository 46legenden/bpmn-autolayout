/**
 * Back-Flow Router with Smart Path Selection
 * 
 * Implements 3-tier routing strategy:
 * 1. Direct path (if clear)
 * 2. Right-around path (if direct blocked)
 * 3. Default path (fallback)
 */

import { isVerticalPathClear, isExitSideAvailable, getTargetVerticalPosition } from './path-checker.js';
import { calculateConnectionPoint } from './phase3.js';
import { routeManhattan } from './manhattan-router.js';
import { routeBackFlowCascade } from './backflow-cascade-router.js';

// Constants from phase3
const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;

/**
 * Route a back-flow with smart path selection
 * @param {Object} flowInfo - Flow information
 * @param {Map} coordinates - Element coordinates
 * @param {Map} positions - Element positions
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @param {Map} flowInfos - All flow information
 * @param {Map} laneBounds - Lane boundaries {x, y, width, height}
 * @returns {Array} - Array of {x, y} waypoints
 */
export function routeBackFlowSmart(flowInfo, coordinates, positions, lanes, directions, flowInfos, laneBounds, corridorUsage = null, flowWaypoints = null) {

  const sourceCoord = coordinates.get(flowInfo.sourceId);
  const targetCoord = coordinates.get(flowInfo.targetId);
  
  const sourcePos = positions.get(flowInfo.sourceId);
  const targetPos = positions.get(flowInfo.targetId);
  
  // Check if same-lane or cross-lane back-flow
  const isSameLane = sourcePos.lane === targetPos.lane;
  
  // Determine if target is above or below
  const targetPosition = getTargetVerticalPosition(sourcePos, targetPos, lanes);
  
  // Determine which exit sides are available
  const upAvailable = isExitSideAvailable(flowInfo.sourceId, directions.oppCrossLane, flowInfos, flowInfo.flowId);
  const downAvailable = isExitSideAvailable(flowInfo.sourceId, directions.crossLane, flowInfos, flowInfo.flowId);
  const rightAvailable = isExitSideAvailable(flowInfo.sourceId, directions.alongLane, flowInfos, flowInfo.flowId);
  const leftAvailable = isExitSideAvailable(flowInfo.sourceId, directions.oppAlongLane, flowInfos, flowInfo.flowId);
  
  // Check if this is a true back-flow (target layer < source layer)
  const isBackFlow = targetPos.layer < sourcePos.layer;
  
  if (isBackFlow) {
    // Use cascading routing strategy for back-flows
    return routeBackFlowCascade(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, flowWaypoints);
  } else {
    // Use unified Manhattan routing for other flows
    return routeManhattan(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, corridorUsage, flowInfos, flowWaypoints);
  }
}

/**
 * Route through lane corridor (exit to corridor → left in corridor → approach target → enter)
 * @param {Object} sourceCoord - Source coordinates
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} sourcePos - Source position {lane, layer, row}
 * @param {Object} targetPos - Target position {lane, layer, row}
 * @param {Object} directions - Direction mappings
 * @param {string} exitDirection - "up" or "down" (direction to exit source)
 * @param {Map} lanes - Lane map
 * @param {Map} positions - Element positions (to check for multiple rows)
 * @param {Map} laneBounds - Lane boundaries {x, y, width, height}
 * @returns {Array} - Waypoints
 */
function routeCorridorPath(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, exitDirection, directions, positions, laneBounds) {
  const waypoints = [];
  
  // Step 1: Exit source element
  const exitSide = exitDirection === "up" ? directions.oppCrossLane : directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to nearest corridor
  // For single-row lanes: corridor is exactly midway between task edge and lane boundary
  // For multi-row lanes: corridor is close to element (between rows)
  
  // Get lane bounds for the source lane
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  
  let corridorY;
  if (!sourceLaneBounds) {
    console.error(`Lane bounds not found for lane: ${sourcePos.lane}`);
    // Fallback to element-based calculation
    corridorY = exitDirection === "up"
      ? sourceCoord.y - 25
      : sourceCoord.y + sourceCoord.height + 25;
  } else {
    // Use nearest corridor (between rows or at lane edge)
    const corridors = getCorridorsInLane(sourceLaneBounds);
    corridorY = findNearestCorridor(sourceCoord.y, corridors, exitDirection);
  }
  
  waypoints.push({ x: exitPoint.x, y: corridorY });
  
  // Step 3: Move left in corridor to before target X
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Step 4: Move vertically to target element level
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  // Step 5: Enter target from left
  waypoints.push(entryPoint);
  
  return waypoints;
}

/**
 * Route direct path (up/down → left → down/up) - DEPRECATED, use routeCorridorPath instead
 * @param {Object} sourceCoord - Source coordinates
 * @param {Object} targetCoord - Target coordinates
 * @param {string} exitSide - Exit side ("up" or "down")
 * @param {Object} directions - Direction mappings
 * @param {string} verticalDirection - "up" or "down"
 * @returns {Array} - Waypoints
 */
function routeDirectPath(sourceCoord, targetCoord, exitSide, directions, verticalDirection) {
  const waypoints = [];
  
  // Exit source
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Move to corridor (just above/below target)
  const corridorY = verticalDirection === "up" 
    ? targetCoord.y - CORRIDOR_OFFSET 
    : targetCoord.y + targetCoord.height + CORRIDOR_OFFSET;
  
  waypoints.push({
    x: exitPoint.x,
    y: corridorY
  });
  
  // Move left to target X
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Enter target from left
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  waypoints.push(entryPoint);
  
  return waypoints;
}

/**
 * Route right-around path (right → up/down → left → down/up)
 * @param {Object} sourceCoord - Source coordinates
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} directions - Direction mappings
 * @param {string} verticalDirection - "up" or "down"
 * @returns {Array} - Waypoints
 */
function routeRightAroundPath(sourceCoord, targetCoord, directions, verticalDirection) {
  const waypoints = [];
  
  // Exit source to the right
  const exitPoint = calculateConnectionPoint(sourceCoord, directions.alongLane);
  waypoints.push(exitPoint);
  
  // Move right to corridor between columns
  const corridorX = sourceCoord.x + sourceCoord.width + LAYER_OFFSET / 2;
  waypoints.push({
    x: corridorX,
    y: exitPoint.y
  });
  
  // Move up/down to target level
  const corridorY = verticalDirection === "up"
    ? targetCoord.y - CORRIDOR_OFFSET
    : targetCoord.y + targetCoord.height + CORRIDOR_OFFSET;
  
  waypoints.push({
    x: corridorX,
    y: corridorY
  });
  
  // Move left to target X
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({
    x: targetX,
    y: corridorY
  });
  
  // Enter target from left
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({
    x: targetX,
    y: entryPoint.y
  });
  
  waypoints.push(entryPoint);
  
  return waypoints;
}
