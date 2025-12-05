# BPMN Layout Algorithm - Refactoring Plan

## Aktueller Algorithmus (Problematisch)

### **Phasen:**

**Phase 0:** Gateway Branch Order Optimization
- Sortiert Gateway-Outputs nach Distanz

**Phase 0.5:** Gateway Lane Placement
- Optimiert Gateway-Position basierend auf Inputs/Outputs

**Phase 1:** Layer Assignment (Spalten/X-Koordinaten)
- Topologische Sortierung
- Elemente bekommen Spalten (Layer 0, 1, 2, ...)

**Phase 2:** Row Assignment (Zeilen/Y-Koordinaten innerhalb Lanes)
- Elemente bekommen Zeilen innerhalb ihrer Lane

**Phase 2.5:** Back-Edge Space Allocation
- Reserviert Platz für Loop-Flows

**Phase 3:** Coordinate Calculation
- Berechnet tatsächliche X, Y Pixel-Koordinaten

**Phase 4:** Waypoint Collision Resolution
- **PROBLEM:** Versucht Collisions zu fixen NACHDEM Elemente positioniert sind
- **PROBLEM:** Fügt Layer ein, verschiebt Elemente
- **PROBLEM:** Waypoints passen nicht mehr zu Positionen
- **PROBLEM:** Erzeugt neue Collisions beim Fixen alter Collisions

### **Warum das nicht funktioniert:**

1. **Zu spät:** Collisions werden erst erkannt wenn Elemente schon positioniert sind
2. **Reaktiv statt proaktiv:** Versucht Probleme zu fixen statt sie zu vermeiden
3. **Endlosschleife:** Layer-Insertion löst alte Collisions aber erzeugt neue
4. **Waypoint-Problem:** Waypoints werden mit alten Positionen berechnet

---

## Neuer Ansatz (Proaktiv & Collision-frei)

### **Kernidee:**

> **Positioniere Elemente SO, dass Flows GARANTIERT keine Collisions haben können!**

### **Prinzip:**

Wir wissen OHNE Waypoints zu zeichnen:
- Ein Flow von Element A → Element B braucht einen **freien Pfad**
- Wenn A in Spalte 3 ist und B in Spalte 5, dann darf in Spalte 4 **KEIN** Element im Weg sein
- Wenn A in Lane 1 ist und B in Lane 3, dann darf in Lane 2 **KEIN** Element den vertikalen Pfad blockieren

**Also:** Wir müssen Elemente so platzieren, dass alle Pfade frei sind!

---

## Neuer Algorithmus (Vorschlag)

### **Phase 1: Layer Assignment (wie bisher)**
- Topologische Sortierung
- Elemente bekommen Spalten

### **Phase 2: Flow Path Reservation**
**NEU!** Reserviere Pfade für alle Flows

Für jeden Flow A → B:
1. Bestimme Pfad-Typ:
   - Horizontal (gleiche Lane, verschiedene Spalten)
   - Vertikal (gleiche Spalte, verschiedene Lanes)
   - L-Shape (verschiedene Spalte UND Lane)

2. Reserviere "Korridore":
   - Horizontal: Reserviere Zeile in Lane
   - Vertikal: Reserviere Spalte zwischen Lanes
   - L-Shape: Reserviere beide

3. Markiere "No-Go Zones":
   - Bereiche wo KEINE Elemente platziert werden dürfen

### **Phase 3: Collision-Free Row Assignment**
**VERBESSERT!** Platziere Elemente unter Berücksichtigung der Korridore

Für jedes Element:
1. Prüfe welche Zeilen in der Lane verfügbar sind
2. Prüfe welche Zeilen durch Flow-Korridore blockiert sind
3. Wähle eine freie Zeile

### **Phase 4: Coordinate Calculation**
- Berechnet X, Y Koordinaten (wie bisher)

### **Phase 5: Waypoint Generation**
- Zeichnet Waypoints entlang der reservierten Korridore
- **GARANTIERT collision-frei** weil Korridore reserviert sind!

---

## Detailliertes Konzept: Flow Path Reservation

### **Beispiel 1: Horizontal Flow**

```
Lane 1:  [A] ----→ [B]
         Col 2     Col 5
```

**Reservierung:**
- Lane 1, Spalten 2-5, Zeile von A
- **Keine anderen Elemente** in dieser Zeile zwischen Spalte 2 und 5

### **Beispiel 2: Vertikal Flow (Cross-Lane)**

```
Lane 1:  [A]
          |
          ↓ (Spalte 2)
Lane 2:  [B]
```

**Reservierung:**
- Spalte 2, zwischen Lane 1 und Lane 2
- **Keine anderen Elemente** in Spalte 2 in Lanes zwischen A und B

### **Beispiel 3: L-Shape Flow**

```
Lane 1:  [A] ----→
         Col 2     |
                   ↓ (Spalte 5)
Lane 2:           [B]
                  Col 5
```

**Reservierung:**
- Horizontal: Lane 1, Spalten 2-5, Zeile von A
- Vertikal: Spalte 5, zwischen Lane 1 und Lane 2
- **Keine anderen Elemente** in diesen Bereichen

---

## Algorithmus-Details

