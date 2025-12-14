# Code Analysis: Potential Issues & Missing Test Coverage

## Current Test Coverage

### What We Test:
1. **simple-3-lane**: 3 lanes, 3 tasks, 1 XOR gateway, 7 flows
2. **4outputs**: 2 lanes, 5 tasks, 1 XOR gateway, 10 flows  
3. **order-processing**: 3 lanes, 4 tasks, 2 XOR gateways, 9 flows, **backflow**
4. **mixed-gateway-outputs**: 3 lanes, 6 tasks, 1 XOR gateway, 12 flows, **5 gateway outputs**, **3 end events**
5. **employee-onboarding**: 4 lanes, 10 tasks, 3 XOR gateways, 16 flows (not tested yet)

### What We DON'T Test:
- ❌ **Parallel Gateways** (AND gateway) - NONE in any test!
- ❌ **Inclusive Gateways** (OR gateway)
- ❌ **Event-based Gateways**
- ❌ **Complex Gateway Combinations** (XOR → Parallel → XOR)
- ❌ **Multiple Backflows/Loops**
- ❌ **Subprocess/Call Activities**
- ❌ **Boundary Events** (Timer, Error, etc.)
- ❌ **Message Flows** (between pools)
- ❌ **Multiple Pools**
- ❌ **Very Wide Processes** (10+ lanes)
- ❌ **Very Deep Processes** (20+ layers)

## Potential Critical Issues

### 1. **Parallel Gateway Support** 🔴 CRITICAL
**Status:** Not tested at all!

**What could break:**
- Parallel gateways split into multiple concurrent paths
- All paths must be synchronized at merge gateway
- Label positioning for parallel paths
- Layer assignment for parallel branches

**Risk:** HIGH - This is a fundamental BPMN element!

### 2. **Gateway Merge Handling** 🟡 MEDIUM
**Current:** We remove XOR merge gateways (config option)

**What could break:**
- Multiple flows converging into one gateway
- Label collision at merge point
- Backflow detection with merge gateways

**Risk:** MEDIUM - Depends on use case

### 3. **Complex Backflows** 🟡 MEDIUM
**Current:** We have basic backflow detection

**What could break:**
- Multiple nested loops
- Loops crossing lanes
- Backflow + parallel gateway combination

**Risk:** MEDIUM - order-processing tests basic backflow

### 4. **Label Collision** 🟡 MEDIUM
**Current:** Labels positioned with fixed offset

**What could break:**
- Many flows in small space
- Long label text overlapping
- Labels overlapping with elements

**Risk:** MEDIUM - Dynamic width helps, but not collision detection

### 5. **Very Large Diagrams** 🟢 LOW
**What could break:**
- Performance with 100+ elements
- Memory usage
- Coordinate overflow (>10000px)

**Risk:** LOW - But should test eventually

### 6. **Edge Cases** 🟡 MEDIUM

**Untested scenarios:**
- Gateway with 10+ outputs
- Task with 5+ incoming flows
- Lane with 20+ elements
- Flow with 10+ waypoints
- Empty lanes
- Disconnected subgraphs

## Recommended Next Steps

### Priority 1: Test Parallel Gateway 🔴
**Why:** Fundamental BPMN element, completely untested!

**Action:**
1. Create test case with Parallel Gateway (AND)
2. Test split: 1 input → 3 parallel outputs
3. Test merge: 3 inputs → 1 output
4. Verify label positioning

### Priority 2: Test employee-onboarding 🟡
**Why:** Most complex test case we have (10 tasks, 3 gateways, 4 lanes)

**Action:**
1. Generate layout for employee-onboarding
2. Visual inspection in viewer
3. Look for issues: overlaps, weird positioning, label problems

### Priority 3: Create Stress Test 🟡
**Why:** Find performance and edge case issues

**Action:**
1. Create diagram with:
   - 5+ lanes
   - 2+ parallel gateways
   - 1+ backflow
   - 20+ elements
2. Test and document issues

### Priority 4: Code Review 🟢
**Why:** Clean up and document

**Action:**
- Review phase3.js label calculation
- Document assumptions
- Add error handling
- Add input validation

## Known Limitations

1. **Only Horizontal Lanes:** Vertical orientation not fully tested
2. **No Collision Detection:** Labels and elements can overlap
3. **Fixed Spacing:** No adaptive spacing based on content
4. **No Pool Support:** Only single pool tested
5. **No Message Flows:** Only sequence flows

## Questions to Answer

1. **Do we need Parallel Gateway support?** → Probably YES
2. **Do we need multiple pools?** → Depends on use case
3. **Do we need boundary events?** → Nice to have
4. **What's the max diagram size we support?** → Unknown
5. **Should we add collision detection?** → Nice to have
