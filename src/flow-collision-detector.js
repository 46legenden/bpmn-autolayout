/**
 * Flow Collision Detector
 * 
 * Detects various types of flow collisions:
 * 1. Waypoint direction errors (exit/entry side mismatch)
 * 2. Waypoint inconsistencies (direction changes)
 * 3. Element intersections (flow goes through elements)
 */

/**
 * Check if waypoint is in correct direction from element
 * @param {Object} elementCoord - {x, y, width, height}
 * @param {string} side - 'left', 'right', 'up', 'down'
 * @param {Object} waypoint - {x, y}
 * @returns {boolean} - True if waypoint is in correct direction
 */
function isWaypointInCorrectDirection(elementCoord, side, waypoint) {
  const centerX = elementCoord.x + elementCoord.width / 2;
  const centerY = elementCoord.y + elementCoord.height / 2;
  
  switch (side) {
    case 'right':
      return waypoint.x > centerX;
    case 'left':
      return waypoint.x < centerX;
    case 'down':
      return waypoint.y > centerY;
    case 'up':
      return waypoint.y < centerY;
    default:
      return true; // Unknown side, skip check
  }
}

/**
 * Check if waypoints progress in consistent direction
 * @param {Array} waypoints - Array of {x, y}
 * @returns {Object} - {valid, errors}
 */
