# BPMN Auto-Layout - Work Summary (Session 2)

## Date
December 17, 2025

## Major Achievements

### 1. ✅ Column Alignment Fix
**Problem:** Lanes with different sub-lane nesting levels started their columns at different X positions, causing misaligned columns and diagonal flows.

**Solution:**
- Calculate maximum nesting level across all lanes
- All lanes start their Layer 0 at the same global X position
- Lanes without sub-lanes get more space for labels, but columns stay aligned

**Files Changed:**
- `src/phase3.js` - calculateLaneBounds function

### 2. ✅ Column Alignment Validation
**Feature:** Automatic detection of column misalignment issues

**Implementation:**
- New module: `src/column-alignment-checker.js`
- Validates that all elements in the same layer have the same X position
- Reports misalignments with details (lanes, elements, offset)

### 3. ✅ Row Assignment System
**Problem:** Elements in the same lane and layer were colliding (same position)

**Solution:**
- New module: `src/row-assigner.js`
- Assigns different rows to parallel elements (not sequentially connected)
- Prevents element collisions in same lane/layer

### 4. ✅ Comprehensive Collision Detection
**Features:**
- **Element Collisions**: Two elements at same position
- **Flow Collisions**: 
  - Waypoint direction errors (exit/entry side mismatch)
  - Element intersections (flow goes through element)
  - Waypoint inconsistencies

**Files:**
- `src/collision-checker.js` - Element collision detection
- `src/flow-collision-detector.js` - Flow collision detection

### 5. ✅ Message Flow Improvements
**Changes:**
- Message flows now use **direct lines** (no waypoints) - cleaner for dashed flows
- Message flow labels positioned at flow start (right of source, above arrow)
- Message flows excluded from layer adjustment logic (they go between pools, no horizontal progression)

### 6. ✅ Cross-Lane Flow Fix
**Problem:** Cross-lane flows within same pool were going to next layer unnecessarily

**Solution:**
- Modified propagateLayerChanges to allow same layer for cross-lane flows
- Same-lane flows: require layer + 1
- Cross-lane flows: can stay in same layer (direct vertical)

### 7. ❌ Gateway Lane Optimization (REVERTED)
**Initial Approach:** Automatically optimize gateway lane placement based on output directions

**Decision:** **Gateways must be manually assigned to lanes in BPMN**
- Gateway placement is a **modeling decision** (which role makes the decision?)
- Not an optimization problem
- Removed all automatic gateway lane positioning logic

**Rationale:**
- Gateways represent decision points
- Decision points belong to specific roles/lanes
- Automatic optimization would violate BPMN semantics

## Test Results
✅ All 31 tests passing (8 test files)

## Known Issues

### 1. Multi-Input Layer Calculation
**Problem:** Elements with multiple inputs are not optimally positioned

**Current Logic:**
```javascript
requiredLayer = inputLayers.length > 1 ? maxInputLayer + 1 : maxInputLayer
```

**Correct Logic Should Be:**
For each input:
- Same-lane input: requiredLayer = inputLayer + 1 (must be to the right)
- Cross-lane input: requiredLayer = inputLayer (can go directly down/up)

Final: requiredLayer = max(all requiredLayers)

**Impact:**
- "Review by Management" positioned too far left
- "Incident Closed" positioned too far right

### 2. Flow Intersections
**Issue:** Cross-lane flows can intersect elements in other rows

**Cause:** Flows go vertically between lanes and may pass through elements in intermediate rows

**Solution Needed:** Horizontal offset for cross-lane flows based on row positions

## Future Refactoring Idea

### Unified Positioning Rule
**Concept:** Use same positioning logic for ALL elements (tasks, gateways, events)

**Rule:**
1. For each input, calculate minimum layer:
   - Same-lane: minLayer = input.layer + 1
   - Cross-lane: minLayer = input.layer
2. For outputs, check constraints:
   - Multiple outputs going down: need extra space for waypoints
3. Final layer = max(all minLayers)
4. If collision: shift right until free

**Benefits:**
- Simpler code
- More consistent behavior
- Easier to understand and maintain

**Status:** Planned for future session (requires major refactoring)

## Files Modified
- `src/phase2.js` - Row assignment, cross-lane flow logic, gateway lane logic removed
- `src/phase3.js` - Column alignment, message flow waypoints
- `src/collision-checker.js` - NEW
- `src/flow-collision-detector.js` - NEW
- `src/row-assigner.js` - NEW
- `src/column-alignment-checker.js` - NEW
- `test-data/incident-management-complex.bpmn` - NEW (complex test case)
- `test-incident-management.js` - NEW

## Next Steps
1. ✅ Push current changes
2. Document multi-input layer calculation fix
3. Plan unified positioning rule refactoring
4. Update snapshots after fixes
5. Implement flow intersection avoidance

## Notes
- Gateway lane assignment is now **manual only** - this is correct BPMN semantics
- Column alignment is now perfect - all columns synchronized
- Collision detection is comprehensive - catches most issues
- Message flows are clean and simple (direct lines)
