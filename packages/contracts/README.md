# @banking/contracts

Versioned domain event types, JSON Schemas, and runtime validators shared across services.

## Usage

```ts
import type { AccountOpened, EventEnvelope } from '@banking/contracts'
import { validateEvent } from '@banking/contracts'

const result = validateEvent('AccountOpened', 1, payload)
if (!result.valid) {
  // route to DLQ
}
```

## Versioning

- Each event lives at `src/events/v<N>/<EventName>.ts` with its schema at `src/schemas/v<N>/<EventName>.schema.ts`.
- Backward-compatible change (add optional field): same version, bump patch.
- Breaking change (remove field, rename, type change, require new field): new `v<N+1>` directory, bump major.
- Publishers MAY emit `v<N>` and `v<N+1>` concurrently during transition windows.
