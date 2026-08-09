import type { ConcurrencyError } from '../../domain/foundation/domain-errors.js'
import type { Result } from '../../domain/foundation/result.js'
import type { RepositorySet } from './repositories.js'

export type TransactionScope = RepositorySet

export interface TransactionManager {
  withTransaction<T, E>(
    work: (scope: TransactionScope) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | ConcurrencyError>>
}
