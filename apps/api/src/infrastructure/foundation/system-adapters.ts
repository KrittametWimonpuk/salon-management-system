import { randomUUID } from 'node:crypto'
import type {
  Counter,
  FeatureFlags,
  Histogram,
  LogContext,
  Logger,
  MetricsRegistry,
  Timer,
} from '../../application/foundation/observability.js'
import type { IdGenerator } from '../../domain/foundation/id-generator.js'
import type { Clock, LocalDate } from '../../domain/foundation/time.js'

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }

  today(): LocalDate {
    return new Date().toISOString().slice(0, 10) as LocalDate
  }

  utc(): Date {
    return new Date()
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime())
  }

  today(): LocalDate {
    return this.instant.toISOString().slice(0, 10) as LocalDate
  }

  utc(): Date {
    return this.now()
  }
}

export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID()
  }
}

export class ConsoleLogger implements Logger {
  debug(message: string, context: LogContext = {}): void { this.write('debug', message, context) }
  info(message: string, context: LogContext = {}): void { this.write('info', message, context) }
  warn(message: string, context: LogContext = {}): void { this.write('warn', message, context) }
  error(message: string, context: LogContext = {}): void { this.write('error', message, context) }

  private write(level: string, message: string, context: LogContext): void {
    const entry = JSON.stringify({ level, message, ...context })
    if (level === 'error') console.error(entry)
    else if (level === 'warn') console.warn(entry)
    else console.log(entry)
  }
}

class NoopCounter implements Counter {
  increment(): void {}
}

class NoopTimer implements Timer {
  stop(): number { return 0 }
}

class NoopHistogram implements Histogram {
  observe(): void {}
}

export class NoopMetricsRegistry implements MetricsRegistry {
  private readonly noOpCounter = new NoopCounter()
  private readonly noOpHistogram = new NoopHistogram()

  counter(): Counter { return this.noOpCounter }
  startTimer(): Timer { return new NoopTimer() }
  histogram(): Histogram { return this.noOpHistogram }
}

export class ConfigFeatureFlags implements FeatureFlags {
  constructor(private readonly flags: Readonly<Record<string, boolean>>) {}

  isEnabled(flag: string): boolean {
    return this.flags[flag] ?? false
  }
}
