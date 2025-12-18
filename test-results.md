# Test Results - Message Flow Advanced

## Visual Inspection (2025-12-18)

### Diagram Overview
The diagram shows two separate BPMN processes (two pools), each with multiple lanes:

**Pool 1: Sales Department**
- Lane 1: Sales Representative
- Lane 2: Order Management  
- Lane 3: Finance

**Pool 2: Supplier**
- Lane 1: Sales Representative
- Lane 2: Warehouse
- Lane 3: Accounting

### Collision Detection Results

✅ **Message Flows (Cross-Pool)**: 
- All message flows between pools are properly routed
- No overlapping flows visible
- Flows enter elements at proper angles (90° vertical entry)
- "Send Order" → "Receive Order" message flow correctly routed
- "Receive Invoice" → "Process Payment" message flow correctly routed
- "Send Invoice" → "Receive Confirmation" message flow correctly routed

✅ **Cross-Lane Flows**:
- Flows between lanes within the same pool are clean
- No flows going through intermediate elements
- "Review Quote" → "Approve Order" crosses lanes correctly
- "Approve Order" → "Generate Invoice" crosses lanes correctly
- "Send Quote" → "Check Inventory" crosses lanes correctly

✅ **Gateway Positioning**:
- Gateway outputs are positioned at Layer+1 (as enforced by recent changes)
- "Approved?" gateway in Pool 1 has proper output positioning
- "In Stock?" gateway in Pool 2 has proper output positioning

✅ **Element Positioning**:
- No overlapping elements
- Clean layer-based layout
- Elements in intermediate lanes do not interfere with cross-lane flows

### Conclusion
All collision detection mechanisms are working correctly:
1. ✅ Waypoint-based collision detection for Message Flows
2. ✅ Element-in-between check for Cross-Lane flows
3. ✅ Gateway output Layer+1 enforcement
4. ✅ No overlapping flows or elements

The diagram renders cleanly with proper spacing and routing.
