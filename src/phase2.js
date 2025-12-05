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

  return elementLanes;
}

/**
 * Get lane index (position in lane list)
 * @param {string} laneId - Lane ID
 * @param {Map} lanes - Lane map
 * @returns {number} - Lane index (0-based)
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

  return {
    lane,
    layer: sourcePos.layer + 1,
    row: sourcePos.row
  };
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

  return {
    lane,
    layer: sourcePos.layer,  // Same layer (free path)
    row: 0
  };
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

  const crossDirection = getCrossLaneDirection(
    { sourceRef: sourceId, targetRef: targetId },
    elementLanes,
    lanes,
    directions
  );

  const crossSide = crossDirection === 'crossLane' ? directions.crossLane : directions.oppCrossLane;
  const oppCrossSide = crossDirection === 'crossLane' ? directions.oppCrossLane : directions.crossLane;

  // Same layer: straight line (crossLane → oppCrossLane)
  return {
    flowId,
    sourceId,
    targetId,
    isBackFlow: false,
    source: {
      lane: sourcePos.lane,
      layer: sourcePos.layer,
      row: sourcePos.row,
      exitSide: crossSide
    },
    waypoints: [],  // No intermediate waypoints (straight line)
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide: oppCrossSide
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

  return {
    lane,
    layer: sourcePos.layer + 1,  // Layer +1 (blocked path)
    row: 0
  };
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
export function createCrossLaneBlockedFlowInfo(flowId, sourceId, targetId, positions, elementLanes, lanes, directions) {
  const sourcePos = positions.get(sourceId);
  const targetPos = positions.get(targetId);

  const crossDirection = getCrossLaneDirection(
    { sourceRef: sourceId, targetRef: targetId },
    elementLanes,
    lanes,
    directions
  );

  const crossSide = crossDirection === 'crossLane' ? directions.crossLane : directions.oppCrossLane;
  const oppCrossSide = crossDirection === 'crossLane' ? directions.oppCrossLane : directions.crossLane;

  // Different layer: L-shape (alongLane → crossLane → oppCrossLane)
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
    waypoints: [
      // Corner at target lane, source layer
      {
        lane: targetPos.lane,
        layer: sourcePos.layer,
        row: sourcePos.row,
        side: crossSide
      }
    ],
    target: {
      lane: targetPos.lane,
      layer: targetPos.layer,
      row: targetPos.row,
      entrySide: oppCrossSide
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
  const rows = assignSymmetricRows(sortedOutputFlowIds.length);

  const outputPositions = new Map();

  for (let i = 0; i < sortedOutputFlowIds.length; i++) {
    const flowId = sortedOutputFlowIds[i];
    const flow = flows.get(flowId);
    const targetId = flow.targetRef;
    const targetLane = elementLanes.get(targetId);

    outputPositions.set(targetId, {
      lane: targetLane,
      layer: gatewayPos.layer + 1,
      row: rows[i]
    });
  }

  return outputPositions;
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
