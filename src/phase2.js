/**
 * Phase 2: Position Assignment + Flow Information (Simplified)
 * 
 * This phase handles:
 * - Applying configuration (abstract directions)
 * - Gateway lane assignment
 * - Position assignment (lane, layer, row)
 * - Flow information (exitSide, entrySide, waypoints for normal flows)
 * - Back-flows are only marked, routing happens in Phase 3
 */

import { calculateWaypoint } from './waypoint-helper.js';
import { checkAllCollisions } from './collision-checker.js';
import { assignRows } from './row-assigner.js';

// Module-level variable to store pools for getLaneIndex
let _pools = new Map();

/**
 * Get lane index (position in lane list), grouped by pool
 * @param {string} laneId - Lane ID
 * @param {Map} lanes - Lane map
 * @param {Map} pools - Pool map
 * @returns {number} - Lane index (0 = first/top)
 */
function getLaneIndex(laneId, lanes) {
  // If no pools or only one pool, use simple ordering
  if (_pools.size <= 1) {
    const laneIds = Array.from(lanes.keys());
    return laneIds.indexOf(laneId);
  }
  
  // Multiple pools: group lanes by pool
  const sortedPools = Array.from(_pools.values()).sort((a, b) => a.id.localeCompare(b.id));
  const orderedLaneIds = [];
  
  for (const pool of sortedPools) {
    orderedLaneIds.push(...pool.lanes);
  }
  
  return orderedLaneIds.indexOf(laneId);
}

/**
 * Calculate unified vertical index (vIndex) for routing
 * Combines lane and row into single vertical position
 * @param {string} lane - Lane ID
 * @param {number} row - Row number
 * @param {Map} lanes - Lane map
 * @returns {number} - Vertical index (higher = lower position)
 */
function getVIndex(lane, row, lanes) {
  const LANE_STEP = 100; // Large step to avoid row collisions
  const laneIndex = getLaneIndex(lane, lanes);
  return laneIndex * LANE_STEP + row;
}

/**
 * Apply configuration and define abstract directions
 * @param {Object} config - { laneOrientation: "horizontal" | "vertical" }
 * @returns {Object} - Direction mappings
 */
export function applyConfig(config = {}) {
  const laneOrientation = config.laneOrientation || 'horizontal';

  if (laneOrientation === 'horizontal') {
    return {
      laneOrientation: 'horizontal',
      alongLane: 'right',        // Process goes right
      oppAlongLane: 'left',      // Opposite direction
      crossLane: 'down',         // Lane change goes down
      oppCrossLane: 'up'         // Opposite direction
    };
  } else {
    return {
      laneOrientation: 'vertical',
      alongLane: 'down',         // Process goes down
      oppAlongLane: 'up',        // Opposite direction
      crossLane: 'right',        // Lane change goes right
      oppCrossLane: 'left'       // Opposite direction
    };
  }
}

/**
 * Initialize matrix for tracking elements and flows
 * @param {Map} lanes - Lane map from Phase 1
 * @returns {Map} - Matrix[laneId][layer] = { elements: [], flowAlongLane: null, flowCrossLane: null }
 */
export function initializeMatrix(lanes) {
  const matrix = new Map();

  for (const [laneId] of lanes) {
    matrix.set(laneId, new Map());
  }

  return matrix;
}

/**
 * Determine lane for gateways based on inputs/outputs
 * @param {Map} elements - Element map
 * @param {Map} flows - Flow map
 * @param {Map} lanes - Lane map
 * @returns {Map} - elementId → laneId
 */
export function assignGatewayLanes(elements, flows, lanes) {
  const elementLanes = new Map();

  // First, assign lanes to non-gateway elements based on lane definitions
  for (const [laneId, lane] of lanes) {
    for (const elementId of lane.elements) {
      elementLanes.set(elementId, laneId);
    }
  }

  // Gateways must be manually assigned to lanes in BPMN
  // No automatic lane optimization - lane assignment is a modeling decision

  // Fallback: Assign first lane to any elements without a lane
  const firstLane = Array.from(lanes.keys())[0];
  for (const [elementId, element] of elements) {
    if (!elementLanes.has(elementId)) {
      elementLanes.set(elementId, firstLane);
    }
  }

  return elementLanes;
}

// getLaneIndex is already defined at the top of this file

/**
 * Check if flow is cross-lane
 * @param {Object} flow - Flow object
 * @param {Map} elementLanes - elementId → laneId
 * @returns {boolean}
 */
export function isCrossLane(flow, elementLanes) {
  const sourceLane = elementLanes.get(flow.sourceRef);
  const targetLane = elementLanes.get(flow.targetRef);
  return sourceLane !== targetLane;
}

/**
 * Get cross-lane direction (crossLane or oppCrossLane)
 * @param {Object} flow - Flow object
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {string} - 'crossLane' or 'oppCrossLane'
 */
export function getCrossLaneDirection(flow, elementLanes, lanes, directions) {
  const sourceLane = elementLanes.get(flow.sourceRef);
  const targetLane = elementLanes.get(flow.targetRef);

  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);

  // If target is below source (higher index), go crossLane (down/right)
  // If target is above source (lower index), go oppCrossLane (up/left)
  return targetLaneIndex > sourceLaneIndex ? 'crossLane' : 'oppCrossLane';
}

/**
 * Assign position for same-lane flow
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignSameLanePosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const lane = elementLanes.get(targetId);
  
  // If target already has a position, update layer to max of current and new
  // This ensures elements with multiple inputs are positioned after ALL inputs
  const existingPos = positions.get(targetId);
  const newLayer = sourcePos.layer + 1;
  
  if (existingPos) {
    // Update to maximum layer
    if (newLayer > existingPos.layer) {
      existingPos.layer = newLayer;
    }
    return existingPos;
  }

  const targetPos = {
    lane,
    layer: newLayer,
    row: sourcePos.row
  };
  
  positions.set(targetId, targetPos);
  
  return targetPos;
}

/**
 * Create flow information for same-lane flow
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - Flow information
 */
export function createSameLaneFlowInfo(flowId, sourceId, targetId, positions, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: false,
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide: directions.alongLane
    },
    waypoints: [],  // No intermediate waypoints for same-lane
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide: directions.oppAlongLane
    }
  };
}

/**
 * Check if cross-lane path is free (no elements in between AND no conflicting cross-lane flow)
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Map} matrix - Matrix
 * @returns {boolean}
 */
