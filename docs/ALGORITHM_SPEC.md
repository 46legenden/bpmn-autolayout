# BPMN Layout Algorithmus - Finale Spezifikation (Abstrakte Richtungen)

---

## Tool Signature

```javascript
function layoutBPMN(bpmnXml, config = {})
```

### **Parameters:**

**bpmnXml** (string, required)
- BPMN XML mit Elementen, Flows, Lanes

**config** (object, optional)
```javascript
{
  laneOrientation: "horizontal" | "vertical",  // Default: "horizontal"
  xorMergeGateways: boolean  // Default: false
}
```

### **Returns:**

```javascript
{
  success: boolean,
  bpmnXml?: string,  // Mit Koordinaten (wenn success = true)
  errors?: string[]  // Validierungsfehler (wenn success = false)
}
```

---

## Phase 1: Initialisierung + Validierung

### **1a. Parse XML**
- Lese BPMN XML
- Extrahiere Elemente, Flows, Lanes

### **1b. Pre-Processing**

**XOR Merge-Gateway Entfernung:**
```javascript
IF config.xorMergeGateways == false:
  FOR EACH gateway:
    IF isXorGateway(gateway) AND isMergeGateway(gateway):
      // Entferne Gateway, verbinde Flows direkt
      inputs = getIncomingFlows(gateway)
      outputs = getOutgoingFlows(gateway)
      
      target = outputs[0].target
      
      FOR EACH input IN inputs:
        input.target = target
      
      removeGateway(gateway)
```

### **1c. Validierung**

**Struktur-Checks:**
- Alle Elemente haben ID? ✓
- Alle Flows haben Source + Target? ✓
- Source/Target existieren? ✓

**Logik-Checks:**
- Start-Event vorhanden? ✓
- Parallel-Gateway hat Merge? ✓
- Inclusive-Gateway hat Merge? ✓
- XOR-Gateway hat Merge? (nur wenn `config.xorMergeGateways = true`)
- Keine toten Enden? ✓

**Bei Fehler:** Return mit Fehlermeldung

### **1d. Konfiguration anwenden**

```javascript
laneOrientation = config.laneOrientation || "horizontal"

IF laneOrientation == "horizontal":
  alongLane = "right"        // Prozess geht nach rechts
  oppAlongLane = "left"      // Gegenrichtung
  crossLane = "down"         // Lane-Wechsel nach unten
  oppCrossLane = "up"        // Gegenrichtung
ELSE:  // vertical
  alongLane = "down"         // Prozess geht nach unten
  oppAlongLane = "up"        // Gegenrichtung
  crossLane = "right"        // Lane-Wechsel nach rechts
  oppCrossLane = "left"      // Gegenrichtung
```

**Wichtig:** Diese Variablen werden in Phase 2 verwendet!

### **1e. Back-Edge Detection**
- DFS: Finde Zyklen (Loops)
- Markiere Back-Edges

### **1f. Matrix initialisieren**

```javascript
Matrix[lane][layer] = {
  elements: [{ row, elementId }],
  flowAlongLane: { direction: alongLane | oppAlongLane, flows } | null,
  flowCrossLane: { direction: crossLane | oppCrossLane, flows } | null
}
```

**Wichtig:** Matrix hat zwei Flow-Achsen (alongLane, crossLane)

---

## Phase 2: Position Assignment + Waypoints + Collision Detection

### **Gateway-Lane-Regel:**

**Vor dem Platzieren:**
```javascript
FOR EACH gateway:
  IF gateway hat 1 Input (Split-Gateway):
    gateway.lane = input.lane
  
  ELSE IF gateway hat 1 Output (Merge-Gateway):
    gateway.lane = output.lane
  
  ELSE:
    gateway.lane = firstOutput.lane
```

### **Output:**
```javascript
{
  positions: Map<elementId, {lane, layer, row}>,
  waypoints: Map<flowId, [LogicalWaypoint]>,
  matrix: Matrix
}
```

### **Logischer Waypoint:**
```javascript
{
  lane: "user",
  layer: 2,
  row: 0,
  side: alongLane | oppAlongLane | crossLane | oppCrossLane
}
```

**Beispiel (horizontal):**
```javascript
{ lane: "user", layer: 2, row: 0, side: "right" }  // alongLane
```

**Beispiel (vertical):**
```javascript
{ lane: "user", layer: 2, row: 0, side: "down" }   // alongLane
```

### **Hauptregeln:**

