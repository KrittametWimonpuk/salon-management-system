export type LogContext = Readonly<Record<string, unknown>>

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

export interface Counter {
  increment(value?: number, labels?: Readonly<Record<string, string>>): void
}

export interface Timer {
  stop(labels?: Readonly<Record<string, string>>): number
}

export interface Histogram {
  observe(value: number, labels?: Readonly<Record<string, string>>): void
}

export interface MetricsRegistry {
  counter(name: string): Counter
  startTimer(name: string): Timer
  histogram(name: string): Histogram
}

export interface FeatureFlags {
  isEnabled(flag: string): boolean
}
