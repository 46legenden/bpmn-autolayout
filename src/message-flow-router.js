/**
 * Message-Flow Router
 * 
 * Routes message flows between pools with:
 * - Exit-side availability checking
 * - Entry-side availability checking
 * - Corridor navigation with priorities
 * - Collision detection
 */

import { calculateConnectionPoint } from './phase3.js';
import { hasWaypointCollision } from './waypoint-collision.js';
import { getCorridorsInLane, findNearestCorridor } from './manhattan-router.js';

const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;
const POOL_VERTICAL_SPACING = 50; // Spacing between pools

/**
 * Check which exit sides are available (not used by other flows)
 * Uses exact waypoint coordinate matching
 */
function getAvailableExitSides(sourceId, sourceCoord, directions, flowWaypoints, currentFlowId) {
  // Calculate exact connection point coordinates for all 4 sides
  const connectionPoints = {
    up: calculateConnectionPoint(sourceCoord, directions.oppCrossLane),
    down: calculateConnectionPoint(sourceCoord, directions.crossLane),
    left: calculateConnectionPoint(sourceCoord, directions.oppAlongLane),
    right: calculateConnectionPoint(sourceCoord, directions.alongLane)
  };
  
  const usedSides = new Set();
  
  
  // Check all waypoints in all flows
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === currentFlowId) continue;
    if (!waypoints || waypoints.length === 0) continue;
    
    // Check if any waypoint matches any connection point exactly
    for (const waypoint of waypoints) {
      for (const [side, point] of Object.entries(connectionPoints)) {
        if (waypoint.x === point.x && waypoint.y === point.y) {
          usedSides.add(side);
        }
      }
    }
  }
  
  return {
    up: !usedSides.has('up'),
    down: !usedSides.has('down'),
    left: !usedSides.has('left'),
    right: !usedSides.has('right')
  };
}

/**
 * Check which entry sides are available (not used by other flows)
 * Uses exact waypoint coordinate matching
 */
function getAvailableEntrySides(targetId, targetCoord, directions, flowWaypoints, currentFlowId) {
  // Calculate exact connection point coordinates for all 4 sides
  const connectionPoints = {
    up: calculateConnectionPoint(targetCoord, directions.oppCrossLane),
    down: calculateConnectionPoint(targetCoord, directions.crossLane),
    left: calculateConnectionPoint(targetCoord, directions.oppAlongLane),
    right: calculateConnectionPoint(targetCoord, directions.alongLane)
  };
  
  const usedSides = new Set();
  
  
  // Check all waypoints in all flows
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === currentFlowId) continue;
    if (!waypoints || waypoints.length === 0) continue;
    
    // Check if any waypoint matches any connection point exactly
    for (const waypoint of waypoints) {
      for (const [side, point] of Object.entries(connectionPoints)) {
        if (waypoint.x === point.x && waypoint.y === point.y) {
          usedSides.add(side);
        }
      }
    }
  }
  
  return {
    up: !usedSides.has('up'),
    down: !usedSides.has('down'),
    left: !usedSides.has('left'),
    right: !usedSides.has('right')
  };
}

/**
 * Route message flow with exit/entry checking and corridor navigation
 */
export function routeMessageFlow(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, flowWaypoints, flowInfos) {
  
  // Get available exit and entry sides
  const availableExits = getAvailableExitSides(flowInfo.sourceId, sourceCoord, directions, flowWaypoints, flowInfo.flowId);
  const availableEntries = getAvailableEntrySides(flowInfo.targetId, targetCoord, directions, flowWaypoints, flowInfo.flowId);
  
  
  // Determine vertical relationship (is target above or below source?)
  const targetAbove = targetCoord.y < sourceCoord.y;
  
  // Define exit priority based on target direction
  const exitPriority = targetAbove 
    ? ['up', 'down', 'left', 'right']
    : ['down', 'up', 'left', 'right'];
  
  // Define entry priority based on approach direction
  // If target is above source (going up), prefer entering from bottom (down)
  // If target is below source (going down), prefer entering from top (up)
  const entryPriority = targetAbove
    ? ['down', 'up', 'left', 'right']  // Going up: enter from bottom
    : ['up', 'down', 'left', 'right'];  // Going down: enter from top
  
  // Try all combinations of exit and entry sides
  for (const exitSide of exitPriority) {
    if (!availableExits[exitSide]) {
      continue;
    }
    
    for (const entrySide of entryPriority) {
      if (!availableEntries[entrySide]) {
        continue;
      }
      
      // Try to route with this exit/entry combination
      const waypoints = calculateMessageFlowWaypoints(
        flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
        exitSide, entrySide, directions, laneBounds, coordinates
      );
      
      if (!waypoints || waypoints.length === 0) {
        continue;
      }
      
      // Test for collision
      if (flowWaypoints) {
        const hasCollision = hasWaypointCollision(waypoints, flowWaypoints, flowInfo.flowId);
        if (!hasCollision) {
          // Success! Use this routing
          return waypoints;
        } else {
        }
      } else {
        // No collision detection - use first valid routing
        return waypoints;
      }
    }
  }
  
  // Fallback: Use first available exit and entry
  const fallbackExit = exitPriority.find(side => availableExits[side]) || 'down';
  const fallbackEntry = entryPriority.find(side => availableEntries[side]) || 'up';
  
  return calculateMessageFlowWaypoints(
    flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
    fallbackExit, fallbackEntry, directions, laneBounds, coordinates
  );
}

/**
 * Check if vertical column at targetX is free of obstacles between sourceY and targetY
 */