export function isCrossLanePathFree(sourceId, targetId, positions, elementLanes, lanes, matrix) {
  const sourcePos = positions.get(sourceId);
  const sourceLane = elementLanes.get(sourceId);
  const targetLane = elementLanes.get(targetId);
  
  const DEBUG = process.env.DEBUG_PATH === 'true';
  if (DEBUG) console.log(`\n[PATH CHECK] ${sourceId} (${sourceLane}, layer ${sourcePos.layer}, row ${sourcePos.row}) → ${targetId} (${targetLane})`);

  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);

  const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
  const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);
  
  // Determine the direction of this cross-lane flow
  const flowDirection = targetLaneIndex > sourceLaneIndex ? 'down' : 'up';

  // Check all lanes between source and target (and including source/target lanes for flow direction check)
  const laneIds = Array.from(lanes.keys());
  
  // Check intermediate lanes for elements
  for (let i = minLaneIndex + 1; i < maxLaneIndex; i++) {
    const laneId = laneIds[i];
    const laneMatrix = matrix.get(laneId);
    
    if (laneMatrix && laneMatrix.has(sourcePos.layer)) {
      const cell = laneMatrix.get(sourcePos.layer);
      if (cell && cell.elements && cell.elements.length > 0) {
        return false;  // Path is blocked by elements
      }
    }
  }
  
  // Also check source and target lanes for elements in the same layer (different rows)
  // These would block the vertical path from source to target
  for (const [elemId, elemPos] of positions) {
    if (elemId !== sourceId && elemId !== targetId && elemPos.layer === sourcePos.layer) {
      const elemLane = elementLanes.get(elemId);
      // Check if element is in source or target lane
      if (elemLane === sourceLane || elemLane === targetLane) {
        // Element in same lane and same layer but different row
        // Only blocks if rows would cause crossing:
        // - If both in source lane with different rows, check if they go in opposite directions
        // - If element row is between source and target vertically, it blocks
        
        if (elemLane === sourceLane) {
          // Both in source lane - check if rows are compatible with directions
          // If sourceRow < elemRow and source goes UP, no block (source exits from top)
          // If sourceRow > elemRow and source goes DOWN, no block (source exits from bottom)
          const sourceRow = sourcePos.row || 0;
          const elemRow = elemPos.row || 0;
          
          if (DEBUG) console.log(`  Element ${elemId} in source lane: sourceRow=${sourceRow}, elemRow=${elemRow}, direction=${flowDirection}`);
          
          if (flowDirection === 'up' && sourceRow < elemRow) {
            // Source is above elem, going up - no block
            if (DEBUG) console.log(`    → No block (source above, going up)`);
            continue;
          }
          if (flowDirection === 'down' && sourceRow > elemRow) {
            // Source is below elem, going down - no block
            if (DEBUG) console.log(`    → No block (source below, going down)`);
            continue;
          }
        }
        
        // Otherwise, element blocks the path
        if (DEBUG) console.log(`  → BLOCKED by ${elemId}`);
        return false;
      }
    }
  }
  
  // Check ALL lanes (including source and target) for conflicting cross-lane flows
  for (let i = minLaneIndex; i <= maxLaneIndex; i++) {
    const laneId = laneIds[i];
    const laneMatrix = matrix.get(laneId);
    
    if (laneMatrix && laneMatrix.has(sourcePos.layer)) {
      const cell = laneMatrix.get(sourcePos.layer);
      if (cell && cell.flowCrossLane) {
        // There's already a cross-lane flow in this layer
        // Check if it's in the opposite direction
        if (cell.flowCrossLane !== flowDirection) {
          // Conflict detected - but check if it's in the source lane
          if (laneId === sourceLane) {
            // Conflict in source lane - this is OK if flows have different rows
            // (they exit from different sides and don't cross)
            if (DEBUG) console.log(`  → Conflicting flow in source lane ${laneId}, but different rows - OK`);
            continue;
          }
          
          if (DEBUG) console.log(`  → BLOCKED by conflicting flow in lane ${laneId} (${cell.flowCrossLane} vs ${flowDirection})`);
          return false;  // Path is blocked by conflicting cross-lane flow
        }
      }
    }
  }

  if (DEBUG) console.log(`  → Path is FREE`);
  return true;  // Path is free
}

/**
 * Assign position for cross-lane flow (free path)
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignCrossLaneFreePosition(sourceId, targetId, positions, elementLanes, lanes) {
  const sourcePos = positions.get(sourceId);
  const lane = elementLanes.get(targetId);
  const sourceLane = elementLanes.get(sourceId);
  
  const DEBUG = process.env.DEBUG_COLLISION === 'true';
  if (DEBUG) console.log(`\n[COLLISION CHECK] ${sourceId} (${sourceLane}, layer ${sourcePos.layer}) → ${targetId} (${lane})`);
  
  // If target already has a position, keep it (first input wins for same-layer cross-lane)
  const existingPos = positions.get(targetId);
  if (existingPos) {
    if (DEBUG) console.log(`  Target already positioned at layer ${existingPos.layer}`);
    return existingPos;
  }

  // Get lane indices to determine which lanes are between source and target
  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(lane, lanes);
  const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
  const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);
  const laneIds = Array.from(lanes.keys());

  // Check if there are other elements in the same layer (collision detection)
  let targetLayer = sourcePos.layer;
  let hasCollision = false;
  
  // Check all elements in the same layer
  for (const [elemId, elemPos] of positions) {
    if (elemId !== sourceId && elemPos.layer === targetLayer) {
      // Element in same layer - check if it's in a different lane
      const elemLane = elementLanes.get(elemId);
      if (DEBUG) console.log(`  Checking ${elemId} (${elemLane}, layer ${elemPos.layer}, row ${elemPos.row})`);
      if (elemLane !== lane && elemLane !== sourceLane) {
        // Element in different lane but same layer - check if it's BETWEEN source and target
        const elemLaneIndex = getLaneIndex(elemLane, lanes);
        if (elemLaneIndex > minLaneIndex && elemLaneIndex < maxLaneIndex) {
          // Element is between source and target lanes - potential collision
          if (DEBUG) console.log(`    → COLLISION! (element between source and target lanes)`);
          hasCollision = true;
          break;
        } else {
          if (DEBUG) console.log(`    → No collision (element not between source and target)`);
        }
      } else {
        if (DEBUG) console.log(`    → No collision (same lane as source or target)`);
      }
    }
  }
  
  // If collision detected, move to next layer
  if (hasCollision) {
    if (DEBUG) console.log(`  → Moving target to layer ${targetLayer + 1}`);
    targetLayer = sourcePos.layer + 1;
  } else {
    if (DEBUG) console.log(`  → No collision, keeping layer ${targetLayer}`);
  }

  const targetPos = {
    lane,
    layer: targetLayer,
    row: 0
  };
  
  positions.set(targetId, targetPos);
  
  return targetPos;
}

/**
 * Create flow information for cross-lane flow (free path, same layer)
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - Flow information
 */
