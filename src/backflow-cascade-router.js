/**
 * Back-Flow Cascade Router
 * 
 * Implements cascading routing strategy for back-flows:
 * Priority 1: Bottom-Exit → Bottom-Entry (most elegant)
 * Priority 2: Bottom-Exit → Left-Entry
 * Priority 3: Right-Exit → Bottom-Entry
 * Priority 4: Right-Exit → Left-Entry
 * Priority 5: Fallback (shortest path)
 */

import { calculateConnectionPoint } from './phase3.js';
import { hasWaypointCollision } from './waypoint-collision.js';
import { getCorridorsInLane, findNearestCorridor } from './manhattan-router.js';

const CORRIDOR_OFFSET = 25;
const LAYER_OFFSET = 100;

/**
 * Route back-flow with cascading strategy
 */
export function routeBackFlowCascade(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, laneBounds, positions, coordinates, flowWaypoints = null) {
  
  const sourceLaneBounds = laneBounds.get(sourcePos.lane);
  const targetLaneBounds = laneBounds.get(targetPos.lane);
  
  if (!sourceLaneBounds || !targetLaneBounds) {
    console.error('Lane bounds not found for back-flow cascade routing');
    return [];
  }
  
  // Get available corridors
  const sourceCorridors = getCorridorsInLane(sourceLaneBounds);
  
  // Try each strategy in order of priority
  const strategies = [
    { name: 'Bottom-Exit → Bottom-Entry', exitDir: 'down', entryDir: 'down' },
    { name: 'Bottom-Exit → Left-Entry', exitDir: 'down', entryDir: 'left' },
    { name: 'Right-Exit → Bottom-Entry', exitDir: 'right', entryDir: 'down' },
    { name: 'Right-Exit → Left-Entry', exitDir: 'right', entryDir: 'left' },
  ];
  
  for (const strategy of strategies) {
    const waypoints = calculateWaypointsForStrategy(
      strategy, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos,
      directions, sourceLaneBounds, targetLaneBounds, sourceCorridors
    );
    
    if (!waypoints || waypoints.length === 0) continue;
    
    // Test for collision
    if (flowWaypoints) {
      const hasCollision = hasWaypointCollision(waypoints, flowWaypoints, flowInfo.flowId);
      if (!hasCollision) {
        // Success! Use this strategy
        console.log(`✅ Back-flow ${flowInfo.flowId} using: ${strategy.name}`);
        return waypoints;
      }
    } else {
      // No collision detection - use first valid strategy
      console.log(`✅ Back-flow ${flowInfo.flowId} using: ${strategy.name}`);
      return waypoints;
    }
  }
  
  // Fallback: Use shortest path (current logic)
  console.log(`⚠️  Back-flow ${flowInfo.flowId} using fallback (all strategies blocked)`);
  return calculateFallbackPath(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, sourceCorridors);
}

/**
 * Calculate waypoints for a specific strategy
 */
function calculateWaypointsForStrategy(strategy, flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, sourceLaneBounds, targetLaneBounds, sourceCorridors) {
  const waypoints = [];
  
  // Step 1: Exit source
  let exitSide;
  if (strategy.exitDir === 'down') {
    exitSide = directions.crossLane; // bottom
  } else if (strategy.exitDir === 'right') {
    exitSide = directions.alongLane; // right
  } else {
    return null; // Invalid exit direction
  }
  
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to corridor
  let corridorY;
  
  if (strategy.exitDir === 'down') {
    // Find corridor below source
    corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'down');
    waypoints.push({ x: exitPoint.x, y: corridorY });
  } else if (strategy.exitDir === 'right') {
    // Move right first, then down to corridor
    const corridorX = sourceCoord.x + sourceCoord.width + LAYER_OFFSET / 2;
    waypoints.push({ x: corridorX, y: exitPoint.y });
    
    // Then down to corridor
    corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'down');
    waypoints.push({ x: corridorX, y: corridorY });
  }
  
  // Step 3: Move horizontally left towards target
  const targetCenterX = targetCoord.x + targetCoord.width / 2;
  
  if (strategy.entryDir === 'down') {
    // Entry from bottom: go to target center X, then up to bottom of target
    waypoints.push({ x: targetCenterX, y: corridorY });
    
    const entryPoint = calculateConnectionPoint(targetCoord, directions.crossLane);
    waypoints.push(entryPoint);
    
    // Update flowInfo
    if (flowInfo.source) flowInfo.source.exitSide = exitSide;
    if (flowInfo.target) flowInfo.target.entrySide = directions.crossLane;
    
  } else if (strategy.entryDir === 'left') {
    // Entry from left: go to left of target, then approach from left
    const targetX = targetCoord.x - LAYER_OFFSET / 2;
    waypoints.push({ x: targetX, y: corridorY });
    
    // Move vertically to target level
    const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
    waypoints.push({ x: targetX, y: entryPoint.y });
    waypoints.push(entryPoint);
    
    // Update flowInfo
    if (flowInfo.source) flowInfo.source.exitSide = exitSide;
    if (flowInfo.target) flowInfo.target.entrySide = directions.oppAlongLane;
  }
  
  return waypoints;
}

/**
 * Fallback path calculation (shortest path)
 */
function calculateFallbackPath(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, directions, sourceCorridors) {
  const waypoints = [];
  
  // Simple fallback: exit down, go left, enter left
  const exitSide = directions.crossLane;
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  const corridorY = findNearestCorridor(sourceCoord.y, sourceCorridors, 'down');
  waypoints.push({ x: exitPoint.x, y: corridorY });
  
  const targetX = targetCoord.x - LAYER_OFFSET / 2;
  waypoints.push({ x: targetX, y: corridorY });
  
  const entryPoint = calculateConnectionPoint(targetCoord, directions.oppAlongLane);
  waypoints.push({ x: targetX, y: entryPoint.y });
  waypoints.push(entryPoint);
  
  // Update flowInfo
  if (flowInfo.source) flowInfo.source.exitSide = exitSide;
  if (flowInfo.target) flowInfo.target.entrySide = directions.oppAlongLane;
  
  return waypoints;
}
