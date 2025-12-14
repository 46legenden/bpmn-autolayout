import { parseXML, validateBPMN, preProcess, detectBackEdges } from './src/phase1.js';
import { readFileSync } from 'fs';

const input = readFileSync('test-data/real-world/input-real-world-complex.bpmn', 'utf-8');

// Phase 1
const graph = parseXML(input);
validateBPMN(graph);
const processedGraph = preProcess(graph, {});

const { elements, flows } = processedGraph;

console.log('📊 Testing backflow detection...\n');

// Manual DFS to trace the algorithm
const visited = new Set();
const recursionStack = new Set();
const backEdges = [];
const trace = [];

function dfs(elementId, depth = 0) {
  const indent = '  '.repeat(depth);
  trace.push(`${indent}→ ${elementId}`);
  
  visited.add(elementId);
  recursionStack.add(elementId);

  const element = elements.get(elementId);
  if (!element) {
    trace.push(`${indent}  ❌ Element not found!`);
    return;
  }

  trace.push(`${indent}  outgoing: ${element.outgoing?.join(', ') || 'none'}`);

  for (const flowId of (element.outgoing || [])) {
    const flow = flows.get(flowId);
    if (!flow) continue;

    const targetId = flow.targetRef;
    trace.push(`${indent}  ${flowId}: ${elementId} → ${targetId}`);

    if (!visited.has(targetId)) {
      trace.push(`${indent}    → DFS into ${targetId}`);
      dfs(targetId, depth + 1);
    } else if (recursionStack.has(targetId)) {
      trace.push(`${indent}    🔁 BACK-EDGE detected! ${flowId}`);
      backEdges.push(flowId);
    } else {
      trace.push(`${indent}    ✓ Already visited ${targetId}`);
    }
  }

  recursionStack.delete(elementId);
  trace.push(`${indent}← ${elementId} (removed from stack)`);
}

// Start DFS from all start events
for (const [id, element] of elements) {
  if (element.type === 'startEvent' && !visited.has(id)) {
    console.log(`🎯 Starting DFS from ${id}\n`);
    dfs(id);
  }
}

console.log('\n📋 DFS Trace:');
console.log(trace.join('\n'));

console.log('\n🔁 Back-edges found:', backEdges);

// Compare with library function
const libraryBackEdges = detectBackEdges(processedGraph);
console.log('📚 Library result:', libraryBackEdges);