**1. Gleiche Lane**
- Element B kommt in **Spalte +1** von Element A
- **Waypoints:**
  - Start: A.side = alongLane
  - Ende: B.side = oppAlongLane

**2. Back-Flow Reservierung** (ZUERST prüfen!)
- **Ziel-Element** (empfängt Loop):
  - Hat Element B einen Back-Flow? → **Spalte ist reserviert!**
  - Cross-Lane Flows zu Element B → **Spalte +1**
- **Source-Element** (sendet Loop):
  - Prüfe: Kann in oppAlongLane Richtung zurück (Source-Lane frei)?
  - Ja? → **Waypoints:** Source.oppAlongLane → Target.oppAlongLane
  - Nein? → **Reserviere Zeile/Row in oppCrossLane Richtung** + **Waypoints:** Source.oppCrossLane → oppAlongLane → crossLane → Target.oppAlongLane

**3. Cross-Lane (Weg frei)**
- Element B kommt in **gleiche Spalte** wie Element A
- Prüfung: Matrix[Lanes zwischen A und B][Spalte A] = leer?
- Prüfung: Element B hat KEINEN Back-Flow!
- **Waypoints (L-Shape):**
  - Start: A.side = alongLane
  - Knick: A.lane, B.layer, side = crossLane (wenn B in crossLane Richtung) oder oppCrossLane (wenn B in oppCrossLane Richtung)
  - Ende: B.side = oppAlongLane

**4. Cross-Lane (Weg blockiert)**
- Element B kommt in **Spalte +1** von Element A
- Blockiert = Element ODER Flow (entgegengesetzte Richtung)
- **Waypoints (L-Shape):**
  - Start: A.side = alongLane
  - Knick: A.lane, B.layer, side = crossLane oder oppCrossLane
  - Ende: B.side = oppAlongLane

**5. Gateway-Outputs**
- Alle Outputs in **Spalte +1**
- **Sortiert** nach Nachfolger-Ziel-Lane (Task+1):
  - Nachfolger geht in oppCrossLane Richtung → oppCrossLane Seite (z.B. oben bei horizontal)
  - Nachfolger bleibt → mitte
  - Nachfolger geht in crossLane Richtung → crossLane Seite (z.B. unten bei horizontal)
- **Row-Zuweisung:**
  - 2 Outputs: Row 0, Row 1 (minimiere negative Rows)
  - 3 Outputs: Row -1, Row 0, Row 1 (symmetrisch)
  - Ziel: Symmetrisch um Row 0
- **Waypoints:**
  - Alle Outputs starten vom gleichen Punkt: Gateway.side = alongLane
  - Jeder Output: Eigener Flow mit eigenen Waypoints

### **Collision Detection (Teil von Phase 2):**

**Beim Platzieren:**
- Prüfe: Matrix[lane][layer] frei?
- Element-Collision: Matrix[lane][layer].elements nicht leer
- Flow-Collision: Entgegengesetzte Richtung auf gleicher Achse
- Element-Flow-Collision: Element + Flow

**Beim Flow markieren:**
- **AlongLane-Achse:** Flow(alongLane) + Flow(oppAlongLane) = Collision
- **CrossLane-Achse:** Flow(crossLane) + Flow(oppCrossLane) = Collision
- **OK:** Flow(alongLane) + Flow(crossLane) = Kein Problem (verschiedene Achsen)

### **Wichtig:**
- **Ein Flow = Ein Pfeil zwischen zwei Elementen**
- Flow geht NICHT durch Elemente durch
- Jeder Flow hat eigene Waypoint-Liste
- **Forward-Flows UND Back-Flows werden hier berechnet!**
- **Collision Detection läuft während des Platzierens!**
- **Alle Richtungen sind abstrakt** (funktioniert für horizontal UND vertical!)

---

## Phase 3: Coordinate Calculation

### **Input:**
```javascript
{
  positions: Map<elementId, {lane, layer, row}>,
  waypoints: Map<flowId, [LogicalWaypoint]>
}
```

### **Output:**
```javascript
{
  coordinates: Map<elementId, {x, y, width, height}>,
  waypoints: Map<flowId, [{x, y}]>  // Jetzt Pixel!
}
```

### **Berechnung:**

