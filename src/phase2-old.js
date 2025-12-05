/**
 * Phase 2: Position Assignment + Waypoints + Collision Detection
 * 
 * This phase handles:
 * - Applying configuration (abstract directions)
 * - Gateway lane assignment
 * - Position assignment (lane, layer, row)
 * - Waypoint calculation
 * - Proactive collision prevention through corridor reservation
 */

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
    // Default: use first output's lane
    else if (element.outgoing.length > 0) {
      const outgoingFlow = flows.get(element.outgoing[0]);
      if (outgoingFlow) {
        const targetLane = elementLanes.get(outgoingFlow.targetRef);
        if (targetLane) {
          elementLanes.set(elementId, targetLane);
        }
      }
    }
  }

  return elementLanes;
}

/**
 * Get lane index (position in lane list)
 * @param {string} laneId - Lane ID
 * @param {Map} lanes - Lane map
 * @returns {number} - Lane index
 */
export function getLaneIndex(laneId, lanes) {
  const laneIds = Array.from(lanes.keys());
  return laneIds.indexOf(laneId);
}

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
 * @returns {string} - "crossLane" or "oppCrossLane"
 */
export function getCrossLaneDirection(flow, elementLanes, lanes, directions) {
  const sourceLane = elementLanes.get(flow.sourceRef);
  const targetLane = elementLanes.get(flow.targetRef);

  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);

  if (targetLaneIndex > sourceLaneIndex) {
    return 'crossLane';  // Going in crossLane direction (down/right)
  } else {
    return 'oppCrossLane';  // Going in oppCrossLane direction (up/left)
  }
}

/**
 * Identify elements that receive back-flows (loop targets)
 * @param {Map} elements - Element map
 * @param {Array} backEdges - Array of flow IDs that are back-edges
 * @param {Map} flows - Flow map
 * @returns {Set} - Set of element IDs that receive back-flows
 */
export function identifyBackFlowTargets(elements, backEdges, flows) {
  const backFlowTargets = new Set();

  for (const flowId of backEdges) {
    const flow = flows.get(flowId);
    if (flow) {
      backFlowTargets.add(flow.targetRef);
    }
  }

  return backFlowTargets;
}

/**
 * Reserve columns for elements that receive back-flows
 * This must be done BEFORE position assignment to prevent collisions
 * @param {Set} backFlowTargets - Set of element IDs that receive back-flows
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Map} - elementId → { reservedColumn: true }
 */
export function reserveBackFlowColumns(backFlowTargets, elementLanes) {
  const reservations = new Map();

  for (const elementId of backFlowTargets) {
    reservations.set(elementId, { reservedColumn: true });
  }

  return reservations;
}

/**
 * Check if an element has a reserved column (receives back-flow)
 * @param {string} elementId - Element ID
 * @param {Map} reservations - Reservation map
 * @returns {boolean}
 */
export function hasReservedColumn(elementId, reservations) {
  return reservations.has(elementId) && reservations.get(elementId).reservedColumn === true;
}

/**
 * Assign position for same-lane flow (Rule 1)
 * Target element gets layer + 1 from source element
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Current positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignSameLanePosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  return {
    lane: targetLane,
    layer: sourcePos.layer + 1,
    row: sourcePos.row
  };
}

/**
 * Create waypoints for same-lane flow
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Object} directions - Direction mappings
 * @returns {Array} - Array of logical waypoints
 */
export function createSameLaneWaypoints(flowId, sourceId, targetId, positions, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  return [
    {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      side: directions.alongLane
    },
    {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      side: directions.oppAlongLane
    }
  ];
}

/**
 * Check if cross-lane path is free
 * Path is free if:
 * 1. No elements in lanes between source and target at source layer
 * 2. Target element does NOT have a reserved column (no back-flow)
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Current positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Map} matrix - Matrix tracking elements and flows
 * @param {Map} reservations - Back-flow reservations
 * @returns {boolean}
 */
