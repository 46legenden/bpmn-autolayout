/**
 * Phase 1: Initialization, Parsing, Validation & Pre-processing
 * 
 * This phase handles:
 * - Parsing BPMN XML into a graph structure
 * - Validating the structure (invalid references, case-sensitivity)
 * - Pre-processing (removing XOR merge gateways if configured)
 * - Detecting back-edges (loops)
 */

/**
 * Parse BPMN XML and extract elements and flows
 * @param {string} bpmnXml - BPMN XML string
 * @returns {Object} - { elements: Map, flows: Map, lanes: Map, success: boolean, errors: Array }
 */
export function parseXML(bpmnXml) {
  const errors = [];
  const elements = new Map();
  const flows = new Map();
  const lanes = new Map();

  try {
    // Basic XML syntax validation
    // Check for malformed comments (e.g., "<- comment" instead of "<!-- comment")
    // Look for "<-" followed by space or letter (not "--" which would be valid)
    const hasMalformedComment = /<-\s/.test(bpmnXml) || /<-[A-Za-z]/.test(bpmnXml);
    if (hasMalformedComment) {
      errors.push('Invalid XML: Malformed comment syntax detected (use <!-- --> for comments)');
      return { elements, flows, lanes, success: false, errors };
    }
    
    // Check for basic BPMN structure (only if it looks like a complete document)
    // Allow XML fragments for testing
    const looksLikeCompleteDoc = bpmnXml.includes('<?xml') || bpmnXml.trim().startsWith('<bpmn:definitions');
    if (looksLikeCompleteDoc && !bpmnXml.includes('<bpmn:definitions') && !bpmnXml.includes('<definitions')) {
      errors.push('Invalid BPMN: Missing <bpmn:definitions> or <definitions> root element');
      return { elements, flows, lanes, success: false, errors };
    }
    
    // Valid BPMN element types (case-sensitive!)
    const validTypes = [
      'startEvent', 'endEvent', 'task', 'userTask', 'serviceTask',
      'exclusiveGateway', 'parallelGateway', 'inclusiveGateway',
      'sequenceFlow', 'lane'
    ];

    // Simple regex-based parsing (for now)
    // In production, use a proper XML parser like DOMParser or xml2js
    
    // Extract start events
    const startEventRegex = /<bpmn:startEvent[^>]*id="([^"]+)"[^>]*>/g;
    let match;
    while ((match = startEventRegex.exec(bpmnXml)) !== null) {
      const id = match[1];
      elements.set(id, {
        id,
        type: 'startEvent',
        name: extractName(bpmnXml, id),
        incoming: [],
        outgoing: []
      });
    }

    // Extract end events
    const endEventRegex = /<bpmn:endEvent[^>]*id="([^"]+)"[^>]*>/g;
    while ((match = endEventRegex.exec(bpmnXml)) !== null) {
      const id = match[1];
      elements.set(id, {
        id,
        type: 'endEvent',
        name: extractName(bpmnXml, id),
        incoming: [],
        outgoing: []
      });
    }

    // Extract intermediate events
    const intermediateEventTypes = ['intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent'];
    for (const eventType of intermediateEventTypes) {
      const eventRegex = new RegExp(`<bpmn:${eventType}[^>]*id="([^"]+)"[^>]*>`, 'g');
      while ((match = eventRegex.exec(bpmnXml)) !== null) {
        const id = match[1];
        elements.set(id, {
          id,
          type: eventType,
          name: extractName(bpmnXml, id),
          incoming: [],
          outgoing: []
        });
      }
    }

    // Extract tasks (all BPMN task types)
    const taskTypes = ['task', 'userTask', 'serviceTask', 'manualTask', 'sendTask', 'receiveTask', 'scriptTask', 'businessRuleTask', 'callActivity'];
    for (const taskType of taskTypes) {
      const taskRegex = new RegExp(`<bpmn:${taskType}[^>]*id="([^"]+)"[^>]*>`, 'g');
      while ((match = taskRegex.exec(bpmnXml)) !== null) {
        const id = match[1];
        elements.set(id, {
          id,
          type: taskType,
          name: extractName(bpmnXml, id),
          incoming: [],
          outgoing: []
        });
      }
    }

    // Extract gateways
    const gatewayTypes = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway'];
    for (const gwType of gatewayTypes) {
      const gwRegex = new RegExp(`<bpmn:${gwType}[^>]*id="([^"]+)"[^>]*>`, 'g');
      while ((match = gwRegex.exec(bpmnXml)) !== null) {
        const id = match[1];
        elements.set(id, {
          id,
          type: gwType,
          name: extractName(bpmnXml, id),
          incoming: [],
          outgoing: []
        });
      }
    }

    // Extract sequence flows
    const flowRegex = /<bpmn:sequenceFlow[^>]*id="([^"]+)"[^>]*sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"[^>]*>/g;
    while ((match = flowRegex.exec(bpmnXml)) !== null) {
      const [, id, sourceRef, targetRef] = match;
      flows.set(id, {
        id,
        sourceRef,
        targetRef,
        name: extractName(bpmnXml, id)
      });

      // Update element incoming/outgoing
      if (elements.has(sourceRef)) {
        elements.get(sourceRef).outgoing.push(id);
      }
      if (elements.has(targetRef)) {
        elements.get(targetRef).incoming.push(id);
      }
    }

    // Extract lanes
    const laneRegex = /<bpmn:lane[^>]*id="([^"]+)"[^>]*>/g;
    while ((match = laneRegex.exec(bpmnXml)) !== null) {
      const id = match[1];
      lanes.set(id, {
        id,
        name: extractName(bpmnXml, id),
        elements: extractLaneElements(bpmnXml, id)
      });
    }

    // Check for invalid element types (case-sensitivity)
    const invalidTypeRegex = /<bpmn:([A-Z][a-zA-Z]+)[^>]*id="([^"]+)"[^>]*>/g;
    while ((match = invalidTypeRegex.exec(bpmnXml)) !== null) {
      const [, type, id] = match;
      if (!validTypes.includes(type)) {
        errors.push(`Unknown element type '${type}' with id '${id}'. Did you mean '${type.toLowerCase()}'?`);
      }
    }

    return {
      elements,
      flows,
      lanes,
      success: errors.length === 0,
      errors
    };

  } catch (error) {
    errors.push(`XML parsing failed: ${error.message}`);
    return { elements, flows, lanes, success: false, errors };
  }
}

