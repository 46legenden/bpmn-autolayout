/**
 * Calculate waypoint position(s) from source/target positions and exit/entry sides
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
 * For cross-lane flows with different layers, we need TWO waypoints:
 * - First waypoint: source layer, target lane/row (vertical movement)
 * - Second waypoint: target layer, target lane/row (horizontal movement)
 * 
 * @param {Object} sourcePos - Source position { lane, layer, row }
 * @param {Object} targetPos - Target position { lane, layer, row }
 * @param {string} exitSide - Exit side from source
 * @param {string} entrySide - Entry side to target
 * @param {Object} directions - Direction mappings
 * @returns {Object|Array|null} - Waypoint position { lane, layer, row }, array of waypoints, or null
 */
export function calculateWaypoint(sourcePos, targetPos, exitSide, entrySide, directions) {
  // Determine which coordinates to take from source vs target
  const exitIsAlongLane = (exitSide === directions.alongLane || exitSide === directions.oppAlongLane);
  const entryIsAlongLane = (entrySide === directions.alongLane || entrySide === directions.oppAlongLane);

  // Check if waypoint is needed
  if (exitIsAlongLane && entryIsAlongLane) {
    // Both along lane (horizontal): check if same row
    if (sourcePos.lane === targetPos.lane && sourcePos.row === targetPos.row) {
      // Same lane and row → no waypoint needed (straight line)
      return null;
    }
  } else if (!exitIsAlongLane && !entryIsAlongLane) {
    // Both cross lane (vertical): check if same layer
    if (sourcePos.layer === targetPos.layer) {
      // Same layer → no waypoint needed (straight line)
      return null;
    }
  }

  // Waypoint calculation
  const waypoint = {
    lane: null,
    layer: null,
    row: null
  };

  if (exitIsAlongLane) {
    // Exit along lane (right/left): lane and row stay from source, layer from target
    waypoint.lane = sourcePos.lane;
    waypoint.row = sourcePos.row;
    waypoint.layer = targetPos.layer;
  } else {
    // Exit cross lane (down/up): layer stays from source, lane and row from target
    waypoint.layer = sourcePos.layer;
    waypoint.lane = targetPos.lane;
    waypoint.row = targetPos.row;
  }

  // Override with entry side if different
  if (entryIsAlongLane) {
    // Entry along lane: use target's lane and row
    waypoint.lane = targetPos.lane;
    waypoint.row = targetPos.row;
  } else {
    // Entry cross lane: use target's layer
    waypoint.layer = targetPos.layer;
  }

  return waypoint;
}
