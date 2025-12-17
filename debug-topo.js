import { phase1 } from './src/phase1.js';
import { readFileSync } from 'fs';

const bpmnXml = readFileSync('./test-data/colocation-cmdb-correct.bpmn', 'utf8');
const result = phase1(bpmnXml, {});

console.log('\n=== Topological Order ===');
console.log('gateway_escalation:', result.topoOrder.get('gateway_escalation'));
console.log('task_consult_customer:', result.topoOrder.get('task_consult_customer'));
console.log('start_customer_inquiry:', result.topoOrder.get('start_customer_inquiry'));

console.log('\n=== Back-Flows ===');
console.log(result.backFlows);
