/**
 * Grid-based A* pathfinding for message flow routing
 * Uses corridors and matrix positions to create a navigation grid
 */

import PF from 'pathfinding';
import { getCorridorsInLane } from './manhattan-router.js';

/**
 * Build grid from corridors and matrix positions
 * @param {Object} laneBounds - Lane boundaries
 * @param {Map} coordinates - Element coordinates
 * @returns {Object} { grid, xCoords, yCoords }
 */
export function buildRoutingGrid(laneBounds, coordinates) {
  // Collect all unique X and Y coordinates
  const xSet = new Set();
  const ySet = new Set();
  
  // Add element centers as grid points (Spalten-Position & Row-Position)
  for (const [id, coord] of coordinates) {
    // Spalten-Position: Element-Zentrum X
    xSet.add(coord.x + coord.width / 2);
    
    // Row-Position: Element-Zentrum Y
    ySet.add(coord.y + coord.height / 2);
  }
  
  // Add horizontal corridors from lane bounds
  if (laneBounds) {
    for (const [laneId, bounds] of Object.entries(laneBounds)) {
      const corridors = getCorridorsInLane(bounds);

      corridors.forEach(y => ySet.add(y));
    }
  }
  
  // Also add lane boundaries as horizontal lines
  if (laneBounds) {
    for (const [laneId, bounds] of Object.entries(laneBounds)) {
      ySet.add(bounds.top);
      ySet.add(bounds.bottom);
      // Add midpoint
      ySet.add((bounds.top + bounds.bottom) / 2);
    }
  }
  
  // Add vertical corridors (between columns)
  // Use LAYER_OFFSET (200px) to calculate column positions
  const LAYER_OFFSET = 200;
  const minX = Math.min(...Array.from(coordinates.values()).map(c => c.x));
  const maxX = Math.max(...Array.from(coordinates.values()).map(c => c.x + c.width));
  
  for (let x = minX - LAYER_OFFSET; x <= maxX + LAYER_OFFSET; x += LAYER_OFFSET) {
    xSet.add(x);
  }
  
  // Sort coordinates and filter out NaN/invalid values
  const xCoords = Array.from(xSet).filter(x => !isNaN(x) && isFinite(x)).sort((a, b) => a - b);
  const yCoords = Array.from(ySet).filter(y => !isNaN(y) && isFinite(y)).sort((a, b) => a - b);
  
  // Create grid (all cells walkable initially)
  const grid = new PF.Grid(xCoords.length, yCoords.length);
  
  // Mark cells occupied by elements as non-walkable
  for (const [id, coord] of coordinates) {
    const left = coord.x;
    const right = coord.x + coord.width;
    const top = coord.y;
    const bottom = coord.y + coord.height;
    
    for (let xi = 0; xi < xCoords.length; xi++) {
      for (let yi = 0; yi < yCoords.length; yi++) {
        const x = xCoords[xi];
        const y = yCoords[yi];
        
        // If point is inside element, mark as non-walkable
        if (x > left && x < right && y > top && y < bottom) {
          grid.setWalkableAt(xi, yi, false);
        }
      }
    }
  }
  
  return { grid, xCoords, yCoords };
}

/**
 * Find nearest grid point to a coordinate
 */