export function createCrossLaneFreeFlowInfo(flowId, sourceId, targetId, positions, elementLanes, lanes, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  // Calculate vertical relation using vIndex
  const sourceV = getVIndex(sourcePos.lane, sourcePos.row, lanes);
  const targetV = getVIndex(targetPos.lane, targetPos.row, lanes);
  const dv = targetV - sourceV;

  let exitSide, entrySide;

  if (sourcePos.layer === targetPos.layer) {
    // FALL 1: Same layer → pure vertical flow
    if (dv > 0) {
      // Target below
      exitSide = directions.crossLane;      // down
      entrySide = directions.oppCrossLane;  // up
    } else {
      // Target above
      exitSide = directions.oppCrossLane;   // up
      entrySide = directions.crossLane;     // down
    }
  } else {
    // FALL 2/3: Different layer
    // This function is used for "free path" which means same layer
    // For different layers, use createCrossLaneBlockedFlowInfo
    // But to be safe, handle it:
    exitSide = directions.alongLane;        // right
    entrySide = directions.oppAlongLane;    // left
  }
  
  // Calculate waypoint(s) for direction change
  const waypoint = calculateWaypoint(sourcePos, targetPos, exitSide, entrySide, directions);

  // Handle both single waypoint and array of waypoints
  let waypoints = [];
  if (waypoint) {
    waypoints = Array.isArray(waypoint) ? waypoint : [waypoint];
  }

  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: false,
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide: exitSide
    },
    waypoints: waypoints,
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide: entrySide
    }
  };
}

/**
 * Assign position for cross-lane flow (blocked path)
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignCrossLaneBlockedPosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const lane = elementLanes.get(targetId);

  const targetPos = {
    lane,
    layer: sourcePos.layer + 1,  // Layer +1 (blocked path)
    row: 0
  };
  
  positions.set(targetId, targetPos);
  
  return targetPos;
}

/**
 * Create flow information for cross-lane flow (blocked path, different layer)
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - Flow information
 */
export function createCrossLaneBlockedFlowInfo(flowId, sourceId, targetId, positions, elementLanes, lanes, directions, isGatewaySource = false) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  // Calculate vertical relation using vIndex
  const sourceV = getVIndex(sourcePos.lane, sourcePos.row, lanes);
  const targetV = getVIndex(targetPos.lane, targetPos.row, lanes);
  const dv = targetV - sourceV;

  let exitSide, entrySide;

  if (isGatewaySource) {
    // FALL 3: Gateway fan-out → vertical first, then horizontal
    if (dv === 0) {
      // Target at same height
      exitSide = directions.alongLane;      // right
      entrySide = directions.oppAlongLane;  // left
    } else if (dv > 0) {
      // Target below
      exitSide = directions.crossLane;      // down
      entrySide = directions.oppAlongLane;  // left
    } else {
      // Target above
      exitSide = directions.oppCrossLane;   // up
      entrySide = directions.oppAlongLane;  // left
    }
  } else {
    // FALL 2: Non-gateway → horizontal first, then vertical
    exitSide = directions.alongLane;  // right (always)
    
    if (dv === 0) {
      // Target at same height
      entrySide = directions.oppAlongLane;  // left
    } else if (dv > 0) {
      // Target below → flow comes from below
      entrySide = directions.oppCrossLane;  // up
    } else {
      // Target above → flow comes from above
      entrySide = directions.crossLane;     // down
    }
  }

  const waypoint = calculateWaypoint(sourcePos, targetPos, exitSide, entrySide, directions);

  // Handle both single waypoint and array of waypoints
  let waypoints = [];
  if (waypoint) {
    waypoints = Array.isArray(waypoint) ? waypoint : [waypoint];
  }

  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: false,
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide
    },
    waypoints: waypoints,
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide
    }
  };
}

/**
 * Sort gateway outputs by target lane
 * @param {Array} outputFlowIds - Array of output flow IDs
 * @param {Map} flows - Flow map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {string} gatewayLane - Gateway lane ID
 * @returns {Array} - Sorted flow IDs
 */
export function sortGatewayOutputs(outputFlowIds, flows, elementLanes, lanes, gatewayLane) {
  const gatewayLaneIndex = getLaneIndex(gatewayLane, lanes);

  return outputFlowIds.sort((a, b) => {
    const flowA = flows.get(a);
    const flowB = flows.get(b);

    const targetLaneA = elementLanes.get(flowA.targetRef);
    const targetLaneB = elementLanes.get(flowB.targetRef);

    const laneIndexA = getLaneIndex(targetLaneA, lanes);
    const laneIndexB = getLaneIndex(targetLaneB, lanes);

    // Same lane outputs first, then by lane distance
    const distanceA = Math.abs(laneIndexA - gatewayLaneIndex);
    const distanceB = Math.abs(laneIndexB - gatewayLaneIndex);

    if (distanceA === 0 && distanceB !== 0) return -1;
    if (distanceA !== 0 && distanceB === 0) return 1;

    return laneIndexA - laneIndexB;
  });
}

/**
 * Assign symmetric rows for gateway outputs
 * @param {number} outputCount - Number of outputs
 * @returns {Array} - Array of row values
 */
export function assignSymmetricRows(outputCount) {
  if (outputCount === 1) {
    return [0];
  }

  const rows = [];
  const half = Math.floor(outputCount / 2);

  if (outputCount % 2 === 0) {
    // Even: [0, 1, 2, ...] for 2, 4, 6, ...
    for (let i = 0; i < outputCount; i++) {
      rows.push(i);
    }
  } else {
    // Odd: [-1, 0, 1] for 3, [-2, -1, 0, 1, 2] for 5, ...
    for (let i = -half; i <= half; i++) {
      rows.push(i);
    }
  }

  return rows;
}

/**
 * Determine which sides of a gateway are occupied by incoming flows
 * @param {string} gatewayId - Gateway ID
 * @param {Map} elements - Element map
 * @param {Map} flows - Flow map
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @param {Set} backEdgeSet - Set of back-flow IDs
 * @returns {Set} - Set of occupied sides ('top', 'bottom', 'left', 'right')
 */
