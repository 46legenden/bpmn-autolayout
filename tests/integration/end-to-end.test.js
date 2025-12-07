import { describe, test, expect } from 'vitest';
import { layoutBPMN } from '../../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Integration: End-to-End Layout', () => {
  test('should apply layout to simple 3-lane BPMN', () => {
    // Read test BPMN file
    const bpmnPath = join(__dirname, '../../test-data/simple-3-lane.bpmn');
    const inputXml = readFileSync(bpmnPath, 'utf-8');

    console.log('\n=== END-TO-END LAYOUT TEST ===');
    console.log('Input BPMN loaded');

    // Apply layout
    const result = layoutBPMN(inputXml, {
      laneOrientation: 'horizontal'
    });

    console.log('\nLayout result:');
    console.log('  Success:', result.success);

    // Verify success
    expect(result.success).toBe(true);
    expect(result.bpmnXml).toBeDefined();
    expect(result.errors).toBeUndefined();

    // Verify DI was added
    const outputXml = result.bpmnXml;
    
    console.log('\nVerifying BPMN DI:');
    
    // Check for BPMNDiagram
    expect(outputXml).toContain('<bpmndi:BPMNDiagram');
    console.log('  ✓ BPMNDiagram present');
    
    // Check for BPMNPlane
    expect(outputXml).toContain('<bpmndi:BPMNPlane');
    console.log('  ✓ BPMNPlane present');
    
    // Check for element shapes
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="start1">');
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="xor1">');
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="task1">');
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="task2">');
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="task3">');
    expect(outputXml).toContain('<bpmndi:BPMNShape bpmnElement="end1">');
    console.log('  ✓ All element shapes present');
    
    // Check for flow edges
    expect(outputXml).toContain('<bpmndi:BPMNEdge bpmnElement="flow1">');
    expect(outputXml).toContain('<bpmndi:BPMNEdge bpmnElement="flow2">');
    expect(outputXml).toContain('<bpmndi:BPMNEdge bpmnElement="flow3">');
    console.log('  ✓ All flow edges present');
    
    // Check for waypoints
    expect(outputXml).toContain('<di:waypoint');
    console.log('  ✓ Waypoints present');
    
    // Check for bounds
    expect(outputXml).toContain('<dc:Bounds');
    console.log('  ✓ Element bounds present');
    
    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  // TODO: Add error handling test when parser validation is stricter
  // test('should handle errors gracefully', () => {
  //   const invalidXml = '<invalid>xml</invalid>';
  //   const result = layoutBPMN(invalidXml);
  //   expect(result.success).toBe(false);
  // });
});