function findNearestGridPoint(coord, coordArray) {
  let nearest = 0;
  let minDist = Math.abs(coordArray[0] - coord);
  
  for (let i = 1; i < coordArray.length; i++) {
    const dist = Math.abs(coordArray[i] - coord);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  
  return nearest;
}

/**
 * Route message flow using A* pathfinding on grid
 * @param {Object} exitPoint - { x, y }
 * @param {Object} entryPoint - { x, y }
 * @param {string} exitDirection - 'up', 'down', 'left', 'right'
 * @param {string} entryDirection - 'up', 'down', 'left', 'right'
 * @param {Object} gridData - { grid, xCoords, yCoords }
 * @returns {Array} waypoints
 */
export function routeWithGrid(exitPoint, entryPoint, exitDirection, entryDirection, gridData) {
  const { grid, xCoords, yCoords } = gridData;
  
  // Find grid indices for start and end
  const startX = findNearestGridPoint(exitPoint.x, xCoords);
  const startY = findNearestGridPoint(exitPoint.y, yCoords);
  const endX = findNearestGridPoint(entryPoint.x, xCoords);
  const endY = findNearestGridPoint(entryPoint.y, yCoords);
  
  // Adjust start point based on exit direction
  let adjustedStartX = startX;
  let adjustedStartY = startY;
  
  switch (exitDirection) {
    case 'up':
      adjustedStartY = Math.max(0, startY - 1);
      break;
    case 'down':
      adjustedStartY = Math.min(yCoords.length - 1, startY + 1);
      break;
    case 'left':
      adjustedStartX = Math.max(0, startX - 1);
      break;
    case 'right':
      adjustedStartX = Math.min(xCoords.length - 1, startX + 1);
      break;
  }
  
  // Adjust end point based on entry direction
  let adjustedEndX = endX;
  let adjustedEndY = endY;
  
  switch (entryDirection) {
    case 'up':
      adjustedEndY = Math.max(0, endY - 1);
      break;
    case 'down':
      adjustedEndY = Math.min(yCoords.length - 1, endY + 1);
      break;
    case 'left':
      adjustedEndX = Math.max(0, endX - 1);
      break;
    case 'right':
      adjustedEndX = Math.min(xCoords.length - 1, endX + 1);
      break;
  }
  
  // Clone grid for pathfinding (it modifies the grid)
  const gridClone = grid.clone();
  
  // Use A* pathfinding (Manhattan distance for orthogonal movement)
  const finder = new PF.AStarFinder({
    allowDiagonal: false,
    dontCrossCorners: true
  });
  
  const path = finder.findPath(
    adjustedStartX, adjustedStartY,
    adjustedEndX, adjustedEndY,
    gridClone
  );
  
  // Convert path to waypoints
  const waypoints = [];
  
  // Add exit point
  waypoints.push(exitPoint);
  
  // Add intermediate point from exit to first grid point (Manhattan)
  if (path.length > 0) {
    const [firstXi, firstYi] = path[0];
    const firstGridPoint = { x: xCoords[firstXi], y: yCoords[firstYi] };
    
    // Add Manhattan waypoint based on exit direction
    switch (exitDirection) {
      case 'up':
      case 'down':
        // Go vertical first, then horizontal
        waypoints.push({ x: exitPoint.x, y: firstGridPoint.y });
        if (exitPoint.x !== firstGridPoint.x) {
          waypoints.push(firstGridPoint);
        }
        break;
      case 'left':
      case 'right':
        // Go horizontal first, then vertical
        waypoints.push({ x: firstGridPoint.x, y: exitPoint.y });
        if (exitPoint.y !== firstGridPoint.y) {
          waypoints.push(firstGridPoint);
        }
        break;
    }
  }
  
  // Add path points (skip first as it's already added, include last)
  for (let i = 1; i < path.length; i++) {
    const [xi, yi] = path[i];
    waypoints.push({
      x: xCoords[xi],
      y: yCoords[yi]
    });
  }
  
  // Add intermediate point from last grid point to entry (Manhattan)
  if (path.length > 0) {
    const [lastXi, lastYi] = path[path.length - 1];
    const lastGridPoint = { x: xCoords[lastXi], y: yCoords[lastYi] };
    

    // Add Manhattan waypoint based on entry direction
    switch (entryDirection) {
      case 'up':
      case 'down':
        // Go horizontal first, then vertical
        if (lastGridPoint.x !== entryPoint.x) {
          const intermediateWP = { x: entryPoint.x, y: lastGridPoint.y };
          waypoints.push(intermediateWP);
        }
        break;
      case 'left':
      case 'right':
        // Go vertical first, then horizontal
        if (lastGridPoint.y !== entryPoint.y) {
          const intermediateWP = { x: lastGridPoint.x, y: entryPoint.y };
          waypoints.push(intermediateWP);
        }
        break;
    }
  }
  
  // Add entry point
  waypoints.push(entryPoint);
  
  // Simplify waypoints (remove redundant points on same line)
  return simplifyWaypoints(waypoints);
}

/**
 * Simplify waypoints by removing redundant points
 */
function simplifyWaypoints(waypoints) {
  if (waypoints.length <= 2) return waypoints;
  
  const simplified = [waypoints[0]];
  
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    
    // Check if current point is redundant (on straight line between prev and next)
    const sameX = (prev.x === curr.x && curr.x === next.x);
    const sameY = (prev.y === curr.y && curr.y === next.y);
    
    // Keep point if it's a corner (direction changes)
    // Skip if it's on a straight line (redundant)
    if (!sameX && !sameY) {
      // This is a corner point - keep it
      simplified.push(curr);
    } else if (sameX && sameY) {
      // This should never happen in Manhattan routing
      // But keep it just in case
      simplified.push(curr);
    }
    // If sameX OR sameY (but not both), it's on a straight line - skip it
  }
  
  simplified.push(waypoints[waypoints.length - 1]);
  
  return simplified;
}