export function determineGatewayOccupiedSides(gatewayId, elements, flows, positions, elementLanes, lanes, directions, backEdgeSet) {
  const occupiedSides = new Set();
  const gatewayElement = elements.get(gatewayId);
  
  if (!gatewayElement || !gatewayElement.incoming) {
    return occupiedSides;
  }

  const gatewayPos = positions.get(gatewayId);
  if (!gatewayPos) {
    return occupiedSides;
  }

  const gatewayLane = elementLanes.get(gatewayId);
  const gatewayLaneIndex = getLaneIndex(gatewayLane, lanes);

  // Check each incoming flow
  for (const flowId of gatewayElement.incoming) {
    // Skip back-flows as they don't occupy normal sides
    if (backEdgeSet.has(flowId)) {
      continue;
    }

    const flow = flows.get(flowId);
    if (!flow) continue;

    const sourceId = flow.sourceRef;
    const sourcePos = positions.get(sourceId);
    if (!sourcePos) continue;

    const sourceLane = elementLanes.get(sourceId);
    const sourceLaneIndex = getLaneIndex(sourceLane, lanes);

    // Determine which side the input comes from
    if (sourceLane === gatewayLane) {
      // Same lane - input comes from oppAlongLane direction (for horizontal: 'left')
      occupiedSides.add(directions.oppAlongLane);
    } else {
      // Cross-lane - input comes from crossLane or oppCrossLane direction
      if (sourceLaneIndex < gatewayLaneIndex) {
        // Source is above gateway - input from oppCrossLane (for horizontal: 'up')
        occupiedSides.add(directions.oppCrossLane);
      } else {
        // Source is below gateway - input from crossLane (for horizontal: 'down')
        occupiedSides.add(directions.crossLane);
      }
    }
  }

  return occupiedSides;
}

/**
 * Assign positions for gateway outputs
 * @param {string} gatewayId - Gateway ID
 * @param {Array} sortedOutputFlowIds - Sorted output flow IDs
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} flows - Flow map
 * @param {Map} lanes - Lane map (needed for lane index calculation)
 * @param {Set} occupiedSides - Set of occupied sides (direction values from directions object)
 * @param {Object} directions - Direction mappings
 * @returns {Map} - targetId → { lane, layer, row }
 */
export function assignGatewayOutputPositions(gatewayId, sortedOutputFlowIds, positions, elementLanes, flows, lanes, occupiedSides = new Set(), directions = {}) {
  const gatewayPos = positions.get(gatewayId);
  const gatewayLane = elementLanes.get(gatewayId);
  const gatewayLaneIndex = getLaneIndex(gatewayLane, lanes);

  // Separate same-lane and cross-lane outputs
  const sameLaneOutputs = [];
  const crossLaneOutputs = [];

  for (const flowId of sortedOutputFlowIds) {
    const flow = flows.get(flowId);
    const targetId = flow.targetRef;
    const targetLane = elementLanes.get(targetId);
    const targetLaneIndex = getLaneIndex(targetLane, lanes);

    if (targetLane === gatewayLane) {
      sameLaneOutputs.push({ flowId, targetId, targetLane });
    } else {
      crossLaneOutputs.push({ flowId, targetId, targetLane, laneDirection: targetLaneIndex > gatewayLaneIndex ? 'down' : 'up' });
    }
  }

  // Check if cross-lane outputs are symmetrically distributed (some up, some down)
  const hasUpOutputs = crossLaneOutputs.some(o => o.laneDirection === 'up');
  const hasDownOutputs = crossLaneOutputs.some(o => o.laneDirection === 'down');
  const isSymmetricDistribution = hasUpOutputs && hasDownOutputs;
  
  // Check if only single cross-lane forward-flow (rest are back-flows or same-lane)
  const hasSingleCrossLaneOutput = crossLaneOutputs.length === 1;

  // Check if multiple outputs go to the same target lane (would cause overlap)
  const targetLaneCounts = new Map();
  for (const { targetLane } of crossLaneOutputs) {
    targetLaneCounts.set(targetLane, (targetLaneCounts.get(targetLane) || 0) + 1);
  }
  const hasMultipleOutputsToSameLane = Array.from(targetLaneCounts.values()).some(count => count > 1);

  // Check if cross-lane sides are free for optimization
  // For symmetric distribution (up AND down), both crossLane directions must be free
  // For horizontal lanes: crossLane='down', oppCrossLane='up'
  const crossLaneFree = !occupiedSides.has(directions.crossLane);           // for horizontal: 'down' is free
  const oppCrossLaneFree = !occupiedSides.has(directions.oppCrossLane);     // for horizontal: 'up' is free
  const canUseOptimization = crossLaneFree && oppCrossLaneFree;

  // Determine layer offset for outputs
  // Optimization (layerOffset=0) applies when:
  // 1. Only single cross-lane forward-flow (compact layout), OR
  // 2. Cross-lane outputs are symmetrically distributed (up AND down)
  // AND both cross-lane sides are free (no inputs from those directions)
  // AND no multiple outputs to the same target lane (would cause overlap)
  // Otherwise use normal rule (layer + 1)
  const shouldOptimize = !hasMultipleOutputsToSameLane && (hasSingleCrossLaneOutput || isSymmetricDistribution) && canUseOptimization;
  const layerOffset = (crossLaneOutputs.length > 0 && shouldOptimize) ? 0 : 1;

  // Helper function to find eventual lane change direction (recursive)
  // Follows the flow chain until a lane change is found or end is reached
  const findEventualDirection = (startId, currentLane, visited = new Set()) => {
    if (visited.has(startId)) return 'none'; // Cycle detected
    visited.add(startId);
    
    // Find all outgoing flows from this element
    const outFlows = Array.from(flows.values()).filter(f => f.sourceRef === startId);
    
    if (outFlows.length === 0) return 'none'; // End reached, no lane change
    
    // Check each outgoing flow
    for (const flow of outFlows) {
      const targetLane = elementLanes.get(flow.targetRef);
      const targetLaneIndex = getLaneIndex(targetLane, lanes);
      
      // Found a lane change!
      if (targetLane !== currentLane) {
        return targetLaneIndex < getLaneIndex(currentLane, lanes) ? 'up' : 'down';
      }
      
      // Same lane, continue searching recursively
      const result = findEventualDirection(flow.targetRef, currentLane, visited);
      if (result !== 'none') return result; // Found a lane change downstream
    }
    
    return 'none'; // No lane change found in any path
  };
  
  // Sort same-lane outputs by their eventual flow direction (UP first, DOWN last)
  // This ensures outputs that eventually go UP are in upper rows, outputs that eventually go DOWN are in lower rows
  sameLaneOutputs.sort((a, b) => {
    // Find eventual direction for each output
    const aDirection = findEventualDirection(a.targetId, gatewayLane);
    const bDirection = findEventualDirection(b.targetId, gatewayLane);
    
    // UP first (row 0), DOWN last (row 1), NONE in between
    const directionPriority = { 'up': 0, 'none': 1, 'down': 2 };
    return directionPriority[aDirection] - directionPriority[bDirection];
  });
  
  // Assign symmetric rows only for same-lane outputs
  const sameLaneRows = assignSymmetricRows(sameLaneOutputs.length);

  const outputPositions = new Map();

  // Same-lane outputs with symmetric rows (always use layer + 1)
  for (let i = 0; i < sameLaneOutputs.length; i++) {
    const { targetId, targetLane } = sameLaneOutputs[i];
    const newLayer = gatewayPos.layer + 1;
    const existingPos = positions.get(targetId);
    
    if (existingPos) {
      // Target already has a position - update to maximum layer
      if (newLayer > existingPos.layer) {
        existingPos.layer = newLayer;
      }
      outputPositions.set(targetId, existingPos);
    } else {
      const targetPos = {
        lane: targetLane,
        layer: newLayer,
        row: sameLaneRows[i]
      };
      positions.set(targetId, targetPos);
      outputPositions.set(targetId, targetPos);
    }
  }

  // Cross-lane outputs - assign rows grouped by target lane to prevent overlaps
  // Group outputs by target lane
  const outputsByLane = new Map();
  for (const output of crossLaneOutputs) {
    if (!outputsByLane.has(output.targetLane)) {
      outputsByLane.set(output.targetLane, []);
    }
    outputsByLane.get(output.targetLane).push(output);
  }
  
  // Assign rows within each lane group
  for (const [targetLane, outputs] of outputsByLane) {
    const rows = assignSymmetricRows(outputs.length);
    outputs.forEach((output, i) => {
      output.assignedRow = rows[i];
    });
  }
  
  // Create positions with assigned rows
  for (const { targetId, targetLane, assignedRow } of crossLaneOutputs) {
    const newLayer = gatewayPos.layer + layerOffset;
    const existingPos = positions.get(targetId);
    
    if (existingPos) {
      // Target already has a position - update to maximum layer
      if (newLayer > existingPos.layer) {
        existingPos.layer = newLayer;
      }
      outputPositions.set(targetId, existingPos);
    } else {
      const targetPos = {
        lane: targetLane,
        layer: newLayer,
        row: assignedRow || 0  // Use assigned row, fallback to 0
      };
      positions.set(targetId, targetPos);
      outputPositions.set(targetId, targetPos);
    }
  }

  return { outputPositions, layerOffset };
}

