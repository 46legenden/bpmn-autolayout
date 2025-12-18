# Message-Flow Test Results

## Test Setup
Added 6 Message-Flows between Customer Company and Supplier Company pools:
1. Quote Request: Request Quote → Prepare Quote
2. Quote: Send Quote → Review Quote
3. Order: Send Order → Receive Order
4. Shipment Confirmation: Send Confirmation → Receive Invoice
5. Invoice: Send Invoice → Receive Invoice
6. Payment Confirmation: Process Payment → Receive Confirmation

## Routing Results

### Successfully Routed Message-Flows:
- ✅ msg_flow_1 (Quote Request): Properly routed between pools
- ✅ msg_flow_2 (Quote): Properly routed between pools
- ✅ msg_flow_6 (Payment Confirmation): Properly routed between pools

### Message-Flows Using Cascade Router:
- ⚠️ msg_flow_3 (Order): Using fallback (all strategies blocked)
- ✅ msg_flow_4 (Shipment Confirmation): Using Priority 3 - Right-Exit → Bottom-Entry
- ✅ msg_flow_5 (Invoice): Using Priority 2 - Bottom-Exit → Left-Entry

## Issues Detected

### Issue 1: Element Intersection (msg_flow_4)
- **Flow**: Shipment Confirmation (Send Confirmation → Receive Invoice)
- **Problem**: Segment 3 intersects element "Prepare Shipment"
- **Waypoints**: [{x:1280, y:1005}, {x:1280, y:570}]
- **Cause**: Vertical segment passes through element in same column

### Issue 2: Element Intersection (flow_s11)
- **Flow**: Receive Confirmation → End
- **Problem**: Segment 0 intersects element "Send Invoice"
- **Waypoints**: [{x:1730, y:1120}, {x:462, y:1120}]
- **Cause**: Horizontal segment passes through element

### Issue 3: Direction Metadata Errors
- **Flow**: flow_s11
- **Problems**: 
  - Exit side metadata says "right" but waypoint goes wrong direction
  - Entry side metadata says "left" but waypoint comes from wrong direction
- **Impact**: Cosmetic only, doesn't affect visual rendering

## Visual Analysis

The diagram shows:
- Message-Flows are rendered as dashed lines between pools (correct BPMN notation)
- Most Message-Flows route correctly
- Some Message-Flows have element intersections that need fixing
- Back-flows within pools use the new cascade routing (clean U-shapes)

## Root Cause

The cascade router was designed for back-flows within the same pool, but it's also being applied to Message-Flows between pools. Message-Flows should use the Manhattan router, not the cascade router.

The issue is in `back-flow-router.js` - it checks `targetPos.layer < sourcePos.layer` to detect back-flows, but this also catches some Message-Flows that happen to go backwards in layer numbering.

## Recommendation

Need to distinguish between:
1. **Back-flows**: Same pool, target layer < source layer → Use cascade router
2. **Message-Flows**: Different pools → Use Manhattan router (not cascade)

The check should be: `sourcePos.lane === targetPos.lane && targetPos.layer < sourcePos.layer`
