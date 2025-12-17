# Flow Merge Algorithm for Hidden XOR Merge Gateways

## Problem

When hiding XOR merge gateways, we have:
- Multiple flows TO the gateway (e.g., flow11, flow15, flow18 → gateway3_merge)
- One flow FROM the gateway (e.g., flow11a: gateway3_merge → gateway3_split)

These flows reference a gateway that doesn't exist in the visualization!

## Solution

### Step 1: Identify Hidden Merge Gateways
- Type = exclusiveGateway
- Exactly 1 outgoing flow
- More than 1 incoming flow

### Step 2: For Each Hidden Merge Gateway

**Find:**
- Incoming flows: flows where targetRef = gateway_id
- Outgoing flow: flow where sourceRef = gateway_id (should be exactly 1)

**Merge:**
For each incoming flow:
1. Update targetRef: gateway_id → outgoing_flow.targetRef
2. Merge waypoints:
   - Take incoming flow waypoints (except last = gateway entry)
   - Add gateway center as waypoint
   - Add outgoing flow waypoints (except first = gateway exit)
3. Delete outgoing flow (only keep merged flows)

### Step 3: Example

**Before:**
```
flow11: task7 → gateway3_merge
  waypoints: [task7_exit, wp1, gateway_entry]

flow11a: gateway3_merge → gateway3_split
  waypoints: [gateway_exit, gateway3_split_entry]
```

**After:**
```
flow11: task7 → gateway3_split (MODIFIED)
  waypoints: [task7_exit, wp1, GATEWAY_CENTER, gateway3_split_entry]

flow11a: DELETED
```

### Step 4: Implementation Location

This should happen in **Phase 3** BEFORE generating BPMN DI:
1. Detect hidden merge gateways
2. Merge flows and waypoints
3. Update flow map
4. Generate DI with merged flows
