# Back-Flow Routing Strategy for o1 Review

## Context

We're implementing Phase 3 of a BPMN auto-layout algorithm. We have:
- **Phase 1**: Parsing and validation ✅
- **Phase 2**: Position assignment (lane, layer, row) ✅
- **Phase 3**: Pixel coordinate calculation (in progress)

## Problem

**Back-flows** are flows that go backwards in the process (from higher layer to lower layer).

Example:
```
Task1 (layer 0) → Task2 (layer 1) → Task3 (layer 2)
                                      ↓
                  Task2 ← ← ← ← ← ← ← (back-flow)
```

Back-flows need special routing to avoid collisions with forward flows and elements.

## Current Approach (Wrong)

My current implementation:
1. Exit DOWN from source
2. Go down 2 rows (hardcoded!)
3. Go LEFT to target column
4. Go UP to target
5. Enter from BOTTOM

**Problems:**
- ❌ Hardcoded offset doesn't work for all cases
- ❌ No collision detection
- ❌ Doesn't consider existing entry points

## New Strategy (User's Idea)

### Key Insight

**Back-flows should enter the target element from the SAME side as normal flows!**

**Why?** This creates visual harmony - all flows entering an element come from the same direction.

### Routing in "Between-Worlds"

**Important:** Normal elements are positioned on matrix grid points (row 0, 1, 2, layer 0, 1, 2).

**Back-flows route BETWEEN the grid lines:**
- Between rows: row 0.5, 1.5, 2.5
- Between layers: layer 0.5, 1.5, 2.5

This guarantees no collisions with elements!

### Algorithm

```
Given:
  Source: (lane1, layer2, row0)
  Target: (lane1, layer0, row0)
  Target has normal flow entering from LEFT

Step 1: Determine target's entry side
  → Check existing flows into target
  → entrySide = "left" (from normal flow)

Step 2: Calculate entry point
  → entryPoint = target connection point on LEFT side

Step 3: Route between grid lines
  a) Exit DOWN from source
     → exitPoint = (sourceX + width/2, sourceY + height)
  
  b) Go DOWN to "between-row" zone
     → Move to row 0.5 (between row 0 and row 1)
  
  c) Go LEFT in "between-layer" zone
     → Move to layer -0.5 (before target layer 0)
  
  d) Align vertically with entry point
     → Move UP/DOWN to match entryPoint.y
  
  e) Enter from LEFT (same as normal flow)
     → Final waypoint at entryPoint
```

### Example Path

```
Source: Task3 (layer 2, row 0)
Target: Task2 (layer 0, row 0)
Target entry: LEFT (from normal flow)

Waypoints:
1. (layer 2, row 0) - Exit DOWN from Task3
2. (layer 2, row 0.5) - Between rows
3. (layer -0.5, row 0.5) - Between layers, before target
4. (layer -0.5, row 0) - Align with target row
5. (layer 0, row 0) - Enter LEFT into Task2
```

## Questions for o1

1. **Is this routing strategy sound?** Does it guarantee collision-free paths?

2. **How to handle multiple back-flows to the same target?** Should they:
   - All use the same entry side? ✅
   - Use different "between-row" offsets (0.5, 1.5, 2.5)? 🤔

3. **Edge cases:**
   - What if target has no normal flows (only back-flows)?
   - What if back-flow goes to a different lane?
   - What if source and target are in the same layer?

4. **Implementation details:**
   - How to represent "between-grid" coordinates in pixel space?
   - Should we use fractional layer/row values (0.5, 1.5) or pixel offsets?

5. **Is there a simpler approach** we're missing?

## Current Code Structure

```javascript
// Phase 2 marks back-flows but doesn't route them
createBackFlowInfo(flowId, sourceId, targetId) {
  return {
    isBackFlow: true,
    exitSide: null,    // Will be calculated in Phase 3
    entrySide: null,   // Will be calculated in Phase 3
    waypoints: []      // Will be calculated in Phase 3
  }
}

// Phase 3 should route back-flows
routeBackFlow(flowInfo, coordinates, positions, lanes, directions) {
  // TODO: Implement the strategy described above
}
```

## Request

Please review this strategy and provide:
- ✅ Confirmation it's correct, OR
- ❌ Issues/improvements needed
- 💡 Suggestions for edge cases
- 📝 Pseudocode for the routing algorithm

Thank you!
