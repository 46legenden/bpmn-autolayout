# Datacenter Provisioning Test Results

## Scenario
**3 Pools, 8 Lanes, 6 Message Flows, Multiple Task Types**

### Pools:
1. **Customer** (3 lanes: Business Unit, Finance, IT Department)
2. **Datacenter Operations** (3 lanes: Sales, Operations, Engineering)
3. **Cloud Provider** (2 lanes: Provisioning, Support)

### Task Types:
- User Tasks (Submit Request, Review Quote, Validate Service, etc.)
- Service Tasks (Confirm Order, Create Quote, Deploy Service, etc.)
- Manual Tasks (Approve Budget, Wait for Capacity)

### Message Events:
- Intermediate Catch Events (Receive Quote, Receive Confirmation, Resources Ready, etc.)

### Message Flows:
1. Service Request (Customer → Datacenter)
2. Quote (Datacenter → Customer)
3. Order Confirmation (Customer → Datacenter)
4. Provision Request (Datacenter → Provider)
5. Resources Ready (Provider → Datacenter)
6. Deployment Complete (Datacenter → Customer)

### Back-Flows:
- Customer: Approved? No → Submit Request (cross-lane)
- Customer: Service OK? No → Validate Service (back-flow with intermediate)
- Datacenter: Tests Pass? No → Deploy Service (cross-lane)
- Provider: Capacity Available? No → Check Capacity (same-lane)

## Results

### ✅ What Works:
1. **3-Pool Layout**: All 3 pools rendered correctly
2. **Multiple Lanes**: 8 lanes across 3 pools, all positioned correctly
3. **Message Flows**: All 6 message flows routed correctly
4. **Message Events**: Intermediate catch events positioned correctly
5. **Task Types**: User, Service, Manual tasks all rendered
6. **Back-Flows**: Cascade routing works for all back-flows
7. **Cross-Lane Flows**: Flows across lanes work correctly
8. **Label Positioning**: Message flow labels positioned based on exit direction

### ⚠️ Observations:
1. Some message flows had collision detection issues but found alternative routes
2. msg_flow_4 (Provision Request): down → down failed, used up → down instead
3. msg_flow_6 (Deployment Complete): down → down succeeded

### 🎯 Overall Assessment:
**The auto-layout engine handles complex multi-pool scenarios very well!**

No crashes, no major layout issues, all elements visible and flows routed correctly.
