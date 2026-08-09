# Transaction Guide

## Usage

`TransactionManager.withTransaction` executes a callback at PostgreSQL `SERIALIZABLE` isolation and supplies Customer, Employee, Booking, Service, and Payment repositories bound to the same Prisma transaction client.

```ts
const result = await transactionManager.withTransaction(async (scope) => {
  const booking = await scope.bookings.findById(tenant, bookingId)
  if (!booking.ok) return booking

  return success(booking.value)
})
```

The callback returns `Result`; expected business failures are values and cause no exception flow. Prisma conflict code `P2034` is translated to `ConcurrencyError`. Unexpected database or connectivity faults remain technical exceptions and are handled by the outer application error boundary.

## Rules

1. Never inject root repositories into a transactional use case callback.
2. Use only repositories received from `TransactionScope` until the callback completes.
3. Do not retain transaction-scoped repositories after callback completion.
4. Keep transactions short and avoid network calls inside them.
5. Add bounded retry only at an idempotent use-case boundary in a later phase.
6. Publish durable external events only after a transactional outbox is approved and implemented.

Phase 3A has no write use case, retry loop, or outbox table. The manager and scope are ready for those capabilities without changing repository boundaries.
