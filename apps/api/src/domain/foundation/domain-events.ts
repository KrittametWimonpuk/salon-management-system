import type { DomainError } from './domain-errors.js'
import type { IdGenerator } from './id-generator.js'
import type { Result } from './result.js'
import { success } from './result.js'
import type { Clock } from './time.js'

export interface DomainEvent<TPayload extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  readonly id: string
  readonly name: string
  readonly aggregateId: string
  readonly occurredAt: Date
  readonly payload: TPayload
}

export class DomainEventFactory {
  constructor(private readonly clock: Clock, private readonly ids: IdGenerator) {}

  create<TPayload extends Readonly<Record<string, unknown>>>(input: {
    name: string
    aggregateId: string
    payload: TPayload
  }): DomainEvent<TPayload> {
    return { ...input, id: this.ids.generate(), occurredAt: this.clock.utc() }
  }
}

export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  handle(event: TEvent): Promise<Result<void, DomainError>>
}

export interface DomainEventPublisher {
  publish(events: readonly DomainEvent[]): Promise<Result<void, DomainError>>
}

export interface DomainEventDispatcher {
  register(eventName: string, handler: DomainEventHandler): void
  dispatch(event: DomainEvent): Promise<Result<void, DomainError>>
}

export class InProcessDomainEventDispatcher implements DomainEventDispatcher, DomainEventPublisher {
  private readonly handlers = new Map<string, DomainEventHandler[]>()

  register(eventName: string, handler: DomainEventHandler): void {
    const registered = this.handlers.get(eventName) ?? []
    registered.push(handler)
    this.handlers.set(eventName, registered)
  }

  async dispatch(event: DomainEvent): Promise<Result<void, DomainError>> {
    for (const handler of this.handlers.get(event.name) ?? []) {
      const result = await handler.handle(event)
      if (!result.ok) return result
    }
    return success(undefined)
  }

  async publish(events: readonly DomainEvent[]): Promise<Result<void, DomainError>> {
    for (const event of events) {
      const result = await this.dispatch(event)
      if (!result.ok) return result
    }
    return success(undefined)
  }
}

export interface OutboxEvent {
  readonly id: string
  readonly eventName: string
  readonly aggregateId: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly occurredAt: Date
}

export interface OutboxDispatcher {
  dispatch(events: readonly OutboxEvent[]): Promise<Result<void, DomainError>>
}

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<Result<void, DomainError>>
}
