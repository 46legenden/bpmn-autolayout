# Cascading Back-Flow Routing - Results

## Implementation Summary

Implemented a **cascading routing strategy** specifically for back-flows (flows where target layer < source layer).

### Key Changes:

1. **New Module**: `backflow-cascade-router.js`
   - Implements 5-priority cascade for back-flow routing
   - Each priority is tested for collisions before moving to next

2. **Modified**: `back-flow-router.js`
   - Detects true back-flows (target layer < source layer)
   - Routes back-flows through cascade router
   - Other flows use standard Manhattan routing

3. **Unchanged**: `manhattan-router.js`
   - Reverted back-flow specific logic
   - Now only handles message-flows and forward flows

## Routing Priority Cascade

### Priority 1: Bottom-Exit → Bottom-Entry ✅
- Exit from bottom of source
- Move down to corridor
- Move left horizontally
- Enter target from bottom
- **Most elegant solution**

### Priority 2: Bottom-Exit → Left-Entry
- Exit from bottom of source
- Move down to corridor
- Move left horizontally
- Approach target from left
- Enter from left side

### Priority 3: Right-Exit → Bottom-Entry
- Exit from right of source
- Move right, then down to corridor
- Move left horizontally
- Enter target from bottom

### Priority 4: Right-Exit → Left-Entry
- Exit from right of source
- Move right, then down to corridor
- Move left horizontally
- Enter target from left

### Priority 5: Fallback
- Use shortest available path
- Last resort when all other options blocked

## Test Results

### Diagram: message-flow-advanced.bpmn

**Pool 1 (Sales Department):**
- `flow_c7`: "Negotiate Terms" → "Request Quote"
  - ✅ Using: **Priority 1 - Bottom-Exit → Bottom-Entry**
  - Visual: Clean U-shaped flow going down, left, then up into bottom of target

**Pool 2 (Supplier):**
- `flow_s7`: "In Stock?" (No) → "Prepare Quote"
  - ✅ Using: **Priority 1 - Bottom-Exit → Bottom-Entry**
  - Visual: Clean U-shaped flow going down, left, then up into bottom of target

## Visual Improvement

**Before (old logic):**
- Flows went up first, then left, creating a "floating" appearance
- Looked like flows were hovering over intermediate elements

**After (cascade logic):**
- Flows go down first, then left, then up
- Creates clean U-shaped paths
- Much more elegant and natural flow appearance
- No "floating" effect

## Collision Detection

- ✅ All strategies tested for waypoint collisions
- ✅ First collision-free strategy is used
- ✅ Fallback ensures flow is always routed even if all priorities blocked
- ✅ No collision warnings in output

## Conclusion

The cascading routing strategy successfully creates more elegant back-flows while maintaining collision-free routing. The Priority 1 strategy (Bottom-Exit → Bottom-Entry) was successfully used for both back-flows in the test diagram, creating clean U-shaped paths.
