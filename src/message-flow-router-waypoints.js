/**
 * Calculate waypoints for message flow with corridor-based navigation
 * 
 * Rules:
 * - Always move along corridors (never through elements)
 * - Exit in the chosen direction until reaching a corridor
 * - Navigate horizontally/vertically along corridors
 * - Enter target from the chosen direction
 */

import { calculateConnectionPoint } from './phase3.js';

const CORRIDOR_OFFSET = 25; // Distance from lane boundary to corridor

/**
 * Calculate waypoints for message flow between pools
 */
export function calculateMessageFlowWaypoints(flowInfo, sourceCoord, targetCoord, sourcePos, targetPos, exitSide, entrySide, directions, laneBounds) {
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
  
  if (exitSide === 'up') {
    // Exit up: Move up to corridor above source lane
    const corridorY = sourceLaneBounds.y - CORRIDOR_OFFSET;
    waypoints.push({ x: exitPoint.x, y: corridorY });
    
    // Move horizontally to target X position
    const entryPoint = calculateConnectionPoint(targetCoord, entrySideMap[entrySide]);
    waypoints.push({ x: entryPoint.x, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      // Entry up: Move down to corridor above target lane
      const targetCorridorY = targetLaneBounds.y - CORRIDOR_OFFSET;
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'down') {
      // Entry down: Move down to corridor below target lane
      const targetCorridorY = targetLaneBounds.y + targetLaneBounds.height + CORRIDOR_OFFSET;
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'left' || entrySide === 'right') {
      // Entry left/right: Move down to target Y level
      waypoints.push({ x: entryPoint.x, y: entryPoint.y });
    }
    
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'down') {
    // Exit down: Move down to corridor below source lane
    const corridorY = sourceLaneBounds.y + sourceLaneBounds.height + CORRIDOR_OFFSET;
    waypoints.push({ x: exitPoint.x, y: corridorY });
    
    // Move horizontally to target X position
    const entryPoint = calculateConnectionPoint(targetCoord, entrySideMap[entrySide]);
    waypoints.push({ x: entryPoint.x, y: corridorY });
    
    // Navigate to entry corridor
    if (entrySide === 'up') {
      // Entry up: Move up to corridor above target lane
      const targetCorridorY = targetLaneBounds.y - CORRIDOR_OFFSET;
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'down') {
      // Entry down: Move down to corridor below target lane
      const targetCorridorY = targetLaneBounds.y + targetLaneBounds.height + CORRIDOR_OFFSET;
      waypoints.push({ x: entryPoint.x, y: targetCorridorY });
    } else if (entrySide === 'left' || entrySide === 'right') {
      // Entry left/right: Move to target Y level
      waypoints.push({ x: entryPoint.x, y: entryPoint.y });
    }
    
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'left') {
    // Exit left: Move left to corridor
    const corridorX = sourceCoord.x - CORRIDOR_OFFSET;
    waypoints.push({ x: corridorX, y: exitPoint.y });
    
    // Move vertically to target Y level
    const entryPoint = calculateConnectionPoint(targetCoord, entrySideMap[entrySide]);
    waypoints.push({ x: corridorX, y: entryPoint.y });
    
    // Move horizontally to entry point
    waypoints.push(entryPoint);
    
  } else if (exitSide === 'right') {
    // Exit right: Move right to corridor
    const corridorX = sourceCoord.x + sourceCoord.width + CORRIDOR_OFFSET;
    waypoints.push({ x: corridorX, y: exitPoint.y });
    
    // Move vertically to target Y level
    const entryPoint = calculateConnectionPoint(targetCoord, entrySideMap[entrySide]);
    waypoints.push({ x: corridorX, y: entryPoint.y });
    
    // Move horizontally to entry point
    waypoints.push(entryPoint);
  }
  
  // Update flowInfo with exit and entry sides
  if (flowInfo.source) flowInfo.source.exitSide = exitSideMap[exitSide];
  if (flowInfo.target) flowInfo.target.entrySide = entrySideMap[entrySide];
  
  return waypoints;
}
