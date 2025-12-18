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
  
  console.log(`    Checking exits for ${sourceId}:`);
  console.log(`      Connection points:`, connectionPoints);
  
  // Check all waypoints in all flows
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === currentFlowId) continue;
    if (!waypoints || waypoints.length === 0) continue;
    
    // Check if any waypoint matches any connection point exactly
    for (const waypoint of waypoints) {
      for (const [side, point] of Object.entries(connectionPoints)) {
        if (waypoint.x === point.x && waypoint.y === point.y) {
          console.log(`      Flow ${flowId}: uses ${side} (waypoint at ${waypoint.x},${waypoint.y})`);
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
  
  console.log(`    Checking entries for ${targetId}:`);
  console.log(`      Connection points:`, connectionPoints);
  
  // Check all waypoints in all flows
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === currentFlowId) continue;
    if (!waypoints || waypoints.length === 0) continue;
    
    // Check if any waypoint matches any connection point exactly
    for (const waypoint of waypoints) {
      for (const [side, point] of Object.entries(connectionPoints)) {
        if (waypoint.x === point.x && waypoint.y === point.y) {
          console.log(`      Flow ${flowId}: uses ${side} (waypoint at ${waypoint.x},${waypoint.y})`);
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
  
  console.log(`  ${flowInfo.flowId}: Source ${flowInfo.sourceId} exits:`, availableExits);
  console.log(`  ${flowInfo.flowId}: Target ${flowInfo.targetId} entries:`, availableEntries);
  
  // Determine vertical relationship (is target above or below source?)
  const targetAbove = targetCoord.y < sourceCoord.y;
  
  // Define exit priority based on target direction
  const exitPriority = targetAbove 
    ? ['up', 'down', 'left', 'right']
    : ['down', 'up', 'left', 'right'];
  
  // Define entry priority based on approach direction
  const entryPriority = targetAbove
    ? ['up', 'down', 'left', 'right']
    : ['down', 'up', 'left', 'right'];
  
  // Try all combinations of exit and entry sides
  for (const exitSide of exitPriority) {
    if (!availableExits[exitSide]) {
      console.log(`    Skipping exit ${exitSide} (not available)`);
      continue;
    }
    
    for (const entrySide of entryPriority) {
      if (!availableEntries[entrySide]) {
        console.log(`    Skipping entry ${entrySide} (not available)`);
        continue;
      }
      
      console.log(`    Trying ${exitSide} → ${entrySide}...`);
      
      // Try to route with this exit/entry combination
      const waypoints = calculateMessageFlowWaypoints(
        flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
        exitSide, entrySide, directions, laneBounds
      );
      
      if (!waypoints || waypoints.length === 0) {
        console.log(`      Failed: No waypoints generated`);
        continue;
      }
      
      // Test for collision
      if (flowWaypoints) {
        const hasCollision = hasWaypointCollision(waypoints, flowWaypoints, flowInfo.flowId);
        if (!hasCollision) {
          // Success! Use this routing
          console.log(`✅ Message-flow ${flowInfo.flowId}: ${exitSide} → ${entrySide}`);
          return waypoints;
        } else {
          console.log(`      Failed: Collision detected`);
        }
      } else {
        // No collision detection - use first valid routing
        console.log(`✅ Message-flow ${flowInfo.flowId}: ${exitSide} → ${entrySide}`);
        return waypoints;
      }
    }
  }
  
  // Fallback: Use first available exit and entry
  const fallbackExit = exitPriority.find(side => availableExits[side]) || 'down';
  const fallbackEntry = entryPriority.find(side => availableEntries[side]) || 'up';
  
  console.log(`⚠️  Message-flow ${flowInfo.flowId}: Using fallback ${fallbackExit} → ${fallbackEntry}`);
  return calculateMessageFlowWaypoints(
    flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
    fallbackExit, fallbackEntry, directions, laneBounds
  );
}

/**
 * Calculate waypoints for message flow with corridor-based navigation
 */
function calculateMessageFlowWaypoints(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, exitSide, entrySide, directions, laneBounds) {
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
    
    // Go to leftmost corridor (before first layer)
    // Use corridor to the left of the leftmost element
    const leftEdgeX = Math.min(sourceCoord.x, targetCoord.x) - LAYER_OFFSET / 2;
    waypoints.push({ x: leftEdgeX, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'up');
      waypoints.push({ x: leftEdgeX, y: targetCorridorY });
      // Move right to target X
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'down') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'down');
      waypoints.push({ x: leftEdgeX, y: targetCorridorY });
      // Move right to target X
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    }
    
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'down') {
    // Exit down: Move down to nearest corridor in source lane
    const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
    const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'down');
    waypoints.push({ x: exitPoint.x, y: corridorY });
    
    // Go to leftmost corridor (before first layer)
    // Use corridor to the left of the leftmost element
    const leftEdgeX = Math.min(sourceCoord.x, targetCoord.x) - LAYER_OFFSET / 2;
    waypoints.push({ x: leftEdgeX, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'up');
      waypoints.push({ x: leftEdgeX, y: targetCorridorY });
      // Move right to target X
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'down') {
      const targetCorridors = getCorridorsInLane(targetLaneBounds);
      const targetCorridorY = findNearestCorridor(targetCoord.y, targetCorridors, 'down');
      waypoints.push({ x: leftEdgeX, y: targetCorridorY });
      // Move right to target X
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
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
