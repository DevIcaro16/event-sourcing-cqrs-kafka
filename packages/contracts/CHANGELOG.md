# Changelog

All notable changes to `@banking/contracts` are documented here.

## [0.1.0] — 2026-05-12

### Added
- Initial release.
- `EventEnvelope<T>` and `EventMetadata` types.
- v1 event types and JSON Schemas for: AccountOpened, MoneyDeposited, MoneyWithdrawn, TransferInitiated, TransferReceived, TransferCompensated, BalanceLocked, BalanceUnlocked, TransactionReversed.
- `validateEvent(eventType, version, payload)` runtime validator backed by Ajv.
