# BPMN Auto-Layout: Testing Strategy

**Version:** 1.0
**Date:** 2025-12-05

## 1. Overview & Philosophy

This document outlines the complete testing strategy for the BPMN auto-layout algorithm. Our goal is to ensure correctness, prevent regressions, and enable safe refactoring. We will adopt a **state-of-the-art, automated testing approach** that is both comprehensive and token-efficient.

The core philosophy is to run a suite of fast, automated tests in the background after every code change. The developer (the AI) will only see a summary output (e.g., `✓ 40/40 tests passed`), ensuring development speed and minimizing token consumption. Only when a test fails will detailed, specific error information be displayed.

## 2. The Test Pyramid

We will follow the industry-standard "Test Pyramid" model to structure our tests. This model prioritizes a large base of fast, isolated unit tests, a smaller layer of integration tests, and a very small number of slow, end-to-end tests.

```
        /\
       /  \  Visual Regression Tests (Few)
      /____\
     /      \  Integration Tests (Some)
    /________\
   /          \  Unit Tests (Many)
  /____________\
```

| Test Type             | Purpose                                     | Speed | Scope              | Quantity |
| --------------------- | ------------------------------------------- | ----- | ------------------ | -------- |
| **Unit Tests**        | Verify a single function works correctly.   | Fast  | One function       | Many     |
| **Integration Tests** | Verify multiple components work together.   | Med   | Multiple functions | Some     |
| **Snapshot Tests**    | Prevent unintended changes to the XML output. | Fast  | Full output        | Some     |
| **Visual Regression** | Prevent unintended changes to the visual layout. | Slow  | Rendered image     | Few      |

## 3. Test Types Explained

### 3.1. Unit Tests

Unit tests are the foundation of our strategy. They test a single function in complete isolation.

*   **Purpose:** To verify the logic of individual building blocks (e.g., `parseXML`, `detectBackEdges`).
*   **Pseudocode Example:**

    ```javascript
    // Test for: src/phase1.js -> function validateBPMN(bpmnGraph)

    test("should detect flows with invalid source or target IDs", () => {
      const graphWithInvalidFlow = {
        elements: { 'task1': {...} },
        flows: { 'flow1': { sourceRef: 'task1', targetRef: 'invalid-id' } }
      };

      const result = validateBPMN(graphWithInvalidFlow);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Flow 'flow1' has an invalid targetRef 'invalid-id'");
    });
    ```

### 3.2. Integration Tests

Integration tests verify that different parts of the algorithm work together as expected. They test the entire `layoutBPMN` function from input to output.

*   **Purpose:** To ensure the phases (1, 2, and 3) correctly hand off data and produce a valid, collision-free layout.
*   **Pseudocode Example:**

    ```javascript
    // Test for: src/index.js -> function layoutBPMN(xml, config)

    test("should produce a collision-free layout for the ITIL diagram (horizontal)", () => {
      const itilXml = readFile("fixtures/itil-incident.xml");
      const config = { laneOrientation: 'horizontal' };

      const finalXml = layoutBPMN(itilXml, config);

      // Helper function to check for overlapping element bounds
      const collisions = findCollisions(finalXml);

      expect(collisions.length).toBe(0);
    });
    ```

### 3.3. Snapshot Tests

Snapshot tests are a special type of integration test. On the first run, they save the generated XML output to a "snapshot" file. On subsequent runs, they compare the new output to the saved snapshot. The test fails if they don't match.

*   **Purpose:** To catch unintended changes in the final XML structure, waypoints, or coordinates.
*   **Pseudocode Example:**

    ```javascript
    test("ITIL diagram layout should remain consistent (vertical)", () => {
      const itilXml = readFile("fixtures/itil-incident.xml");
      const config = { laneOrientation: 'vertical' };

      const finalXml = layoutBPMN(itilXml, config);

      // Compares `finalXml` to the stored snapshot file.
      // Fails if they are different.
      expect(finalXml).toMatchSnapshot();
    });
    ```

## 4. Directory Structure

The project will be organized with a clear separation between source code (`src`) and tests (`tests`).

```
bpmn-layout/
├── src/                  # Source code for the algorithm
│   ├── index.js          # Main layoutBPMN() function
│   ├── phase1.js         # Parsing, Validation, Pre-processing
│   ├── phase2.js         # Positioning, Waypoints, Collision Avoidance
│   └── phase3.js         # Coordinate Calculation
│
├── tests/                # All test-related files
│   ├── unit/             # Unit tests, mirroring the src structure
│   │   ├── phase1.test.js
│   │   └── phase2.test.js
│   │
│   ├── integration/      # Integration and Snapshot tests
│   │   └── layout.test.js
│   │
│   ├── fixtures/         # Test data (input BPMN XML files)
│   │   ├── simple-linear.xml
│   │   └── itil-incident.xml
│   │
│   └── snapshots/        # Auto-generated by the test runner
│       └── layout.test.js.snap
│
├── package.json          # Project config and scripts
└── vitest.config.js      # Test runner configuration
```

## 5. Workflow & Automation

1.  **Setup:** A modern test runner like **Vitest** will be installed and configured.
2.  **Development:** The AI developer writes or modifies code in the `src` directory.
3.  **Execution:** After making changes, the AI runs a single command: `npm test`.
4.  **Feedback:** The test runner executes all unit and integration tests. 
    *   **On Success:** It prints a single confirmation line (e.g., `✓ All 40 tests passed`).
    *   **On Failure:** It prints only the details of the failed test (e.g., `✗ Expected 5 elements, but got 4`).
5.  **CI/CD:** A GitHub Actions workflow will be configured to run `npm test` on every push and pull request, guaranteeing that no failing code is merged.

This workflow is **highly token-efficient**, as the full test code and verbose outputs are never shown unless a problem needs debugging. It provides the perfect balance of rigor and speed.
