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

/**
 * Get lane index (position in lane list)
 * @param {string} laneId - Lane ID
 * @param {Map} lanes - Lane map
 * @returns {number} - Lane index (0 = first/top)
 */
function getLaneIndex(laneId, lanes) {
  const laneIds = Array.from(lanes.keys());
  return laneIds.indexOf(laneId);
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

  // Now assign lanes to gateways
  for (const [elementId, element] of elements) {
    // Skip if already assigned
    if (elementLanes.has(elementId)) {
      continue;
    }

    const isGateway = element.type.includes('Gateway');
    if (!isGateway) {
      continue;
    }

    // Split gateway (1 input, multiple outputs)
    if (element.incoming.length === 1 && element.outgoing.length > 1) {
      const incomingFlow = flows.get(element.incoming[0]);
      if (incomingFlow) {
        const sourceLane = elementLanes.get(incomingFlow.sourceRef);
        if (sourceLane) {
          elementLanes.set(elementId, sourceLane);
        }
      }
    }
    // Merge gateway (multiple inputs, 1 output)
    else if (element.incoming.length > 1 && element.outgoing.length === 1) {
      const outgoingFlow = flows.get(element.outgoing[0]);
      if (outgoingFlow) {
        const targetLane = elementLanes.get(outgoingFlow.targetRef);
        if (targetLane) {
          elementLanes.set(elementId, targetLane);
        }
      }
    }
  }

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
 * Check if cross-lane path is free (no elements in between)
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

  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);

  const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
  const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);

  // Check all lanes between source and target
  const laneIds = Array.from(lanes.keys());
  for (let i = minLaneIndex + 1; i < maxLaneIndex; i++) {
    const laneId = laneIds[i];
    const laneMatrix = matrix.get(laneId);
    
    if (laneMatrix && laneMatrix.has(sourcePos.layer)) {
      const cell = laneMatrix.get(sourcePos.layer);
      if (cell && cell.elements && cell.elements.length > 0) {
        return false;  // Path is blocked
      }
    }
  }

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
export function assignCrossLaneFreePosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const lane = elementLanes.get(targetId);
  
  // If target already has a position, keep it (first input wins for same-layer cross-lane)
  const existingPos = positions.get(targetId);
  if (existingPos) {
    return existingPos;
  }

  const targetPos = {
    lane,
    layer: sourcePos.layer,  // Same layer (free path)
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
  
  // Calculate waypoint for direction change
  const waypoint = calculateWaypoint(sourcePos, targetPos, exitSide, entrySide, directions);

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
    waypoints: waypoint ? [waypoint] : [],
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
    waypoints: [waypoint],
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
 * Assign positions for gateway outputs
 * @param {string} gatewayId - Gateway ID
 * @param {Array} sortedOutputFlowIds - Sorted output flow IDs
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} flows - Flow map
 * @returns {Map} - targetId → { lane, layer, row }
 */