/**
 * Create flow information for gateway output
 * @param {string} flowId - Flow ID
 * @param {string} gatewayId - Gateway ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - Flow information
 */
export function createGatewayOutputFlowInfo(flowId, gatewayId, targetId, positions, elementLanes, lanes, directions) {
  const gatewayPos = positions.get(gatewayId);
  const targetPos = positions.get(targetId);

  // Calculate vertical relation using vIndex (unified routing rule)
  const gatewayV = getVIndex(gatewayPos.lane, gatewayPos.row, lanes);
  const targetV = getVIndex(targetPos.lane, targetPos.row, lanes);
  const dv = targetV - gatewayV;

  let exitSide, entrySide;

  // FALL 3: Gateway fan-out (always applies to gateway outputs)
  if (dv === 0) {
    // Target at same height → straight horizontal
    exitSide = directions.alongLane;      // right
    entrySide = directions.oppAlongLane;  // left
  } else if (dv > 0) {
    // Target below → go down first, then right
    exitSide = directions.crossLane;      // down
    entrySide = directions.oppAlongLane;  // left
  } else {
    // Target above → go up first, then right
    exitSide = directions.oppCrossLane;   // up
    entrySide = directions.oppAlongLane;  // left
  }

  const waypoint = calculateWaypoint(gatewayPos, targetPos, exitSide, entrySide, directions);

  // Handle both single waypoint and array of waypoints
  let waypoints = [];
  if (waypoint) {
    waypoints = Array.isArray(waypoint) ? waypoint : [waypoint];
  }

  return {
    flowId,
    sourceId: gatewayId,
    targetId,
    isBackFlow: false,
    source: {
      lane: gatewayPos.lane,
      layer: gatewayPos.layer,
      row: gatewayPos.row,
      exitSide
    },
    waypoints: waypoints,
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide
    }
  };
}

/**
 * Create flow information for back-flow (to be routed in Phase 3)
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @returns {Object} - Flow information
 */
export function createBackFlowInfo(flowId, sourceId, targetId, positions, elementLanes, lanes, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  // Determine exitSide and entrySide for back-flows
  // Back-flows go backwards (target layer < source layer)
  // Typically: exit DOWN from source, enter from LEFT to target
  
  let exitSide, entrySide;
  
  // Check if same lane or cross-lane
  const sourceLane = elementLanes.get(sourceId);
  const targetLane = elementLanes.get(targetId);
  
  if (sourceLane === targetLane) {
    // Same lane back-flow: exit DOWN, enter LEFT
    exitSide = directions.crossLane;      // down (for horizontal)
    entrySide = directions.oppAlongLane;  // left (for horizontal)
  } else {
    // Cross-lane back-flow: exit DOWN, enter LEFT
    exitSide = directions.crossLane;      // down
    entrySide = directions.oppAlongLane;  // left
  }

  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: true,  // Mark as back-flow
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide  // Set exitSide for label positioning
    },
    waypoints: [],  // Will be calculated in Phase 3 (Manhattan routing)
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide  // Set entrySide
    }
  };
}

/**
 * Topologically sort flows to ensure dependencies are processed first
 * Elements with multiple inputs should be positioned after all their inputs
 * @param {Map} flows - Flow map
 * @param {Map} elements - Element map
 * @returns {Array} - Sorted array of [flowId, flow] tuples
 */
function topologicalSortFlows(flows, elements, backEdgeSet = new Set()) {
  // Build dependency graph: element -> number of unprocessed inputs
  const inDegree = new Map();
  const outgoingFlows = new Map(); // element -> list of outgoing flow IDs
  
  for (const [elementId, element] of elements) {
    // Count only non-back-flow inputs
    const nonBackFlowInputs = element.incoming.filter(flowId => !backEdgeSet.has(flowId));
    inDegree.set(elementId, nonBackFlowInputs.length);
    outgoingFlows.set(elementId, []);
  }
  
  // Build outgoing flows map
  for (const [flowId, flow] of flows) {
    if (backEdgeSet.has(flowId)) continue; // Skip back-flows
    const sourceId = flow.sourceRef;
    if (outgoingFlows.has(sourceId)) {
      outgoingFlows.get(sourceId).push(flowId);
    }
  }
  
  // Queue-based topological sort
  const queue = [];
  const result = [];
  const processed = new Set();
  
  // Start with elements that have no unprocessed inputs
  for (const [elementId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(elementId);
    }
  }
  
  while (queue.length > 0) {
    const elementId = queue.shift();
    if (processed.has(elementId)) continue;
    processed.add(elementId);
    
    // Add all outgoing flows from this element
    const outFlows = outgoingFlows.get(elementId) || [];
    for (const flowId of outFlows) {
      const flow = flows.get(flowId);
      if (!flow) continue;
      
      result.push([flowId, flow]);
      
      // Decrease inDegree of target element
      const targetId = flow.targetRef;
      const currentDegree = inDegree.get(targetId) || 0;
      const newDegree = currentDegree - 1;
      inDegree.set(targetId, newDegree);
      
      // If target has no more unprocessed inputs, add to queue
      if (newDegree === 0 && !processed.has(targetId)) {
        queue.push(targetId);
      }
    }
  }
  
  // Add back-flows at the end
  for (const [flowId, flow] of flows) {
    if (backEdgeSet.has(flowId)) {
      result.push([flowId, flow]);
    }
  }
  
  return result;
}