function isVerticalColumnFree(targetX, sourceY, targetY, sourceCoord, targetCoord, coordinates) {
  if (!coordinates) return false;
  
  const minY = Math.min(sourceY, targetY);
  const maxY = Math.max(sourceY, targetY);
  const TOLERANCE = 50; // X-position tolerance for "same column"
  
  // Check all elements
  for (const [elementId, coord] of coordinates) {
    // Skip source and target themselves
    if (coord === sourceCoord || coord === targetCoord) continue;
    
    // Check if element is in the vertical range
    const elementBottom = coord.y + coord.height;
    const elementTop = coord.y;
    
    // Element overlaps with vertical range?
    if (elementBottom > minY && elementTop < maxY) {
      // Element is in same X-column as target?
      const elementLeft = coord.x;
      const elementRight = coord.x + coord.width;
      
      if (Math.abs(elementLeft - targetX) < TOLERANCE || 
          Math.abs(elementRight - targetX) < TOLERANCE ||
          (elementLeft < targetX && elementRight > targetX)) {
        // Obstacle found in vertical column
        return false;
      }
    }
  }
  
  return true; // Column is free
}

/**
 * Calculate waypoints for message flow with corridor-based navigation
 */
function calculateMessageFlowWaypoints(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, exitSide, entrySide, directions, laneBounds, coordinates) {
  const waypoints = [];
  
  // Map exit/entry sides to direction constants
  const exitSideMap = {
    'up': directions.oppCrossLane,
    'down': directions.crossLane,
    'left': directions.oppAlongLane,
    'right': directions.alongLane
  };
  
  const entrySideMap = {
    'up': directions.oppCrossLane,
    'down': directions.crossLane,
    'left': directions.oppAlongLane,
    'right': directions.alongLane
  };
  
  // Step 1: Exit source element
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSideMap[exitSide]);
  waypoints.push(exitPoint);
  
  // Step 2: Move to corridor outside source element
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  const targetLaneBounds = laneBounds.get(targetPos.lane);
  const entryPoint = calculateConnectionPoint(targetCoord, entrySideMap[entrySide]);
  
  if (exitSide === 'up') {
    // Exit up: Move up to nearest corridor in source lane
    const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
    const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'up');
    waypoints.push({ x: exitPoint.x, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'up');
      // For same-side routing (up→up), use horizontal corridor
      const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
      waypoints.push({ x: corridorX, y: corridorY });
      waypoints.push({ x: corridorX, y: targetCorridorY });
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'down') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'down');
      
      // OPTIMIZATION: Check if vertical column at target X is free
      const columnFree = isVerticalColumnFree(entryPoint.x, corridorY, targetCorridorY, sourceCoord, targetCoord, coordinates);
      
      if (columnFree) {
        // Direct vertical path: go straight up to target X-position
        waypoints.push({ x: entryPoint.x, y: corridorY });
        waypoints.push({ x: entryPoint.x, y: targetCorridorY });
      } else {
        // Horizontal routing: go left, up, then right
        const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
        waypoints.push({ x: corridorX, y: corridorY });
        waypoints.push({ x: corridorX, y: targetCorridorY });
        waypoints.push({ x: entryPoint.x, y: targetCorridorY });
      }
    } else if (entrySide === 'left' || entrySide === 'right') {
      // For horizontal entry, route via horizontal corridor
      const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
      waypoints.push({ x: corridorX, y: corridorY });
      waypoints.push({ x: corridorX, y: entryPoint.y });
    }
    
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'down') {
    // Exit down: Move down to nearest corridor in source lane
    const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
    const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'down');
    waypoints.push({ x: exitPoint.x, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'up');
      
      // OPTIMIZATION: Check if vertical column at target X is free
      const columnFree = isVerticalColumnFree(entryPoint.x, corridorY, targetCorridorY, sourceCoord, targetCoord, coordinates);
      
      if (columnFree) {
        // Direct vertical path: go straight down to target X-position
        waypoints.push({ x: entryPoint.x, y: corridorY });
        waypoints.push({ x: entryPoint.x, y: targetCorridorY });
      } else {
        // Horizontal routing: go left, down, then right
        const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
        waypoints.push({ x: corridorX, y: corridorY });
        waypoints.push({ x: corridorX, y: targetCorridorY });
        waypoints.push({ x: entryPoint.x, y: targetCorridorY });
      }
    } else if (entrySide === 'down') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'down');
      // For same-side routing (down→down), use horizontal corridor
      const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
      waypoints.push({ x: corridorX, y: corridorY });
      waypoints.push({ x: corridorX, y: targetCorridorY });
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'left' || entrySide === 'right') {
      // For horizontal entry, route via horizontal corridor
      const corridorX = sourceCoord.x - LAYER_OFFSET / 2;
      waypoints.push({ x: corridorX, y: corridorY });
      waypoints.push({ x: corridorX, y: entryPoint.y });
    }
    
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'left') {
    // Exit left
    const corridorX = sourceCoord.x - CORRIDOR_OFFSET;
    waypoints.push({ x: corridorX, y: exitPoint.y });
    waypoints.push({ x: corridorX, y: entryPoint.y });
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'right') {
    // Exit right
    const corridorX = sourceCoord.x + sourceCoord.width + CORRIDOR_OFFSET;
    waypoints.push({ x: corridorX, y: exitPoint.y });
    waypoints.push({ x: corridorX, y: entryPoint.y });
    waypoints.push(entryPoint);
  }
  
  // Update flowInfo with exit and entry sides
  if (flowInfo.source) flowInfo.source.exitSide = exitSideMap[exitSide];
  if (flowInfo.target) flowInfo.target.entrySide = entrySideMap[entrySide];
  
  return waypoints;
}
