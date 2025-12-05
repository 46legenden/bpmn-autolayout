# BPMN Auto-Layout Algorithm

**Automatic positioning and flow routing for BPMN diagrams with collision-free layouts.**

## Features

- ✅ **Dual Orientation Support** - Horizontal and vertical lane layouts
- ✅ **Collision-Free Layouts** - Proactive collision prevention through corridor reservation
- ✅ **Configurable Gateway Handling** - Optional XOR merge gateway removal for cleaner visuals
- ✅ **Loop Support** - Handles back-flows with proper waypoint routing
- ✅ **Comprehensive Testing** - Unit, integration, and snapshot tests

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Usage

```javascript
import { layoutBPMN } from './src/index.js';

const bpmnXml = `<bpmn:definitions>...</bpmn:definitions>`;

const config = {
  laneOrientation: 'horizontal',  // 'horizontal' | 'vertical'
  xorMergeGateways: false,        // true | false
};

const result = layoutBPMN(bpmnXml, config);

if (result.success) {
  console.log(result.bpmnXml);  // Output XML with layout information
} else {
  console.error(result.errors);
}
```

## Configuration

| Option              | Type      | Default        | Description                                      |
| ------------------- | --------- | -------------- | ------------------------------------------------ |
| `laneOrientation`   | `string`  | `'horizontal'` | Layout direction: `'horizontal'` or `'vertical'` |
| `xorMergeGateways`  | `boolean` | `false`        | Keep XOR merge gateways (true) or remove (false) |

### Lane Orientations

**Horizontal (default):**
- Lanes flow from top to bottom
- Process flows from left to right

**Vertical:**
- Lanes flow from left to right
- Process flows from top to bottom

## Algorithm Overview

The algorithm uses a **3-phase approach** inspired by the Sugiyama layered graph layout:

### Phase 1: Initialization & Pre-processing
- Parse BPMN XML
- Validate structure (detect invalid references, case-sensitivity issues)
- Remove XOR merge gateways (if configured)
- Detect back-edges (loops)

### Phase 2: Position Assignment
- Assign logical positions (layer, row) to elements
- Calculate waypoints for flows
- **Proactive collision prevention** through corridor reservation
- Sort gateway outputs by target lane

### Phase 3: Coordinate Calculation
- Convert logical positions to pixel coordinates
- Apply orientation-specific transformations
- Generate final BPMN XML with layout information

## Documentation

- **[Algorithm Specification](docs/ALGORITHM_SPEC.md)** - Complete algorithm design with abstract directional terms
- **[Testing Strategy](docs/TESTING_STRATEGY.md)** - Test approach, structure, and examples
- **[Implementation Plan](docs/IMPLEMENTATION_PLAN.md)** - Phase-by-phase development roadmap
- **[Refactoring Rationale](docs/REFACTORING_RATIONALE.md)** - Why we moved from reactive to proactive collision prevention

## Development

### Project Structure

```
bpmn-autolayout/
├── src/
│   ├── index.js          # Main layoutBPMN() function
│   ├── phase1.js         # Parsing, Validation, Pre-processing
│   ├── phase2.js         # Position Assignment, Collision Prevention
│   ├── phase3.js         # Coordinate Calculation
│   └── viewer.js         # Visual verification tool
├── tests/
│   ├── unit/             # Unit tests for each phase
│   ├── integration/      # End-to-end tests
│   ├── fixtures/         # Test BPMN XML files
│   └── snapshots/        # Snapshot test baselines
├── docs/                 # Complete documentation
└── README.md
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Update snapshots (after verifying changes are correct)
npm run test:update-snapshots
```

## Design Principles

1. **Proactive over Reactive** - Prevent collisions during positioning, not after
2. **Abstract Directions** - Use `alongLane`, `crossLane` instead of concrete directions
3. **Configuration-Driven** - Same algorithm works for both orientations
4. **Test-Driven Development** - Comprehensive unit and integration tests
5. **Clear Validation** - Helpful error messages for invalid input

## License

MIT

## Contributing

Contributions are welcome! Please ensure all tests pass before submitting a pull request.

```bash
npm test
```
