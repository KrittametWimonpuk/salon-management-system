import bcrypt from 'bcryptjs'

const dummyHash = '$2a$12$LQv3c1yqBWEsnR3ZpGCHbOe0pCzGZ1PwQ2lZP3QyT2mHv4QxvM5eK'

export interface PasswordService {
  verify(plainText: string, passwordHash: string | null): Promise<boolean>
}

export class BcryptPasswordService implements PasswordService {
  async verify(plainText: string, passwordHash: string | null): Promise<boolean> {
    const matches = await bcrypt.compare(plainText, passwordHash ?? dummyHash)
    return passwordHash !== null && matches
  }
}
