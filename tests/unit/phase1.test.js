import { describe, test, expect } from 'vitest';
import { parseXML, validateBPMN, preProcess, detectBackEdges, phase1 } from '../../src/phase1.js';

describe('Phase 1: XML Parsing', () => {
  test('should parse valid BPMN XML with start event, task, and end event', () => {
    const xml = `
      <bpmn:definitions>
        <bpmn:process>
          <bpmn:startEvent id="start1" name="Start" />
          <bpmn:task id="task1" name="Do Something" />
          <bpmn:endEvent id="end1" name="End" />
          <bpmn:sequenceFlow id="flow1" sourceRef="start1" targetRef="task1" />
          <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end1" />
        </bpmn:process>
      </bpmn:definitions>
    `;

    const result = parseXML(xml);

    expect(result.success).toBe(true);
    expect(result.elements.size).toBe(3);
    expect(result.flows.size).toBe(2);
    expect(result.elements.get('start1').type).toBe('startEvent');
    expect(result.elements.get('task1').type).toBe('task');
    expect(result.elements.get('end1').type).toBe('endEvent');
  });

  test('should extract element names correctly', () => {
    const xml = `
      <bpmn:task id="task1" name="My Task" />
    `;

    const result = parseXML(xml);

    expect(result.elements.get('task1').name).toBe('My Task');
  });

  test('should parse different task types', () => {
    const xml = `
      <bpmn:task id="task1" />
      <bpmn:userTask id="task2" />
      <bpmn:serviceTask id="task3" />
    `;

    const result = parseXML(xml);

    expect(result.elements.get('task1').type).toBe('task');
    expect(result.elements.get('task2').type).toBe('userTask');
    expect(result.elements.get('task3').type).toBe('serviceTask');
  });

  test('should parse different gateway types', () => {
    const xml = `
      <bpmn:exclusiveGateway id="gw1" />
      <bpmn:parallelGateway id="gw2" />
      <bpmn:inclusiveGateway id="gw3" />
    `;

    const result = parseXML(xml);

    expect(result.elements.get('gw1').type).toBe('exclusiveGateway');
    expect(result.elements.get('gw2').type).toBe('parallelGateway');
    expect(result.elements.get('gw3').type).toBe('inclusiveGateway');
  });

  test('should track incoming and outgoing flows for elements', () => {
    const xml = `
      <bpmn:task id="task1" />
      <bpmn:task id="task2" />
      <bpmn:sequenceFlow id="flow1" sourceRef="task1" targetRef="task2" />
    `;

    const result = parseXML(xml);

    expect(result.elements.get('task1').outgoing).toContain('flow1');
    expect(result.elements.get('task2').incoming).toContain('flow1');
  });

  test('should detect incorrect element type casing', () => {
    const xml = `
      <bpmn:Task id="task1" />
      <bpmn:StartEvent id="start1" />
    `;

    const result = parseXML(xml);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Task');
    expect(result.errors[0]).toContain('task');
  });

  test('should parse lanes and their elements', () => {
    const xml = `
      <bpmn:lane id="lane1" name="Lane 1">
        <bpmn:flowNodeRef>task1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>task2</bpmn:flowNodeRef>
      </bpmn:lane>
    `;

    const result = parseXML(xml);

    expect(result.lanes.size).toBe(1);
    expect(result.lanes.get('lane1').name).toBe('Lane 1');
    expect(result.lanes.get('lane1').elements).toContain('task1');
    expect(result.lanes.get('lane1').elements).toContain('task2');
  });
});

