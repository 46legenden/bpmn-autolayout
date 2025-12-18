# Message-Flow Fixes - Results

## Problems Identified

### Problem 1: End-Event Positioning
The End-Event in the Supplier pool was incorrectly positioned far to the left because message flows were being included in the outgoing flows map during topological sorting.

**Root Cause:** In `phase2.js`, the outgoing flows map was not filtering out message flows, causing them to affect the topological sort order.

### Problem 2: Cascade Router for Message-Flows
The cascade router (designed for back-flows within a pool) was being incorrectly applied to message flows between pools.

**Root Cause:** In `back-flow-router.js`, the back-flow detection only checked `targetPos.layer < sourcePos.layer`, which also matched message flows that happened to go backwards in layer numbering.

## Fixes Applied

### Fix 1: Skip Message-Flows in Outgoing Flows Map
**File:** `src/phase2.js` (line 1155)

```javascript
// Build outgoing flows map
for (const [flowId, flow] of flows) {
  if (backEdgeSet.has(flowId)) continue; // Skip back-flows
  if (flow.type === 'messageFlow') continue; // Skip message flows ✅ ADDED
  const sourceId = flow.sourceRef;
  if (outgoingFlows.has(sourceId)) {
    outgoingFlows.get(sourceId).push(flowId);
  }
}
```

**Impact:** Message flows no longer affect element positioning in topological sort.

### Fix 2: Restrict Cascade Router to Same-Lane Back-Flows
**File:** `src/back-flow-router.js` (line 52)

```javascript
// Check if this is a true back-flow (same lane AND target layer < source layer)
// Message flows between different pools should NOT use cascade routing
const isBackFlow = sourcePos.lane === targetPos.lane && targetPos.layer < sourcePos.layer; ✅ FIXED
```

**Impact:** Only true back-flows (within same lane) use cascade routing. Message flows use Manhattan routing.

## Test Results

### After Fixes:
- ✅ **No collision warnings** - Clean output
- ✅ **End-Event properly positioned** - At the end of the process flow
- ✅ **Message-Flows use Manhattan routing** - Not cascade routing
- ✅ **Back-Flows use Cascade routing** - Only for same-lane flows
- ✅ **All 6 Message-Flows properly routed** between the two pools

### Visual Inspection:
- ✅ End-Event in Supplier pool is correctly positioned after "Receive Confirmation"
- ✅ Message-Flows (dashed lines) are cleanly routed between pools
- ✅ Back-Flows within pools use clean U-shaped paths (cascade routing)
- ✅ No element intersections
- ✅ No overlapping flows

## Message-Flows in Diagram:
1. Quote Request: Request Quote → Prepare Quote
2. Quote: Send Quote → Review Quote
3. Order: Send Order → Receive Order
4. Shipment Confirmation: Send Confirmation → Receive Invoice
5. Invoice: Send Invoice → Receive Invoice
6. Payment Confirmation: Process Payment → Receive Confirmation

All message flows are properly rendered as dashed lines between the two pools.

## Conclusion

Both issues have been successfully fixed:
1. Message flows no longer affect element positioning
2. Cascade routing is only applied to same-lane back-flows
3. The diagram renders cleanly with all message flows properly routed