/**
 * Adjust layers for elements with multiple cross-lane inputs
 * to prevent flow collisions
 * @param {Map} positions - Element positions
 * @param {Map} flows - Flow map
 * @param {Map} elementLanes - Element lane assignments
 * @param {Set} backEdgeSet - Set of back edge flow IDs
 */
function adjustLayersForMultipleCrossLaneInputs(positions, flows, elementLanes, backEdgeSet, elements) {
  // Count cross-lane inputs per element
  const crossLaneInputs = new Map();
  
  for (const [flowId, flow] of flows) {
    // Skip back edges
    if (backEdgeSet.has(flowId)) continue;
    
    const sourceId = flow.sourceRef;
    const targetId = flow.targetRef;
    
    const sourceLane = elementLanes.get(sourceId);
    const targetLane = elementLanes.get(targetId);
    
    // Check if this is a cross-lane flow
    if (sourceLane !== targetLane) {
      if (!crossLaneInputs.has(targetId)) {
        crossLaneInputs.set(targetId, []);
      }
      crossLaneInputs.get(targetId).push(flowId);
    }
  }
  
  // Adjust layer for elements with multiple inputs (cross-lane or same-lane)
  // Element must be placed AFTER the rightmost input
  const adjusted = new Set();
  
  // Build map of ALL inputs per element (not just cross-lane)
  // Exclude message flows - they don't constrain layer positioning
  const allInputs = new Map();
  for (const [flowId, flow] of flows) {
    if (backEdgeSet.has(flowId)) continue;
    if (flow.type === 'messageFlow') continue; // Skip message flows
    
    const targetId = flow.targetRef;
    if (!allInputs.has(targetId)) {
      allInputs.set(targetId, []);
    }
    allInputs.get(targetId).push(flowId);
  }
  
  // Adjust elements with multiple inputs
  // Skip if inputs come from gateways (gateway logic handles those)
  for (const [elementId, inputFlows] of allInputs) {
    if (inputFlows.length > 1) {
      const pos = positions.get(elementId);
      if (!pos) continue;
      
      // Check if any input comes from a gateway
      let hasGatewayInput = false;
      const inputLayers = [];
      
      for (const flowId of inputFlows) {
        const flow = flows.get(flowId);
        if (!flow) continue;
        
        const sourceId = flow.sourceRef;
        const sourceElement = elements.get(sourceId);
        
        // Check if source is a gateway
        if (sourceElement && (
          sourceElement.type === 'exclusiveGateway' ||
          sourceElement.type === 'parallelGateway' ||
          sourceElement.type === 'inclusiveGateway'
        )) {
          hasGatewayInput = true;
        }
        
        const sourcePos = positions.get(sourceId);
        if (sourcePos) {
          inputLayers.push(sourcePos.layer);
        }
      }
      
      // Skip adjustment if any input is from a gateway
      // Gateway output logic already handles positioning
      if (hasGatewayInput) {
        continue;
      }
      
      // For non-gateway inputs: adjust to max + 1 ONLY if multiple inputs
      // Single input should stay in same layer (direct cross-lane flow)
      if (inputLayers.length > 0) {
        const maxInputLayer = Math.max(...inputLayers);
        // Only add +1 for multiple inputs (to avoid collisions)
        // Single input: stay in same layer (direct vertical flow)
        const requiredLayer = inputLayers.length > 1 ? maxInputLayer + 1 : maxInputLayer;
        
        // Only adjust if element is too early
        if (pos.layer < requiredLayer) {
          pos.layer = requiredLayer;
          adjusted.add(elementId);
        }
      }
    }
  }
  
  // Propagate layer changes to dependent elements
  // If an element's layer was increased, all elements that depend on it
  // (i.e., have it as input) must also be shifted
  if (adjusted.size > 0) {
    propagateLayerChanges(positions, flows, adjusted, backEdgeSet, elementLanes);
  }
}

/**
 * Propagate layer changes to dependent elements
 * @param {Map} positions - Element positions
 * @param {Map} flows - Flow map
 * @param {Set} adjustedElements - Set of element IDs that had their layer increased
 * @param {Set} backEdgeSet - Set of back edge flow IDs
 */
function propagateLayerChanges(positions, flows, adjustedElements, backEdgeSet, elementLanes) {
  // Build dependency graph: element -> elements that depend on it
  // Track which flows are cross-lane
  const dependents = new Map();
  const crossLaneFlows = new Set();
  
  for (const [flowId, flow] of flows) {
    if (backEdgeSet.has(flowId)) continue;
    
    const sourceId = flow.sourceRef;
    const targetId = flow.targetRef;
    
    if (!dependents.has(sourceId)) {
      dependents.set(sourceId, []);
    }
    dependents.get(sourceId).push(targetId);
    
    // Check if this is a cross-lane flow
    const sourceLane = elementLanes.get(sourceId);
    const targetLane = elementLanes.get(targetId);
    if (sourceLane !== targetLane) {
      crossLaneFlows.add(`${sourceId}->${targetId}`);
    }
  }
  
  // Recursively update dependent elements
  const visited = new Set();
  
  function updateDependents(elementId) {
    if (visited.has(elementId)) return;
    visited.add(elementId);
    
    const deps = dependents.get(elementId) || [];
    const sourcePos = positions.get(elementId);
    
    if (!sourcePos) return;
    
    for (const depId of deps) {
      const depPos = positions.get(depId);
      if (!depPos) continue;
      
      // Check if this is a cross-lane flow
      const isCrossLane = crossLaneFlows.has(`${elementId}->${depId}`);
      
      // For cross-lane flows: allow same layer (direct vertical flow)
      // For same-lane flows: require layer + 1 (horizontal progression)
      const minLayer = isCrossLane ? sourcePos.layer : sourcePos.layer + 1;
      
      if (depPos.layer < minLayer) {
        depPos.layer = minLayer;
        // Recursively update this element's dependents
        updateDependents(depId);
      }
    }
  }
  
  // Start propagation from adjusted elements
  for (const elementId of adjustedElements) {
    updateDependents(elementId);
  }
}

