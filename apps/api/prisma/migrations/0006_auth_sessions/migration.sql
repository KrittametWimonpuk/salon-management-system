-- AuthSession is the minimal persistence required for refresh-token rotation,
-- immediate logout, token-family revocation, and refresh-token reuse detection.
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenFamilyId" UUID NOT NULL,
    "refreshTokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" VARCHAR(80),
    "rotatedToSessionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_refreshTokenHash_check" CHECK ("refreshTokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "AuthSession_expiry_check" CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "AuthSession_revocation_check" CHECK ("revocationReason" IS NULL OR "revokedAt" IS NOT NULL),
    CONSTRAINT "AuthSession_rotation_check" CHECK ("rotatedToSessionId" IS NULL OR "revokedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");
CREATE UNIQUE INDEX "AuthSession_rotatedToSessionId_key" ON "AuthSession"("rotatedToSessionId");
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AuthSession_tokenFamilyId_revokedAt_idx" ON "AuthSession"("tokenFamilyId", "revokedAt");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_rotatedToSessionId_fkey"
    FOREIGN KEY ("rotatedToSessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
