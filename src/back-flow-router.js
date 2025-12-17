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
import { routeSameLaneBackFlow } from './same-lane-back-flow.js';

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
 * @returns {Array} - Array of {x, y} waypoints
 */
export function routeBackFlowSmart(flowInfo, coordinates, positions, lanes, directions, flowInfos) {
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
  
  // Use different routing strategy for same-lane vs cross-lane
  if (isSameLane) {
    return routeSameLaneBackFlow(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, positions, coordinates, targetPosition, upAvailable, downAvailable, leftAvailable, rightAvailable, directions, flowInfos);
  }
  
  // Cross-lane back-flow routing:
  // Always use corridor-based routing to avoid collisions
  // Route: down/up to corridor → left in corridor → up/down to target → right into target
  
  if (targetPosition === "above") {
    // Target is above source: exit UP to nearest corridor, left, then UP to target
    if (upAvailable) {
      if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
      return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "up", lanes, positions);
    }
  } else if (targetPosition === "below") {
    // Target is below source: exit DOWN to nearest corridor, left, then DOWN to target  
    if (downAvailable) {
      if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
      return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "down", lanes, positions);
    }
  }
  
  // Fallback: if preferred exit not available, try opposite direction
  if (targetPosition === "above" && downAvailable) {
    if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
    return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "down", lanes, positions);
  } else if (targetPosition === "below" && upAvailable) {
    if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
    return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "up", lanes, positions);
  }
  
  // Last resort: use any available exit
  if (upAvailable) {
    if (flowInfo.source) flowInfo.source.exitSide = directions.oppCrossLane;
    return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "up", lanes, positions);
  } else if (downAvailable) {
    if (flowInfo.source) flowInfo.source.exitSide = directions.crossLane;
    return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "down", lanes, positions);
  }
  
  // Should never reach here, but provide fallback
  return routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, "down", lanes, positions);
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
 * @returns {Array} - Waypoints
 */
function routeCorridorPath(sourceCoord, targetCoord, sourcePos, targetPos, directions, exitDirection, lanes, positions) {
  const waypoints = [];
  
  // Step 1: Exit source element
  const exitSide = exitDirection === "up" ? directions.oppCrossLane : directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to nearest corridor
  // For single-row lanes: corridor is exactly midway between task edge and lane boundary
  // For multi-row lanes: corridor is close to element (between rows)
  
  // Check if there are multiple rows in the source lane
  const hasMultipleRows = Array.from(positions.values()).some(
    pos => pos.lane === sourcePos.lane && pos.row !== 0
  );
  
  let corridorY;
  if (hasMultipleRows) {
    // Multiple rows: corridor close to element (between rows)
    corridorY = exitDirection === "down"
      ? sourceCoord.y + sourceCoord.height + CORRIDOR_OFFSET
      : sourceCoord.y - CORRIDOR_OFFSET;
  } else {
    // Single row: corridor exactly midway between task edge and lane boundary
    // Always use TASK height (80) as reference, since tasks are the largest elements
    // LANE_BASE_HEIGHT = 180, ELEMENT_HEIGHT (task) = 80
    // Task is centered, so margin = (180 - 80) / 2 = 50
    const LANE_BASE_HEIGHT = 180;
    const ELEMENT_HEIGHT = 80; // Task height (largest element)
    const taskMargin = (LANE_BASE_HEIGHT - ELEMENT_HEIGHT) / 2;
    
    if (exitDirection === "down") {
      // Going down: midpoint between task bottom and lane bottom
      const taskBottom = sourceCoord.y + sourceCoord.height;
      const laneBottom = taskBottom + taskMargin;
      corridorY = (taskBottom + laneBottom) / 2;
    } else {
      // Going up: midpoint between task top and lane top
      const taskTop = sourceCoord.y;
      const laneTop = taskTop - taskMargin;
      corridorY = (taskTop + laneTop) / 2;
    }
  }
  
  waypoints.push({
    x: exitPoint.x,
    y: corridorY
  });
  
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
