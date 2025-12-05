# BPMN Auto-Layout: Implementation Plan

**Version:** 1.0
**Date:** 2025-12-05

## Overview

This document outlines the step-by-step implementation plan for the BPMN auto-layout algorithm. The implementation follows a **phase-by-phase approach** with comprehensive unit testing at each stage.

## Implementation Phases

### Phase 1: Initialization, Parsing, Validation & Pre-processing

**Goal:** Parse BPMN XML, validate structure, detect back-edges, and optionally remove XOR merge gateways.

**Components:**
1. **XML Parser** - Extract elements and flows from BPMN XML
2. **Validator** - Check for invalid references, missing IDs, incorrect element types (case-sensitive!)
3. **Pre-processor** - Remove XOR merge gateways based on configuration
4. **Back-edge Detector** - Identify loops in the process flow

**Unit Tests:**
- Parse valid BPMN XML correctly
- Detect invalid flow references
- Detect incorrect element type casing (e.g., `Task` vs `task`)
- Remove XOR merge gateways when `config.xorMergeGateways = false`
- Keep XOR merge gateways when `config.xorMergeGateways = true`
- Detect back-edges (loops) correctly

**Deliverable:** `src/phase1.js` + `tests/unit/phase1.test.js`

---

### Phase 2: Position Assignment & Collision Prevention

**Goal:** Assign logical positions (layer, row) to all elements using proactive collision prevention through corridor reservation.

**Components:**
1. **Layer Assignment** - Determine alongLane position for each element
2. **Row Assignment** - Determine crossLane position for each element
3. **Gateway Output Sorting** - Sort gateway outputs by target lane position
4. **Waypoint Calculator** - Calculate logical waypoints for flows
5. **Corridor Reservation** - Reserve space for flows to prevent collisions

**Key Rules:**
- Same lane → layer + 1
- Cross-lane (free) → same layer
- Cross-lane (occupied) → layer + 1
- Back-flow → reserve column, layer + 2
- Gateway outputs sorted by crossLane direction

**Unit Tests:**
- Same lane flow increments layer
- Cross-lane flow (free) keeps same layer
- Cross-lane flow (occupied) increments layer
- Back-flow reserves column correctly
- Gateway outputs sorted correctly (horizontal and vertical)
- Waypoints calculated with correct abstract directions

**Deliverable:** `src/phase2.js` + `tests/unit/phase2.test.js`

---

### Phase 3: Coordinate Calculation

**Goal:** Convert logical positions (layer, row) to pixel coordinates (x, y) based on lane orientation.

**Components:**
1. **Abstract to Concrete Mapping** - Map abstract directions to concrete coordinates
2. **Coordinate Calculator** - Calculate pixel positions for elements
3. **Waypoint Converter** - Convert logical waypoints to pixel coordinates

**Key Rules:**
- **Horizontal:** x = layer × spacing, y = row × spacing
- **Vertical:** y = layer × spacing, x = row × spacing

**Unit Tests:**
- Horizontal orientation calculates x from layer
- Vertical orientation calculates y from layer
- Waypoints converted correctly for both orientations

**Deliverable:** `src/phase3.js` + `tests/unit/phase3.test.js`

---

### Phase 4: Integration & Main Function

**Goal:** Integrate all phases into the main `layoutBPMN()` function.

**Components:**
1. **Main Function** - `layoutBPMN(bpmnXml, config)`
2. **XML Generator** - Convert positioned elements back to BPMN XML with DI information

**Integration Tests:**
- Full layout for ITIL diagram (horizontal)
- Full layout for ITIL diagram (vertical)
- Layout is collision-free
- Layout with loops works correctly
- Snapshot tests for regression prevention

**Deliverable:** `src/index.js` + `tests/integration/layout.test.js`

---

### Phase 5: Visual Verification Tool

**Goal:** Create a simple HTML viewer for visual inspection of generated layouts.

**Components:**
1. **HTML Generator** - Create standalone HTML file with BPMN.js viewer
2. **Test Helper** - Generate viewer for any BPMN XML

**Usage:**
```javascript
renderBPMN(outputXml, 'output.html');
// Open output.html in browser to inspect layout
```

**Deliverable:** `src/viewer.js`

---

## Testing Workflow

1. **Implement Phase** - Write code for one phase
2. **Write Unit Tests** - Test each function in isolation
3. **Run Tests** - `npm test` → See results (✓ or ✗)
4. **Fix Issues** - If tests fail, debug and fix
5. **Commit** - `git commit -m "Phase X: Implementation + Tests"`
6. **Repeat** - Move to next phase

After all phases are complete:

7. **Visual Verification** - Use BPMN viewer to inspect ITIL diagram
8. **Create Snapshot** - Save expected output for regression testing
9. **Automate** - All future changes automatically tested against snapshot

---

## Configuration

The algorithm supports the following configuration options:

```javascript
const config = {
  laneOrientation: 'horizontal',  // 'horizontal' | 'vertical'
  xorMergeGateways: false,        // true | false
};
```

**Defaults:**
- `laneOrientation`: `'horizontal'`
- `xorMergeGateways`: `false`

---

## Success Criteria

- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ ITIL diagram renders collision-free (horizontal)
- ✅ ITIL diagram renders collision-free (vertical)
- ✅ Snapshot tests prevent regressions
- ✅ Code is well-documented
- ✅ README provides clear usage instructions

---

## Timeline

**Estimated effort per phase:**
- Phase 1: ~2-3 hours (parsing + validation is critical)
- Phase 2: ~4-5 hours (most complex, collision prevention)
- Phase 3: ~1-2 hours (straightforward coordinate conversion)
- Phase 4: ~2-3 hours (integration + tests)
- Phase 5: ~1 hour (simple HTML generation)

**Total:** ~10-14 hours of focused development time

---

## Next Steps

1. ✅ Repository setup
2. ✅ Documentation in place
3. → **Start Phase 1 implementation**
