export type LocalDate = `${number}-${number}-${number}`

export interface Clock {
  now(): Date
  today(): LocalDate
  utc(): Date
}