**Elemente:**
```javascript
// Normalisiere Rows (Row -1 → 0, Row 0 → 1, etc.)
minRow = MIN(all rows in lane)
normalizedRow = row - minRow

// Berechne Koordinaten
IF laneOrientation == "horizontal":
  x = layer × LAYER_SPACING
  y = laneIndex × LANE_SPACING + normalizedRow × ROW_SPACING
ELSE:  // vertical
  x = laneIndex × LANE_SPACING + normalizedRow × ROW_SPACING
  y = layer × LAYER_SPACING
```

**Waypoints:**
```javascript
FOR EACH logicalWaypoint:
  element = findElement(logicalWaypoint.lane, logicalWaypoint.layer, logicalWaypoint.row)
  coord = coordinates.get(element.id)
  
  // Map abstrakte Richtung zu Pixel
  side = logicalWaypoint.side  // "right", "left", "down", "up"
  
  SWITCH side:
    CASE "right":
      x = coord.x + coord.width
      y = coord.y + coord.height / 2
    CASE "left":
      x = coord.x
      y = coord.y + coord.height / 2
    CASE "top" or "up":
      x = coord.x + coord.width / 2
      y = coord.y
    CASE "bottom" or "down":
      x = coord.x + coord.width / 2
      y = coord.y + coord.height
  
  pixelWaypoint = { x, y }
```

---

## Zusammenfassung

**Phase 1:** Initialisierung + Validierung
  - Parse XML
  - Pre-Processing (XOR Merge-Gateway Entfernung)
  - Validierung (Struktur + Logik)
  - **Konfiguration anwenden** (alongLane, crossLane definieren)
  - Back-Edge Detection
  - Matrix-Setup

**Phase 2:** Position Assignment + Waypoints + Collision Detection
  - Gateway-Lane-Regel (Split: Input-Lane, Merge: Output-Lane)
  - Collision-frei platzieren
  - Back-Flow-Reservierung + Waypoints
  - Gateway-Output-Sortierung mit symmetrischen Rows
  - Alle Waypoints (Forward + Back) berechnen
  - Collision Detection während Platzierung
  - **Alle Richtungen abstrakt** (alongLane, crossLane)

**Phase 3:** Coordinate Calculation
  - Elemente: Matrix → Pixel
  - Waypoints: Logisch → Pixel
  - Row-Normalisierung
  - **Richtungen werden zu konkreten Pixel-Koordinaten**

---

## Konfiguration

### **laneOrientation**

**"horizontal" (Default):**
- Lanes: oben → unten
- Prozess: links → rechts
- alongLane = "right", oppAlongLane = "left"
- crossLane = "down", oppCrossLane = "up"

**"vertical":**
- Lanes: links → rechts
- Prozess: oben → unten
- alongLane = "down", oppAlongLane = "up"
- crossLane = "right", oppCrossLane = "left"

### **xorMergeGateways**

**false (Default):**
- XOR Merge-Gateways werden entfernt (Pre-Processing)
- Flows direkt verbunden

**true:**
- XOR Merge-Gateways bleiben
- Validierung prüft Vorhandensein

---

## Tool Description für KI

```
Tool: layoutBPMN

Description: 
Generates layout coordinates for BPMN diagram elements.
Creates a visually optimized diagram with collision-free flows.
Supports both horizontal and vertical lane orientations.

Parameters:
- bpmnXml (string, required): 
    BPMN XML with elements, flows, and lanes
    
- config (object, optional):
    {
      laneOrientation: "horizontal" | "vertical"
        Default: "horizontal"
        Horizontal: Lanes top-to-bottom, process left-to-right
        Vertical: Lanes left-to-right, process top-to-bottom
        
      xorMergeGateways: boolean
        Default: false
        If true, XOR merge gateways are required
        If false, XOR merge gateways are removed (cleaner look)
    }

Returns:
{
  success: boolean,
  bpmnXml?: string (with coordinates),
  errors?: string[] (validation errors)
}

Validation Requirements:
- All flows must have valid source and target
- Parallel gateways must have merge gateways
- Inclusive gateways must have merge gateways
- XOR merge gateways optional (unless xorMergeGateways: true)
- Must have at least one start event

Example:
layoutBPMN(xml)  // Default: horizontal, no XOR merges
layoutBPMN(xml, { laneOrientation: "vertical" })
layoutBPMN(xml, { xorMergeGateways: true })
```

---

## Nächste Schritte

1. ✅ **Algorithmus komplett spezifiziert mit abstrakten Richtungen**
2. → **Implementierung starten** (`sugiyama-v2.mjs`)
3. → **Testing mit horizontal UND vertical**
4. → **Integration als Tool für KI**
