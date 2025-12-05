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
