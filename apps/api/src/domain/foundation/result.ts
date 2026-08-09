export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function success<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function mapResult<T, U, E>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> {
  return result.ok ? success(mapper(result.value)) : result
}

export function flatMapResult<T, U, E, F>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? mapper(result.value) : result
}