export function assignGatewayOutputPositions(gatewayId, sortedOutputFlowIds, positions, elementLanes, flows) {
  const gatewayPos = positions.get(gatewayId);
  const gatewayLane = elementLanes.get(gatewayId);

  // Separate same-lane and cross-lane outputs
  const sameLaneOutputs = [];
  const crossLaneOutputs = [];

  for (const flowId of sortedOutputFlowIds) {
    const flow = flows.get(flowId);
    const targetId = flow.targetRef;
    const targetLane = elementLanes.get(targetId);

    if (targetLane === gatewayLane) {
      sameLaneOutputs.push({ flowId, targetId, targetLane });
    } else {
      crossLaneOutputs.push({ flowId, targetId, targetLane });
    }
  }

  // Assign symmetric rows only for same-lane outputs
  const sameLaneRows = assignSymmetricRows(sameLaneOutputs.length);

  const outputPositions = new Map();

  // Same-lane outputs with symmetric rows
  for (let i = 0; i < sameLaneOutputs.length; i++) {
    const { targetId, targetLane } = sameLaneOutputs[i];
    const targetPos = {
      lane: targetLane,
      layer: gatewayPos.layer + 1,
      row: sameLaneRows[i]
    };
    positions.set(targetId, targetPos);
    outputPositions.set(targetId, targetPos);
  }

  // Cross-lane outputs always at row 0
  for (const { targetId, targetLane } of crossLaneOutputs) {
    const targetPos = {
      lane: targetLane,
      layer: gatewayPos.layer + 1,
      row: 0  // Always row 0 for cross-lane
    };
    positions.set(targetId, targetPos);
    outputPositions.set(targetId, targetPos);
  }

  return outputPositions;
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
    waypoints: [waypoint],
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
export function createBackFlowInfo(flowId, sourceId, targetId, positions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: true,  // Mark as back-flow
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide: null  // Will be determined in Phase 3
    },
    waypoints: [],  // Will be calculated in Phase 3 (Manhattan routing)
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide: null  // Will be determined in Phase 3
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
function topologicalSortFlows(flows, elements) {
  // Build dependency graph: element -> number of unprocessed inputs
  const inDegree = new Map();
  const processed = new Set();
  
  for (const [elementId, element] of elements) {
    inDegree.set(elementId, element.incoming.length);
  }
  
  // Sort flows: prioritize flows to elements with fewer unprocessed inputs
  const flowArray = Array.from(flows.entries());
  
  flowArray.sort(([flowIdA, flowA], [flowIdB, flowB]) => {
    const targetA = flowA.targetRef;
    const targetB = flowB.targetRef;
    
    // Count how many inputs are still unprocessed
    const unprocessedA = inDegree.get(targetA) || 0;
    const unprocessedB = inDegree.get(targetB) || 0;
    
    // Prioritize flows to elements with fewer unprocessed inputs
    if (unprocessedA !== unprocessedB) {
      return unprocessedA - unprocessedB;
    }
    
    // If same, maintain original order
    return 0;
  });
  
  return flowArray;
}

/**
 * Adjust layers for elements with multiple cross-lane inputs
 * to prevent flow collisions
 * @param {Map} positions - Element positions
 * @param {Map} flows - Flow map
 * @param {Map} elementLanes - Element lane assignments
 * @param {Set} backEdgeSet - Set of back edge flow IDs
 */
function adjustLayersForMultipleCrossLaneInputs(positions, flows, elementLanes, backEdgeSet) {
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
  
  // Adjust layer for elements with multiple cross-lane inputs
  for (const [elementId, inputFlows] of crossLaneInputs) {
    if (inputFlows.length > 1) {
      const pos = positions.get(elementId);
      if (pos) {
        // Move element one layer to the right to make space for converging flows
        pos.layer += 1;
      }
    }
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
    
    // Recalculate waypoint
    const waypoint = calculateWaypoint(sourcePos, targetPos, flowInfo.source.exitSide, flowInfo.target.entrySide, directions);
    flowInfo.waypoints = waypoint ? [waypoint] : [];
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
export function phase2(elements, flows, lanes, directions, backEdges) {
  // Step 1: Assign gateway lanes
  const elementLanes = assignGatewayLanes(elements, flows, lanes);
  
  // Step 2: Initialize matrix
  const matrix = initializeMatrix(lanes);
  
  // Step 3: Initialize positions and flow infos
  const positions = new Map();
  const flowInfos = new Map();
  
  // Convert backEdges array to Set for fast lookup
  const backEdgeSet = new Set(backEdges);
  
  // Step 4: Process all flows in topological order
  const sortedFlows = topologicalSortFlows(flows, elements);
  
  for (const [flowId, flow] of sortedFlows) {
    const sourceId = flow.sourceRef;
    const targetId = flow.targetRef;
    
    // Check if this is a back-flow
    if (backEdgeSet.has(flowId)) {
      // Back-flows are marked but not routed in Phase 2
      const flowInfo = createBackFlowInfo(flowId, sourceId, targetId, positions);
      flowInfos.set(flowId, flowInfo);
      continue;
    }
    
    // Check if source is a gateway with multiple outputs
    const sourceElement = elements.get(sourceId);
    const isGateway = sourceElement && (
      sourceElement.type === 'exclusiveGateway' ||
      sourceElement.type === 'parallelGateway' ||
      sourceElement.type === 'inclusiveGateway'
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
      
      // Sort gateway outputs
      const sortedOutputs = sortGatewayOutputs(
        outputFlows,
        flows,
        elementLanes,
        lanes,
        elementLanes.get(sourceId)
      );
      
      // Assign positions to gateway output targets
      assignGatewayOutputPositions(sourceId, sortedOutputs, positions, elementLanes, flows);
      
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
      flowInfos.set(flowId, flowInfo);
      
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
          assignCrossLaneFreePosition(sourceId, targetId, positions, elementLanes);
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
        } else {
          // Blocked path - L-shaped with waypoint
          assignCrossLaneBlockedPosition(sourceId, targetId, positions, elementLanes);
          
          // Check if source is a gateway
          const sourceEl = elements.find(e => e.id === sourceId);
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
        }
      } else {
        // Same-lane flow
        assignSameLanePosition(sourceId, targetId, positions, elementLanes);
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
  
  // Step 5: Adjust layers for elements with multiple cross-lane inputs
  adjustLayersForMultipleCrossLaneInputs(positions, flows, elementLanes, backEdgeSet);
  
  // Step 6: Update FlowInfos with adjusted positions
  updateFlowInfosWithAdjustedPositions(flowInfos, positions, elements, lanes, directions);
  
  return {
    positions,
    flowInfos,
    elementLanes,
    matrix
  };
}