### **Phase 2: Flow Path Reservation (Pseudo-Code)**

```javascript
function reserveFlowPaths(elements, flows, layers, lanes) {
  const reservations = new Map(); // lane -> column -> rows (Set)
  
  flows.forEach(flow => {
    const source = elements.find(e => e.id === flow.from);
    const target = elements.find(e => e.id === flow.to);
    
    const sourceLayer = layers.get(flow.from);
    const targetLayer = layers.get(flow.to);
    
    // Determine path type
    if (source.lane === target.lane) {
      // Horizontal flow - reserve row in lane
      reserveHorizontalPath(reservations, source.lane, sourceLayer, targetLayer);
    } else if (sourceLayer === targetLayer) {
      // Vertical flow - reserve column between lanes
      reserveVerticalPath(reservations, sourceLayer, source.lane, target.lane);
    } else {
      // L-Shape flow - reserve both
      reserveHorizontalPath(reservations, source.lane, sourceLayer, targetLayer);
      reserveVerticalPath(reservations, targetLayer, source.lane, target.lane);
    }
  });
  
  return reservations;
}
```

### **Phase 3: Collision-Free Row Assignment (Pseudo-Code)**

```javascript
function assignRowsCollisionFree(elements, flows, layers, lanes, reservations) {
  const rows = new Map();
  const laneRows = new Map(); // lane -> Set of used rows
  
  elements.forEach(el => {
    const lane = el.lane;
    const layer = layers.get(el.id);
    
    // Find free row in this lane
    let row = 0;
    while (true) {
      // Check if row is used by another element
      const usedRows = laneRows.get(lane) || new Set();
      if (usedRows.has(row)) {
        row++;
        continue;
      }
      
      // Check if row is blocked by flow reservation
      const blocked = isRowBlockedByFlow(reservations, lane, layer, row);
      if (blocked) {
        row++;
        continue;
      }
      
      // Row is free!
      rows.set(el.id, row);
      usedRows.add(row);
      laneRows.set(lane, usedRows);
      break;
    }
  });
  
  return rows;
}
```

---

## Vorteile des neuen Ansatzes

### ✅ **Proaktiv statt reaktiv**
- Collisions werden verhindert, nicht gefixt

### ✅ **Garantiert collision-frei**
- Wenn Korridore reserviert sind, können keine Collisions entstehen

### ✅ **Keine Iterationen nötig**
- Algorithmus läuft einmal durch, fertig

### ✅ **Waypoints sind einfach**
- Folgen einfach den reservierten Korridoren

### ✅ **Verständlicher Code**
- Klare Trennung: Erst positionieren, dann zeichnen

---

## Herausforderungen

### ⚠️ **Mehr Platz benötigt**
- Reservierte Korridore brauchen Platz
- Diagramme könnten größer werden

### ⚠️ **Komplexere Row Assignment**
- Muss Reservierungen berücksichtigen
- Mehr Logik nötig

### ⚠️ **Back-Edges (Loops)**
- Brauchen spezielle Behandlung
- Könnten "außen rum" gehen

---

## Implementierungs-Strategie

### **Option A: Komplettes Rewrite**
- Neue Datei: `sugiyama-v2.mjs`
- Implementiere neuen Algorithmus von Grund auf
- Teste parallel zum alten

**Vorteil:** Sauberer Code, keine Legacy-Probleme
**Nachteil:** Viel Arbeit

### **Option B: Schrittweises Refactoring**
- Behalte Phase 0, 0.5, 1 (funktionieren)
- Ersetze Phase 2 mit neuer "Flow Path Reservation"
- Ersetze Phase 3 mit "Collision-Free Row Assignment"
- Entferne Phase 4 (nicht mehr nötig)

**Vorteil:** Weniger Arbeit, schrittweise testbar
**Nachteil:** Code bleibt teilweise legacy

---

## Empfehlung

**Option B: Schrittweises Refactoring**

1. **Schritt 1:** Implementiere `reserveFlowPaths()` (neue Phase 2)
2. **Schritt 2:** Implementiere `assignRowsCollisionFree()` (neue Phase 3)
3. **Schritt 3:** Entferne alte Phase 4 (Collision Resolution)
4. **Schritt 4:** Teste mit allen Test Cases
5. **Schritt 5:** Optimiere und poliere

---

## Nächste Schritte

1. **Diskussion:** Ist dieser Ansatz richtig?
2. **Prototyp:** Implementiere `reserveFlowPaths()` für einfache Fälle
3. **Test:** Teste mit einem einfachen Diagramm
4. **Iteration:** Erweitere für komplexe Fälle
5. **Vollständig:** Implementiere für alle Flow-Typen

---

## Offene Fragen

1. **Wie viel Platz für Korridore?**
   - Eine Zeile pro Flow?
   - Oder Flows können sich Korridore teilen wenn sie in gleiche Richtung gehen?

2. **Back-Edges (Loops)?**
   - Eigene Korridore "außen rum"?
   - Oder spezielle Behandlung?

3. **Gateway-Outputs?**
   - Brauchen mehrere Korridore
   - Wie reservieren?

4. **Performance?**
   - Ist der neue Ansatz schneller oder langsamer?
   - Akzeptabel für große Diagramme?
