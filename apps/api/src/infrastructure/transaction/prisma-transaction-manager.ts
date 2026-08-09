import { Prisma, type PrismaClient } from '@prisma/client'
import type { TransactionManager, TransactionScope } from '../../application/foundation/transaction.js'
import { ConcurrencyError } from '../../domain/foundation/domain-errors.js'
import { failure, type Result } from '../../domain/foundation/result.js'
import { createPrismaRepositories } from '../repositories/prisma-repositories.js'

export class PrismaTransactionManager implements TransactionManager {
  constructor(private readonly database: PrismaClient) {}

  async withTransaction<T, E>(
    work: (scope: TransactionScope) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | ConcurrencyError>> {
    try {
      return await this.database.$transaction(
        async (transaction) => work(createPrismaRepositories(transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return failure(new ConcurrencyError('Transaction conflicted with another operation'))
      }
      throw error
    }
  }
}