/**
 * Update FlowInfos with adjusted positions after layer changes
 * Also recalculates exitSide, entrySide, and waypoints based on new positions
 * @param {Map} flowInfos - Flow information map
 * @param {Map} positions - Updated element positions
 * @param {Map} elements - Element map (to check if source is gateway)
 * @param {Map} lanes - Lane map (for vIndex calculation)
 * @param {Object} directions - Direction mappings
 */
function updateFlowInfosWithAdjustedPositions(flowInfos, positions, elements, lanes, directions) {
  for (const [flowId, flowInfo] of flowInfos) {
    // Skip back-flows (they don't have standard routing)
    if (flowInfo.isBackFlow) continue;
    
    // Update source position
    const sourcePos = positions.get(flowInfo.sourceId);
    if (!sourcePos) continue;
    
    flowInfo.source.lane = sourcePos.lane;
    flowInfo.source.layer = sourcePos.layer;
    flowInfo.source.row = sourcePos.row;
    
    // Update target position
    const targetPos = positions.get(flowInfo.targetId);
    if (!targetPos) continue;
    
    flowInfo.target.lane = targetPos.lane;
    flowInfo.target.layer = targetPos.layer;
    flowInfo.target.row = targetPos.row;
    
    // Recalculate exitSide, entrySide, and waypoints based on new positions
    const sourceEl = elements.get(flowInfo.sourceId);
    const isGatewaySource = sourceEl && sourceEl.type && sourceEl.type.includes('Gateway');
    
    // Calculate vertical relation using vIndex
    const sourceV = getVIndex(sourcePos.lane, sourcePos.row, lanes);
    const targetV = getVIndex(targetPos.lane, targetPos.row, lanes);
    const dv = targetV - sourceV;
    
    if (sourcePos.layer === targetPos.layer) {
      // FALL 1: Same layer → pure vertical flow
      if (dv > 0) {
        flowInfo.source.exitSide = directions.crossLane;      // down
        flowInfo.target.entrySide = directions.oppCrossLane;  // up
      } else {
        flowInfo.source.exitSide = directions.oppCrossLane;   // up
        flowInfo.target.entrySide = directions.crossLane;     // down
      }
    } else if (isGatewaySource) {
      // FALL 3: Gateway fan-out → vertical first, then horizontal
      if (dv === 0) {
        flowInfo.source.exitSide = directions.alongLane;      // right
        flowInfo.target.entrySide = directions.oppAlongLane;  // left
      } else if (dv > 0) {
        flowInfo.source.exitSide = directions.crossLane;      // down
        flowInfo.target.entrySide = directions.oppAlongLane;  // left
      } else {
        flowInfo.source.exitSide = directions.oppCrossLane;   // up
        flowInfo.target.entrySide = directions.oppAlongLane;  // left
      }
    } else {
      // FALL 2: Non-gateway → horizontal first, then vertical
      flowInfo.source.exitSide = directions.alongLane;  // right (always)
      
      if (dv === 0) {
        flowInfo.target.entrySide = directions.oppAlongLane;  // left
      } else if (dv > 0) {
        flowInfo.target.entrySide = directions.oppCrossLane;  // up
      } else {
        flowInfo.target.entrySide = directions.crossLane;     // down
      }
    }
    
    // Recalculate waypoint(s)
    const waypoint = calculateWaypoint(sourcePos, targetPos, flowInfo.source.exitSide, flowInfo.target.entrySide, directions);
    // Handle both single waypoint and array of waypoints
    if (waypoint) {
      flowInfo.waypoints = Array.isArray(waypoint) ? waypoint : [waypoint];
    } else {
      flowInfo.waypoints = [];
    }
  }
}

/**
 * Main Phase 2 function: Assign positions and create flow information
 * @param {Map} elements - Element map
 * @param {Map} flows - Flow map
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @param {Array} backEdges - Back edges array
 * @returns {Object} - { positions, flowInfos, elementLanes, matrix }
 */