function checkWaypointConsistency(waypoints) {
  const errors = [];
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp1 = waypoints[i];
    const wp2 = waypoints[i + 1];
    const wp0 = i > 0 ? waypoints[i - 1] : null;
    
    // Determine direction from wp1 to wp2
    const dx = wp2.x - wp1.x;
    const dy = wp2.y - wp1.y;
    
    // If there's a previous waypoint, check consistency
    if (wp0) {
      const prevDx = wp1.x - wp0.x;
      const prevDy = wp1.y - wp0.y;
      
      // Check for direction reversal
      // If moving right (dx > 0), previous should not be moving left (prevDx < 0)
      if (Math.abs(dx) > 1 && Math.abs(prevDx) > 1) {
        if ((dx > 0 && prevDx < 0) || (dx < 0 && prevDx > 0)) {
          errors.push({
            type: 'horizontal_reversal',
            segment: i,
            from: wp0,
            via: wp1,
            to: wp2,
            message: `Horizontal direction reversal at waypoint ${i}`
          });
        }
      }
      
      // Same for vertical
      if (Math.abs(dy) > 1 && Math.abs(prevDy) > 1) {
        if ((dy > 0 && prevDy < 0) || (dy < 0 && prevDy > 0)) {
          errors.push({
            type: 'vertical_reversal',
            segment: i,
            from: wp0,
            via: wp1,
            to: wp2,
            message: `Vertical direction reversal at waypoint ${i}`
          });
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if flow segment intersects with element bounds
 * @param {Object} wp1 - {x, y}
 * @param {Object} wp2 - {x, y}
 * @param {Object} elementCoord - {x, y, width, height}
 * @returns {boolean} - True if intersects
 */
function segmentIntersectsElement(wp1, wp2, elementCoord) {
  // Element bounds
  const left = elementCoord.x;
  const right = elementCoord.x + elementCoord.width;
  const top = elementCoord.y;
  const bottom = elementCoord.y + elementCoord.height;
  
  // Check if segment passes through element
  // Simple bounding box check first
  const minX = Math.min(wp1.x, wp2.x);
  const maxX = Math.max(wp1.x, wp2.x);
  const minY = Math.min(wp1.y, wp2.y);
  const maxY = Math.max(wp1.y, wp2.y);
  
  // If segment bounding box doesn't overlap element, no intersection
  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false;
  }
  
  // More detailed check: line-rectangle intersection
  // For simplicity, we check if segment crosses element center region
  const centerX = elementCoord.x + elementCoord.width / 2;
  const centerY = elementCoord.y + elementCoord.height / 2;
  
  // Check if segment passes through center region (80% of element)
  const margin = 0.1;
  const innerLeft = left + elementCoord.width * margin;
  const innerRight = right - elementCoord.width * margin;
  const innerTop = top + elementCoord.height * margin;
  const innerBottom = bottom - elementCoord.height * margin;
  
  // Line segment intersection with inner rectangle
  return lineIntersectsRect(wp1, wp2, innerLeft, innerRight, innerTop, innerBottom);
}

/**
 * Check if line segment intersects rectangle
 */
function lineIntersectsRect(p1, p2, left, right, top, bottom) {
  // Check if either endpoint is inside
  if ((p1.x >= left && p1.x <= right && p1.y >= top && p1.y <= bottom) ||
      (p2.x >= left && p2.x <= right && p2.y >= top && p2.y <= bottom)) {
    return true;
  }
  
  // Check intersection with rectangle edges
  return lineIntersectsLine(p1, p2, {x: left, y: top}, {x: right, y: top}) ||
         lineIntersectsLine(p1, p2, {x: right, y: top}, {x: right, y: bottom}) ||
         lineIntersectsLine(p1, p2, {x: right, y: bottom}, {x: left, y: bottom}) ||
         lineIntersectsLine(p1, p2, {x: left, y: bottom}, {x: left, y: top});
}

/**
 * Check if two line segments intersect
 */
function lineIntersectsLine(p1, p2, p3, p4) {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(det) < 0.001) return false; // Parallel
  
  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
  
  return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
}

/**
 * Check all flow collisions
 * @param {Map} flows - Map of flowId -> flow
 * @param {Map} flowWaypoints - Map of flowId -> waypoints
 * @param {Map} coordinates - Map of elementId -> {x, y, width, height}
 * @param {Map} flowInfos - Map of flowId -> flowInfo
 */
export function checkFlowCollisions(flows, flowWaypoints, coordinates, flowInfos) {
  const collisions = [];
  
  for (const [flowId, flow] of flows) {
    const waypoints = flowWaypoints.get(flowId);
    if (!waypoints || waypoints.length < 2) continue;
    
    const flowInfo = flowInfos.get(flowId);
    if (!flowInfo) continue;
    
    const sourceCoord = coordinates.get(flow.sourceRef);
    const targetCoord = coordinates.get(flow.targetRef);
    
    if (!sourceCoord || !targetCoord) continue;
    
    // 1. Check exit direction
    const exitSide = flowInfo.source?.exitSide;
    if (exitSide && waypoints.length > 1) {
      const firstWaypoint = waypoints[0];
      const secondWaypoint = waypoints[1];
      
      if (!isWaypointInCorrectDirection(sourceCoord, exitSide, secondWaypoint)) {
        collisions.push({
          flowId,
          type: 'exit_direction_error',
          message: `Flow ${flowId}: Exit side is "${exitSide}" but first waypoint is in wrong direction`,
          source: flow.sourceRef,
          exitSide,
          waypoint: secondWaypoint
        });
      }
    }
    
    // 2. Check entry direction
    const entrySide = flowInfo.target?.entrySide;
    if (entrySide && waypoints.length > 1) {
      const lastWaypoint = waypoints[waypoints.length - 1];
      const secondLastWaypoint = waypoints[waypoints.length - 2];
      
      if (!isWaypointInCorrectDirection(targetCoord, entrySide, secondLastWaypoint)) {
        collisions.push({
          flowId,
          type: 'entry_direction_error',
          message: `Flow ${flowId}: Entry side is "${entrySide}" but last waypoint is in wrong direction`,
          target: flow.targetRef,
          entrySide,
          waypoint: secondLastWaypoint
        });
      }
    }
    
    // 3. Check waypoint consistency
    const consistency = checkWaypointConsistency(waypoints);
    if (!consistency.valid) {
      for (const error of consistency.errors) {
        collisions.push({
          flowId,
          type: error.type,
          message: `Flow ${flowId}: ${error.message}`,
          segment: error.segment,
          waypoints: [error.from, error.via, error.to]
        });
      }
    }
    
    // 4. Check element intersections
    for (const [elementId, elementCoord] of coordinates) {
      // Skip source and target
      if (elementId === flow.sourceRef || elementId === flow.targetRef) continue;
      
      // Check each segment
      for (let i = 0; i < waypoints.length - 1; i++) {
        if (segmentIntersectsElement(waypoints[i], waypoints[i + 1], elementCoord)) {
          collisions.push({
            flowId,
            type: 'element_intersection',
            message: `Flow ${flowId}: Segment ${i} intersects element ${elementId}`,
            element: elementId,
            segment: i,
            waypoints: [waypoints[i], waypoints[i + 1]]
          });
        }
      }
    }
  }
  
  // Report collisions
  if (collisions.length > 0) {
    console.error('\n⚠️  ========== FLOW COLLISIONS DETECTED ==========');
    for (const collision of collisions) {
      console.error(`\n  Flow: ${collision.flowId}`);
      console.error(`  Type: ${collision.type}`);
      console.error(`  ${collision.message}`);
      if (collision.waypoints) {
        console.error(`  Waypoints: ${JSON.stringify(collision.waypoints)}`);
      }
    }
    console.error('\n⚠️  ===============================================\n');
  }
  
  return collisions;
}
