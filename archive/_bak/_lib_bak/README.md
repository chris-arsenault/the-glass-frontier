# Shared Library

This directory contains shared code between the client and server, including envelope types and data transfer objects (DTOs) that are transmitted over the wire.

## Purpose

The shared library ensures:
- **Single source of truth** for data formats
- **Type safety** through validation methods
- **Consistent serialization/deserialization** across client and server
- **Reduced code duplication** and maintenance burden
- **Format synchronization** - no need to keep formats in sync manually

## Structure

```
lib/
├── envelopes/          # Envelope types for wire transmission
│   ├── BaseEnvelope.js
│   ├── CheckResult.js
│   ├── CheckRequest.js
│   ├── NarrationEvent.js
│   ├── AdminAlert.js
│   ├── ModerationDecision.js
│   ├── OfflineJobEvent.js
│   ├── SessionStatusEvent.js
│   ├── OverlaySync.js
│   ├── HubStateEvent.js
│   ├── MarkerEvent.js
│   ├── PlayerControl.js
│   └── index.js        # Exports all envelopes + deserializeEnvelope()
├── dto/                # Data Transfer Objects
│   ├── Character.js
│   ├── InventoryItem.js
│   ├── InventoryDelta.js
│   ├── Momentum.js
│   ├── Overlay.js
│   └── index.js
└── index.js            # Main entry point
```

## Envelopes

Envelopes represent messages sent between client and server. Each envelope has:
- `type` - The envelope type (e.g., "check.result")
- `payload` - The data being transmitted
- `serialize()` - Convert to plain object for wire transmission
- `deserialize()` - Create instance from plain object
- `validate()` - Ensure the envelope is valid

### Admin Envelopes

Handle administrative events:
- **SessionStatusEvent** - `session.statusChanged`, `session.closed`
- **OfflineJobEvent** - `offline.sessionClosure.*` (queued, started, completed, failed)
- **AdminAlert** - `admin.alert`
- **ModerationDecision** - `moderation.decision`

### Narration Envelopes

Handle game narrative and mechanics:
- **NarrationEvent** - `session.message`, `narrative.event`
- **CheckRequest** - `intent.checkRequest`, `check.prompt`
- **CheckResult** - `event.checkResolved`, `check.result`
- **MarkerEvent** - `session.marker`
- **OverlaySync** - `overlay.characterSync`
- **PlayerControl** - `player.control`

### Hub Envelopes

Handle hub/room state:
- **HubStateEvent** - `hub.stateSnapshot`, `hub.stateUpdate`

## DTOs (Data Transfer Objects)

DTOs represent domain objects that can be embedded in envelopes:

### Character
Represents a character with stats and metadata.
```javascript
const character = new Character({
  id: "char-123",
  name: "Aria",
  stats: { iron: 3, heart: 2, shadow: 1 }
});

character.adjustStat("iron", 1);
character.getStat("heart"); // 2
```

### InventoryItem
Represents a single inventory item.
```javascript
const item = new InventoryItem({
  id: "ancient-key",
  name: "Ancient Key",
  quantity: 1,
  tags: ["key", "quest"]
});
```

### InventoryDelta
Represents changes to inventory (add/remove/update).
```javascript
const delta = new InventoryDelta({
  add: [{ id: "sword", name: "Iron Sword", quantity: 1 }],
  remove: [{ id: "broken-shield" }],
  update: [{ id: "health-potion", quantity: 3 }]
});

const result = delta.applyTo(inventory);
// result: { changed: true, summary: { added: [...], removed: [...], updated: [...] } }
```

### Momentum
Represents momentum with history and bounds.
```javascript
const momentum = new Momentum({
  current: 2,
  floor: -6,
  ceiling: 10
});

const result = momentum.applyDelta(2, "strong-hit");
// result: { before: 2, after: 4, delta: 2, clamped: false }
```

### Overlay
Complete character sheet including character, inventory, momentum, etc.
```javascript
const overlay = new Overlay({
  revision: 42,
  character: characterData,
  inventory: inventoryArray,
  momentum: momentumData
});
```

## Usage

### Client (React)

```javascript
import { deserializeEnvelope, CheckResult, OverlaySync } from '../../../lib/envelopes';

function handleEnvelope(rawData) {
  const envelope = deserializeEnvelope(rawData);

  switch (envelope.type) {
    case "check.result": {
      const checkResult = envelope; // Already a CheckResult instance
      console.log("Check resolved:", checkResult.result);
      break;
    }
    case "overlay.characterSync": {
      const sync = envelope; // Already an OverlaySync instance
      setOverlay(sync.serialize());
      break;
    }
  }
}
```

### Server (Node.js)

```javascript
import { CheckResult, NarrationEvent, OfflineJobEvent  } from "./lib/envelopes.js";

// Send a check result
function sendCheckResult(transport, checkId) {
  const checkResult = new CheckResult({
    id: checkId,
    result: "strong-hit",
    move: "face-danger",
    momentumDelta: 2
  });

  checkResult.validate();
  transport.send(checkResult.serialize());
}

// Send a narration event
function sendNarration(transport, content) {
  const event = new NarrationEvent({
    role: "gm",
    content: content
  });

  transport.send(event.serialize());
}

// Track offline job
function trackJob(transport, jobId) {
  const queued = OfflineJobEvent.queued(jobId);
  transport.send(queued.serialize());

  // Later...
  const completed = OfflineJobEvent.completed(jobId, { summaryVersion: 42 }, 2500);
  transport.send(completed.serialize());
}
```

## Migration Guide

### Before (Client)
```javascript
// Manual envelope handling
switch (envelope.type) {
  case "check.result":
    const momentum = envelope.momentum?.after || envelope.momentum?.current;
    // ... lots of null checking and field mapping
    break;
}
```

### After (Client)
```javascript
// Using shared envelopes
import { deserializeEnvelope } from '../../../lib/envelopes';

const envelope = deserializeEnvelope(rawData);
// envelope is already the correct type with validation
const momentum = envelope.momentum; // Properly structured
```

### Before (Server)
```javascript
// Manual serialization
function sendCheckResult(transport, data) {
  transport.send({
    type: "check.result",
    id: data.id,
    result: data.result,
    momentum: data.momentum,
    // ... manual field mapping
  });
}
```

### After (Server)
```javascript
// Using shared envelopes
import { CheckResult  } from "./lib/envelopes.js";

function sendCheckResult(transport, data) {
  const checkResult = new CheckResult(data);
  checkResult.validate(); // Ensures correctness
  transport.send(checkResult.serialize());
}
```

## Benefits

1. **Single Responsibility**: Each envelope class handles one type of message
2. **Validation**: Built-in validation ensures data integrity
3. **Documentation**: Envelope classes serve as living documentation
4. **Refactoring Safety**: Changes to formats are reflected everywhere
5. **Type Safety**: Clear structure reduces bugs from typos or missing fields
6. **Consistent Behavior**: Same serialization logic on client and server

## Testing

Each envelope and DTO includes a `validate()` method for testing:

```javascript
const checkResult = new CheckResult(data);
try {
  checkResult.validate();
  console.log("Valid!");
} catch (error) {
  console.error("Invalid:", error.message);
}
```

## See Also

- `/src/examples/usingSharedEnvelopes.js` - Server usage examples
- `/client/src/hooks/useSessionNarrationConnection.example.js` - Client usage example