export function phase2(elements, flows, lanes, directions, backEdges, pools = new Map()) {
  // Store pools in module-level variable for getLaneIndex
  _pools = pools;
  
  // Step 1: Assign gateway lanes
  const elementLanes = assignGatewayLanes(elements, flows, lanes);
  
  // Step 2: Initialize matrix
  const matrix = initializeMatrix(lanes);
  
  // Step 3: Initialize positions and flow infos
  const positions = new Map();
  const flowInfos = new Map();
  
  // Convert backEdges array to Set for fast lookup
  const backEdgeSet = new Set(backEdges);
  
  // Step 3.5: Message flows are handled separately (no pre-positioning)
  // Message catch events will be positioned by their outgoing sequence flows
  
  // Step 4: Process all flows in topological order
  const sortedFlows = topologicalSortFlows(flows, elements, backEdgeSet);
  
  const DEBUG = process.env.DEBUG_PHASE2 === 'true';
  if (DEBUG) console.log('\n=== FLOW PROCESSING ORDER ===');
  
  for (const [flowId, flow] of sortedFlows) {
    const sourceId = flow.sourceRef;
    const targetId = flow.targetRef;
    
    // Check if this is a back-flow
    if (backEdgeSet.has(flowId)) {
      // Back-flows are marked but not routed in Phase 2
      const flowInfo = createBackFlowInfo(flowId, sourceId, targetId, positions, elementLanes, lanes, directions);
      flowInfos.set(flowId, flowInfo);
      if (DEBUG) console.log(`  ${flowId}: ${sourceId} -> ${targetId} (BACK-EDGE - skipped)`);
      continue;
    }
    
    // Check if source is a gateway with multiple outputs
    const sourceElement = elements.get(sourceId);
    const isGateway = sourceElement && (
      sourceElement.type === 'exclusiveGateway' ||
      sourceElement.type === 'parallelGateway' ||
      sourceElement.type === 'inclusiveGateway' ||
      sourceElement.type === 'eventBasedGateway' ||
      sourceElement.type === 'complexGateway'
    );
    
    // Get all output flows from source
    const outputFlows = [];
    for (const [fId, f] of flows) {
      if (f.sourceRef === sourceId) {
        outputFlows.push(fId);
      }
    }
    
    const hasMultipleOutputs = outputFlows.length > 1;
    
    if (isGateway && hasMultipleOutputs) {
      // Handle gateway outputs separately
      // First, ensure gateway has a position
      if (!positions.has(sourceId)) {
        const gatewayLane = elementLanes.get(sourceId);
        positions.set(sourceId, {
          lane: gatewayLane,
          layer: 0, // Will be adjusted based on inputs
          row: 0
        });
      }
      
      // Sort gateway outputs (exclude back-flows)
      const forwardOutputs = outputFlows.filter(flowId => !backEdgeSet.has(flowId));
      const sortedOutputs = sortGatewayOutputs(
        forwardOutputs,
        flows,
        elementLanes,
        lanes,
        elementLanes.get(sourceId)
      );
      
      // Determine which sides are occupied by inputs
      const occupiedSides = determineGatewayOccupiedSides(sourceId, elements, flows, positions, elementLanes, lanes, directions, backEdgeSet);
      
      // Assign positions to gateway output targets
      const { outputPositions, layerOffset } = assignGatewayOutputPositions(sourceId, sortedOutputs, positions, elementLanes, flows, lanes, occupiedSides, directions);
      
      // Create flow info for this gateway output
      const flowInfo = createGatewayOutputFlowInfo(
        flowId,
        sourceId,
        targetId,
        positions,
        elementLanes,
        lanes,
        directions
      );
      
      // Mark if gateway optimization was applied (for label positioning)
      flowInfo.gatewayOptimized = (layerOffset === 0);
      flowInfos.set(flowId, flowInfo);
      
      if (DEBUG) {
        const targetPos = positions.get(targetId);
        console.log(`  ${flowId}: ${sourceId} -> ${targetId} (gateway output, layer ${targetPos?.layer})`);
      }
      
    } else {
      // Regular flow (not gateway output)
      
      // Ensure source has a position
      if (!positions.has(sourceId)) {
        const sourceLane = elementLanes.get(sourceId);
        positions.set(sourceId, {
          lane: sourceLane,
          layer: 0,
          row: 0
        });
      }
      
      // Check if cross-lane
      if (isCrossLane(flow, elementLanes)) {
        // Cross-lane flow
        const pathFree = isCrossLanePathFree(
          sourceId,
          targetId,
          positions,
          elementLanes,
          lanes,
          matrix
        );
        
        if (pathFree) {
          // Free path - direct vertical connection
          assignCrossLaneFreePosition(sourceId, targetId, positions, elementLanes, lanes);
          const flowInfo = createCrossLaneFreeFlowInfo(
            flowId,
            sourceId,
            targetId,
            positions,
            elementLanes,
            lanes,
            directions
          );
          flowInfos.set(flowId, flowInfo);
          
          if (DEBUG) {
            const targetPos = positions.get(targetId);
            console.log(`  ${flowId}: ${sourceId} -> ${targetId} (cross-lane free, layer ${targetPos?.layer})`);
          }
          
          // Update matrix to track cross-lane flow direction
          const sourcePos = positions.get(sourceId);
          const sourceLane = elementLanes.get(sourceId);
          const targetLane = elementLanes.get(targetId);
          const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
          const targetLaneIndex = getLaneIndex(targetLane, lanes);
          const flowDirection = targetLaneIndex > sourceLaneIndex ? 'down' : 'up';
          
          // Mark all lanes in the path with this flow direction
          const laneIds = Array.from(lanes.keys());
          const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
          const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);
          
          for (let i = minLaneIndex; i <= maxLaneIndex; i++) {
            const laneId = laneIds[i];
            const laneMatrix = matrix.get(laneId);
            if (!laneMatrix.has(sourcePos.layer)) {
              laneMatrix.set(sourcePos.layer, { elements: [], flowAlongLane: null, flowCrossLane: null });
            }
            const cell = laneMatrix.get(sourcePos.layer);
            cell.flowCrossLane = flowDirection;
          }
        } else {
          // Blocked path - L-shaped with waypoint
          assignCrossLaneBlockedPosition(sourceId, targetId, positions, elementLanes);
          
          // Check if source is a gateway
          const sourceEl = elements.get(sourceId);
          const isGatewaySource = sourceEl && sourceEl.type && sourceEl.type.includes('Gateway');
          
          const flowInfo = createCrossLaneBlockedFlowInfo(
            flowId,
            sourceId,
            targetId,
            positions,
            elementLanes,
            lanes,
            directions,
            isGatewaySource
          );
          flowInfos.set(flowId, flowInfo);
          
          if (DEBUG) {
            const targetPos = positions.get(targetId);
            console.log(`  ${flowId}: ${sourceId} -> ${targetId} (cross-lane blocked, layer ${targetPos?.layer})`);
          }
        }
      } else {
        // Same-lane flow
        const before = positions.get(targetId)?.layer;
        assignSameLanePosition(sourceId, targetId, positions, elementLanes);
        const after = positions.get(targetId)?.layer;
        if (DEBUG) console.log(`  ${flowId}: ${sourceId} -> ${targetId} (same-lane, layer ${before || 'new'} -> ${after})`);
        const flowInfo = createSameLaneFlowInfo(
          flowId,
          sourceId,
          targetId,
          positions,
          directions
        );
        flowInfos.set(flowId, flowInfo);
      }
    }
  }
  
  // Step 5: Create FlowInfos for message flows (direct routing, no waypoints)
  for (const [flowId, flow] of flows) {
    if (flow.type === 'messageFlow') {
      const sourceId = flow.sourceRef;
      const targetId = flow.targetRef;
      
      const sourcePos = positions.get(sourceId);
      const targetPos = positions.get(targetId);
      
      if (sourcePos && targetPos) {
        // Create simple flowInfo for message flow
        const flowInfo = {
          flowId,
          sourceId,
          targetId,
          isMessageFlow: true,
          isBackFlow: false,
          source: {
            lane: sourcePos.lane,
            layer: sourcePos.layer,
            row: sourcePos.row,
            exitSide: directions.crossLane // Default exit side (down for horizontal)
          },
          target: {
            lane: targetPos.lane,
            layer: targetPos.layer,
            row: targetPos.row,
            entrySide: directions.crossLane // Default entry side
          },
          waypoints: [] // No intermediate waypoints for message flows
        };
        flowInfos.set(flowId, flowInfo);
      }
    }
  }
  
  // Step 6: Adjust layers for elements with multiple cross-lane inputs
  adjustLayersForMultipleCrossLaneInputs(positions, flows, elementLanes, backEdgeSet, elements);
  
  // Step 6.5: Assign rows to prevent collisions
  assignRows(positions, flows);
  
  // Step 7: Update FlowInfos with adjusted positions
  updateFlowInfosWithAdjustedPositions(flowInfos, positions, elements, lanes, directions);
  
  // Step 8: Check for collisions (debugging)
  checkAllCollisions(positions, flows);
  
  return {
    positions,
    flowInfos,
    elementLanes,
    matrix
  };
}
