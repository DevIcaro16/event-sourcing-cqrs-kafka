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

## Design notes

### `BaseDomainEvent` is duplicated by design

Each event type in `src/events/v1/*.ts` declares its own private `BaseDomainEvent` (with `type`, `occurredAt`, `eventId?`). This is intentional, not an oversight: extracting a shared base would couple every v1 event file to a single declaration site, and any change there (e.g., widening `eventId` or adding a base field) would cascade across all events without explicit per-event review. The duplication is cheap and isolates versioning concerns to one file at a time. Do not "DRY" this without a migration plan.

### `balanceAfter` has no numeric lower bound

Schemas accept any `number` for `balanceAfter` (including negative). This is deliberate: domain rules around overdraft, locked balances, and reversal flows can legitimately produce negative post-balances. The constraint that prevents impossible balances lives in the command layer (e.g., `Account.withdraw` rejects overdraft when policy disallows it), not in the wire-format schema. Validation here is for transport-shape correctness, not business invariants.
