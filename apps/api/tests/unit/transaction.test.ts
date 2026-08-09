import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { success } from '../../src/domain/foundation/result.js'
import { PrismaTransactionManager } from '../../src/infrastructure/transaction/prisma-transaction-manager.js'

describe('PrismaTransactionManager', () => {
  it('provides transaction-bound repositories to the callback', async () => {
    const transactionClient = {}
    const database = {
      $transaction: vi.fn(async (work: (client: object) => Promise<unknown>) => work(transactionClient)),
    }
    const manager = new PrismaTransactionManager(database as never)

    const result = await manager.withTransaction(async (scope) => {
      expect(scope.customers).toBeDefined()
      expect(scope.payments).toBeDefined()
      return success('committed')
    })

    expect(result).toEqual({ ok: true, value: 'committed' })
    expect(database.$transaction).toHaveBeenCalledOnce()
  })

  it('translates Prisma write conflicts into a domain concurrency failure', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034', clientVersion: '5.22.0',
    })
    const database = { $transaction: vi.fn().mockRejectedValue(conflict) }
    const manager = new PrismaTransactionManager(database as never)

    const result = await manager.withTransaction(async () => success('unreachable'))

    expect(result).toMatchObject({ ok: false, error: { code: 'CONCURRENCY' } })
  })
})