export function isCrossLanePathFree(sourceId, targetId, positions, elementLanes, lanes, matrix, reservations) {
  const sourcePos = positions.get(sourceId);
  const sourceLane = elementLanes.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  // Check if target has reserved column (receives back-flow)
  if (hasReservedColumn(targetId, reservations)) {
    return false;
  }

  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);

  const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
  const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);

  // Check all lanes between source and target
  const laneIds = Array.from(lanes.keys());
  for (let i = minLaneIndex; i <= maxLaneIndex; i++) {
    const laneId = laneIds[i];
    const laneMatrix = matrix.get(laneId);
    
    if (laneMatrix && laneMatrix.has(sourcePos.layer)) {
      const cell = laneMatrix.get(sourcePos.layer);
      // If there are elements in this cell, path is blocked
      if (cell.elements && cell.elements.length > 0) {
        // Exception: source and target lanes can have elements
        if (laneId !== sourceLane && laneId !== targetLane) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Assign position for cross-lane flow with free path (Rule 3)
 * Target element gets same layer as source element
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Current positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignCrossLaneFreePosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  return {
    lane: targetLane,
    layer: sourcePos.layer,  // Same layer!
    row: 0  // Default row
  };
}

/**
 * Create waypoints for cross-lane flow
 * Two cases:
 * 1. Same layer: Straight line (crossLane → oppCrossLane)
 * 2. Different layers: L-shape with minimal bends
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Array} - Array of logical waypoints
 */
export function createCrossLaneWaypoints(flowId, sourceId, targetId, positions, elementLanes, lanes, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  const sourceLane = elementLanes.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  const crossDirection = getCrossLaneDirection(
    { sourceRef: sourceId, targetRef: targetId },
    elementLanes,
    lanes,
    directions
  );

  const crossSide = crossDirection === 'crossLane' ? directions.crossLane : directions.oppCrossLane;
  const oppCrossSide = crossDirection === 'crossLane' ? directions.oppCrossLane : directions.crossLane;

  // Case 1: Same layer - straight line (crossLane → oppCrossLane)
  if (sourcePos.layer === targetPos.layer) {
    return [
      // Start: source element, crossLane side (going down/up)
      {
        lane: sourcePos.lane,
        layer: sourcePos.layer,
        row: sourcePos.row,
        side: crossSide
      },
      // End: target element, oppCrossLane side (coming from up/down)
      {
        lane: targetPos.lane,
        layer: targetPos.layer,
        row: targetPos.row,
        side: oppCrossSide
      }
    ];
  }

  // Case 2: Different layers - L-shape (alongLane → crossLane → oppCrossLane)
  return [
    // Start: source element, alongLane side (going right/down)
    {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      side: directions.alongLane
    },
    // Corner: target layer, source lane, crossLane side (bending down/right)
    {
      lane: sourceLane,
      layer: targetPos.layer,
      row: sourcePos.row,
      side: crossSide
    },
    // End: target element, oppCrossLane side (coming from up/left)
    {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      side: oppCrossSide
    }
  ];
}

/**
 * Assign position for cross-lane flow with blocked path (Rule 4)
 * Target element gets layer + 1 from source element
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Map} positions - Current positions map
 * @param {Map} elementLanes - elementId → laneId
 * @returns {Object} - { lane, layer, row }
 */
export function assignCrossLaneBlockedPosition(sourceId, targetId, positions, elementLanes) {
  const sourcePos = positions.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  return {
    lane: targetLane,
    layer: sourcePos.layer + 1,  // Layer + 1 because path is blocked
    row: 0  // Default row
  };
}

/**
 * Sort gateway outputs by target lane position
 * Outputs going in oppCrossLane direction come first, then same lane, then crossLane direction
 * @param {Array} outputFlowIds - Array of output flow IDs
 * @param {Map} flows - Flow map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {string} gatewayLane - Gateway's lane ID
 * @returns {Array} - Sorted array of flow IDs
 */
export function sortGatewayOutputs(outputFlowIds, flows, elementLanes, lanes, gatewayLane) {
  const gatewayLaneIndex = getLaneIndex(gatewayLane, lanes);

  return outputFlowIds.slice().sort((flowIdA, flowIdB) => {
    const flowA = flows.get(flowIdA);
    const flowB = flows.get(flowIdB);

    const targetLaneA = elementLanes.get(flowA.targetRef);
    const targetLaneB = elementLanes.get(flowB.targetRef);

    const targetIndexA = getLaneIndex(targetLaneA, lanes);
    const targetIndexB = getLaneIndex(targetLaneB, lanes);

    // Sort by lane index: lower index (oppCrossLane) first, higher index (crossLane) last
    return targetIndexA - targetIndexB;
  });
}

/**
 * Assign symmetric rows for gateway outputs
 * 2 outputs: [0, 1]
 * 3 outputs: [-1, 0, 1]
 * 4 outputs: [-1, 0, 1, 2]
 * etc.
 * @param {number} outputCount - Number of outputs
 * @returns {Array} - Array of row numbers
 */
export function assignSymmetricRows(outputCount) {
  const rows = [];
  
  if (outputCount === 1) {
    return [0];
  }
  
  if (outputCount === 2) {
    return [0, 1];
  }
  
  // For 3+ outputs, center around 0
  const half = Math.floor(outputCount / 2);
  const start = outputCount % 2 === 0 ? -half + 1 : -half;
  
  for (let i = 0; i < outputCount; i++) {
    rows.push(start + i);
  }
  
  return rows;
}

/**
 * Assign positions for gateway outputs (Rule 5)
 * All outputs get layer + 1, with symmetric row assignments
 * @param {string} gatewayId - Gateway element ID
 * @param {Array} outputFlowIds - Sorted array of output flow IDs
 * @param {Map} positions - Current positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} flows - Flow map
 * @returns {Map} - Map of targetId → { lane, layer, row }
 */
export function assignGatewayOutputPositions(gatewayId, outputFlowIds, positions, elementLanes, flows) {
  const gatewayPos = positions.get(gatewayId);
  const outputPositions = new Map();
  
  const rows = assignSymmetricRows(outputFlowIds.length);
  
  for (let i = 0; i < outputFlowIds.length; i++) {
    const flowId = outputFlowIds[i];
    const flow = flows.get(flowId);
    const targetId = flow.targetRef;
    const targetLane = elementLanes.get(targetId);
    
    outputPositions.set(targetId, {
      lane: targetLane,
      layer: gatewayPos.layer + 1,
      row: gatewayPos.row + rows[i]  // Offset from gateway's row
    });
  }
  
  return outputPositions;
}

/**
 * Create waypoints for back-flow (loop)
 * Back-flows go in oppAlongLane direction (backwards)
 * @param {string} flowId - Flow ID
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID (loop target)
 * @param {Map} positions - Positions map
 * @param {Map} elementLanes - elementId → laneId
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Array} - Array of logical waypoints
 */
export function createBackFlowWaypoints(flowId, sourceId, targetId, positions, elementLanes, lanes, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  const sourceLane = elementLanes.get(sourceId);
  const targetLane = elementLanes.get(targetId);

  // Same lane back-flow
  if (sourceLane === targetLane) {
    return [
      // Start: source element, oppAlongLane side (going backwards/left)
      {
        lane: sourcePos.lane,
        layer: sourcePos.layer,
        row: sourcePos.row,
        side: directions.oppAlongLane
      },
      // End: target element, oppCrossLane side (coming from bottom - reserved column!)
      {
        lane: targetPos.lane,
        layer: targetPos.layer,
        row: targetPos.row,
        side: directions.oppCrossLane
      }
    ];
  }

  // Cross-lane back-flow
  // Determine if source is above or below target
  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);
  
  const sourceAboveTarget = sourceLaneIndex < targetLaneIndex;
  
  // Target receives from above or below depending on source position
  const targetSide = sourceAboveTarget ? directions.crossLane : directions.oppCrossLane;
  
  // Back-flow: oppAlongLane (left) → corner at (target lane, source layer) → target
  return [
    // Start: source element, oppAlongLane side (going backwards/left)
    {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      side: directions.oppAlongLane
    },
    // Corner: target lane, source layer (L-shape corner)
    {
      lane: targetLane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      side: sourceAboveTarget ? directions.crossLane : directions.oppCrossLane
    },
    // End: target element, receives from above or below
    {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      side: targetSide
    }
  ];
}

/**
 * Check if a flow is a back-edge
 * @param {string} flowId - Flow ID
 * @param {Array} backEdges - Array of back-edge flow IDs
 * @returns {boolean}
 */
export function isBackEdge(flowId, backEdges) {
  return backEdges.includes(flowId);
}