/**
 * Extract name attribute from XML for a given element ID
 */
function extractName(xml, id) {
  const nameRegex = new RegExp(`id="${id}"[^>]*name="([^"]+)"`, 'i');
  const match = nameRegex.exec(xml);
  return match ? match[1] : '';
}

/**
 * Extract flowNodeRef elements for a lane
 */
function extractLaneElements(xml, laneId) {
  const elements = [];
  const laneSection = xml.match(new RegExp(`<bpmn:lane[^>]*id="${laneId}"[^>]*>([\\s\\S]*?)</bpmn:lane>`));
  if (laneSection) {
    const flowNodeRegex = /<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g;
    let match;
    while ((match = flowNodeRegex.exec(laneSection[1])) !== null) {
      elements.push(match[1]);
    }
  }
  return elements;
}

/**
 * Validate BPMN structure
 * @param {Object} graph - { elements: Map, flows: Map }
 * @returns {Object} - { isValid: boolean, errors: Array }
 */
export function validateBPMN(graph) {
  const errors = [];
  const { elements, flows } = graph;

  // Check for flows with invalid source or target
  for (const [flowId, flow] of flows) {
    if (!elements.has(flow.sourceRef)) {
      errors.push(`Flow '${flowId}' has an invalid sourceRef '${flow.sourceRef}'`);
    }
    if (!elements.has(flow.targetRef)) {
      errors.push(`Flow '${flowId}' has an invalid targetRef '${flow.targetRef}'`);
    }
  }

  // Check for elements without IDs
  for (const [id, element] of elements) {
    if (!id || id.trim() === '') {
      errors.push(`Element has an empty or missing ID`);
    }
  }

  // Check for start events
  const startEvents = Array.from(elements.values()).filter(e => e.type === 'startEvent');
  if (startEvents.length === 0) {
    errors.push('No start event found in the diagram');
  }

  // Check for end events
  const endEvents = Array.from(elements.values()).filter(e => e.type === 'endEvent');
  if (endEvents.length === 0) {
    errors.push('No end event found in the diagram');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Pre-process: Remove XOR merge gateways if configured
 * @param {Object} graph - { elements: Map, flows: Map }
 * @param {Object} config - { xorMergeGateways: boolean }
 * @returns {Object} - Modified graph
 */
export function preProcess(graph, config = {}) {
  const { elements, flows } = graph;

  // If xorMergeGateways is true, keep them
  if (config.xorMergeGateways === true) {
    return graph;
  }

  // Find XOR merge gateways (exclusiveGateway with multiple incoming, one outgoing)
  const xorMergeGateways = Array.from(elements.values()).filter(element => {
    return element.type === 'exclusiveGateway' &&
           element.incoming.length > 1 &&
           element.outgoing.length === 1;
  });

  // Remove XOR merge gateways and reconnect flows
  for (const gateway of xorMergeGateways) {
    const incomingFlows = gateway.incoming.map(id => flows.get(id));
    const outgoingFlow = flows.get(gateway.outgoing[0]);

    if (!outgoingFlow) continue;

    // Reconnect each incoming flow directly to the target of the outgoing flow
    for (const inFlow of incomingFlows) {
      if (!inFlow) continue;
      inFlow.targetRef = outgoingFlow.targetRef;

      // Update target element's incoming
      const targetElement = elements.get(outgoingFlow.targetRef);
      if (targetElement) {
        targetElement.incoming = targetElement.incoming.filter(id => id !== outgoingFlow.id);
        if (!targetElement.incoming.includes(inFlow.id)) {
          targetElement.incoming.push(inFlow.id);
        }
      }
    }

    // Remove the gateway and its outgoing flow
    elements.delete(gateway.id);
    flows.delete(gateway.outgoing[0]);
  }

  return { elements, flows, lanes: graph.lanes };
}

/**
 * Detect back-edges (loops) in the graph
 * @param {Object} graph - { elements: Map, flows: Map }
 * @returns {Array} - Array of flow IDs that are back-edges
 */
export function detectBackEdges(graph) {
  const { elements, flows } = graph;
  const backEdges = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(elementId) {
    visited.add(elementId);
    recursionStack.add(elementId);

    const element = elements.get(elementId);
    if (!element) return;

    for (const flowId of element.outgoing) {
      const flow = flows.get(flowId);
      if (!flow) continue;

      const targetId = flow.targetRef;

      if (!visited.has(targetId)) {
        dfs(targetId);
      } else if (recursionStack.has(targetId)) {
        // Back-edge detected
        backEdges.push(flowId);
      }
    }

    recursionStack.delete(elementId);
  }

  // Start DFS from all start events
  for (const [id, element] of elements) {
    if (element.type === 'startEvent' && !visited.has(id)) {
      dfs(id);
    }
  }

  return backEdges;
}

/**
 * Main Phase 1 function
 * @param {string} bpmnXml - BPMN XML string
 * @param {Object} config - Configuration options
 * @returns {Object} - { graph, backEdges, success, errors }
 */
export function phase1(bpmnXml, config = {}) {
  // 1. Parse XML
  const parseResult = parseXML(bpmnXml);
  if (!parseResult.success) {
    return { success: false, errors: parseResult.errors };
  }

  // 2. Validate
  const validationResult = validateBPMN(parseResult);
  if (!validationResult.isValid) {
    return { success: false, errors: validationResult.errors };
  }

  // 3. Pre-process (remove XOR merge gateways if configured)
  const graph = preProcess(parseResult, config);

  // 4. Detect back-edges
  const backEdges = detectBackEdges(graph);

  return {
    graph,
    backEdges,
    success: true,
    errors: []
  };
}
