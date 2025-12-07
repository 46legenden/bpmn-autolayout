/**
 * Calculate waypoint position from source/target positions and exit/entry sides
 * 
 * Logic:
 * - exitSide determines which coordinate stays the same from source
 * - entrySide determines which coordinate stays the same from target
 * 
 * For horizontal orientation:
 * - X = layer
 * - Y = lane + row
 * 
 * exitSide/entrySide mapping:
 * - right/left (alongLane): X changes, Y stays
 * - down/up (crossLane): X stays, Y changes
 * 
 * @param {Object} sourcePos - Source position { lane, layer, row }
 * @param {Object} targetPos - Target position { lane, layer, row }
 * @param {string} exitSide - Exit side from source
 * @param {string} entrySide - Entry side to target
 * @param {Object} directions - Direction mappings
 * @returns {Object} - Waypoint position { lane, layer, row }
 */
export function calculateWaypoint(sourcePos, targetPos, exitSide, entrySide, directions) {
  const waypoint = {};

  // Determine which coordinates to take from source vs target
  const exitIsAlongLane = (exitSide === directions.alongLane || exitSide === directions.oppAlongLane);
  const entryIsAlongLane = (entrySide === directions.alongLane || entrySide === directions.oppAlongLane);

  if (exitIsAlongLane) {
    // Exit along lane (right/left): Y stays from source
    waypoint.lane = sourcePos.lane;
    waypoint.row = sourcePos.row;
  } else {
    // Exit cross lane (down/up): X stays from source
    waypoint.layer = sourcePos.layer;
  }

  if (entryIsAlongLane) {
    // Entry along lane (left/right): Y stays from target
    waypoint.lane = targetPos.lane;
    waypoint.row = targetPos.row;
  } else {
    // Entry cross lane (up/down): X stays from target
    waypoint.layer = targetPos.layer;
  }

  return waypoint;
}