describe('Phase 1: Validation', () => {
  test('should detect flows with invalid source references', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'invalid-id' }]
      ])
    };

    const result = validateBPMN(graph);

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('invalid targetRef');
    expect(result.errors[0]).toContain('invalid-id');
  });

  test('should detect flows with invalid target references', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: ['flow1'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'invalid-id', targetRef: 'task1' }]
      ])
    };

    const result = validateBPMN(graph);

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('invalid sourceRef');
  });

  test('should require at least one start event', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: [] }],
        ['end1', { id: 'end1', type: 'endEvent', incoming: [], outgoing: [] }]
      ]),
      flows: new Map()
    };

    const result = validateBPMN(graph);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('start event'))).toBe(true);
  });

  test('should require at least one end event', () => {
    const graph = {
      elements: new Map([
        ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: [] }],
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: [] }]
      ]),
      flows: new Map()
    };

    const result = validateBPMN(graph);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('end event'))).toBe(true);
  });

  test('should pass validation for valid graph', () => {
    const graph = {
      elements: new Map([
        ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: ['flow1'] }],
        ['task1', { id: 'task1', type: 'task', incoming: ['flow1'], outgoing: ['flow2'] }],
        ['end1', { id: 'end1', type: 'endEvent', incoming: ['flow2'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'task1' }],
        ['flow2', { id: 'flow2', sourceRef: 'task1', targetRef: 'end1' }]
      ])
    };

    const result = validateBPMN(graph);

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe('Phase 1: Pre-processing (XOR Merge Gateway Removal)', () => {
  test('should remove XOR merge gateways when xorMergeGateways = false', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
        ['task2', { id: 'task2', type: 'task', incoming: [], outgoing: ['flow2'] }],
        ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1', 'flow2'], outgoing: ['flow3'] }],
        ['task3', { id: 'task3', type: 'task', incoming: ['flow3'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }],
        ['flow2', { id: 'flow2', sourceRef: 'task2', targetRef: 'xor1' }],
        ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task3' }]
      ]),
      lanes: new Map()
    };

    const result = preProcess(graph, { xorMergeGateways: false });

    expect(result.elements.has('xor1')).toBe(false);
    expect(result.flows.has('flow3')).toBe(false);
    expect(result.flows.get('flow1').targetRef).toBe('task3');
    expect(result.flows.get('flow2').targetRef).toBe('task3');
  });

  test('should keep XOR merge gateways when xorMergeGateways = true', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
        ['task2', { id: 'task2', type: 'task', incoming: [], outgoing: ['flow2'] }],
        ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1', 'flow2'], outgoing: ['flow3'] }],
        ['task3', { id: 'task3', type: 'task', incoming: ['flow3'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }],
        ['flow2', { id: 'flow2', sourceRef: 'task2', targetRef: 'xor1' }],
        ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task3' }]
      ]),
      lanes: new Map()
    };

    const result = preProcess(graph, { xorMergeGateways: true });

    expect(result.elements.has('xor1')).toBe(true);
    expect(result.flows.has('flow3')).toBe(true);
  });

  test('should NOT remove XOR split gateways (one incoming, multiple outgoing)', () => {
    const graph = {
      elements: new Map([
        ['task1', { id: 'task1', type: 'task', incoming: [], outgoing: ['flow1'] }],
        ['xor1', { id: 'xor1', type: 'exclusiveGateway', incoming: ['flow1'], outgoing: ['flow2', 'flow3'] }],
        ['task2', { id: 'task2', type: 'task', incoming: ['flow2'], outgoing: [] }],
        ['task3', { id: 'task3', type: 'task', incoming: ['flow3'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'task1', targetRef: 'xor1' }],
        ['flow2', { id: 'flow2', sourceRef: 'xor1', targetRef: 'task2' }],
        ['flow3', { id: 'flow3', sourceRef: 'xor1', targetRef: 'task3' }]
      ]),
      lanes: new Map()
    };

    const result = preProcess(graph, { xorMergeGateways: false });

    expect(result.elements.has('xor1')).toBe(true);
  });
});

describe('Phase 1: Back-edge Detection', () => {
  test('should detect back-edges (loops)', () => {
    const graph = {
      elements: new Map([
        ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: ['flow1'] }],
        ['task1', { id: 'task1', type: 'task', incoming: ['flow1', 'flow3'], outgoing: ['flow2'] }],
        ['task2', { id: 'task2', type: 'task', incoming: ['flow2'], outgoing: ['flow3'] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'task1' }],
        ['flow2', { id: 'flow2', sourceRef: 'task1', targetRef: 'task2' }],
        ['flow3', { id: 'flow3', sourceRef: 'task2', targetRef: 'task1' }]  // Back-edge
      ])
    };

    const backEdges = detectBackEdges(graph);

    expect(backEdges).toContain('flow3');
  });

  test('should return empty array for graphs without loops', () => {
    const graph = {
      elements: new Map([
        ['start1', { id: 'start1', type: 'startEvent', incoming: [], outgoing: ['flow1'] }],
        ['task1', { id: 'task1', type: 'task', incoming: ['flow1'], outgoing: ['flow2'] }],
        ['end1', { id: 'end1', type: 'endEvent', incoming: ['flow2'], outgoing: [] }]
      ]),
      flows: new Map([
        ['flow1', { id: 'flow1', sourceRef: 'start1', targetRef: 'task1' }],
        ['flow2', { id: 'flow2', sourceRef: 'task1', targetRef: 'end1' }]
      ])
    };

    const backEdges = detectBackEdges(graph);

    expect(backEdges.length).toBe(0);
  });
});

describe('Phase 1: Integration', () => {
  test('should execute full Phase 1 pipeline successfully', () => {
    const xml = `
      <bpmn:definitions>
        <bpmn:process>
          <bpmn:startEvent id="start1" name="Start" />
          <bpmn:task id="task1" name="Task 1" />
          <bpmn:endEvent id="end1" name="End" />
          <bpmn:sequenceFlow id="flow1" sourceRef="start1" targetRef="task1" />
          <bpmn:sequenceFlow id="flow2" sourceRef="task1" targetRef="end1" />
        </bpmn:process>
      </bpmn:definitions>
    `;

    const result = phase1(xml, { xorMergeGateways: false });

    expect(result.success).toBe(true);
    expect(result.graph).toBeDefined();
    expect(result.backEdges).toBeDefined();
    expect(result.errors.length).toBe(0);
  });

  test('should fail Phase 1 for invalid XML', () => {
    const xml = `
      <bpmn:definitions>
        <bpmn:process>
          <bpmn:task id="task1" />
          <bpmn:sequenceFlow id="flow1" sourceRef="task1" targetRef="invalid-id" />
        </bpmn:process>
      </bpmn:definitions>
    `;

    const result = phase1(xml);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
