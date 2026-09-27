CREATE TYPE "TripMemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "TripMemberStatus" AS ENUM ('ACTIVE', 'LEFT');

ALTER TABLE "User" ADD COLUMN "devKey" TEXT;
CREATE UNIQUE INDEX "User_devKey_key" ON "User"("devKey");

CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TripMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "TripMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TripInvite" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 20,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");
CREATE INDEX "TripMember_userId_status_idx" ON "TripMember"("userId", "status");
CREATE INDEX "TripMember_tripId_status_idx" ON "TripMember"("tripId", "status");
CREATE UNIQUE INDEX "TripInvite_tokenHash_key" ON "TripInvite"("tokenHash");
CREATE INDEX "TripInvite_tripId_revokedAt_expiresAt_idx" ON "TripInvite"("tripId", "revokedAt", "expiresAt");

ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripInvite" ADD CONSTRAINT "TripInvite_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripInvite" ADD CONSTRAINT "TripInvite_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TripMember" ("id", "tripId", "userId", "role", "status", "joinedAt", "createdAt", "updatedAt")
SELECT 'owner_' || md5("Trip"."id" || ':' || "Trip"."userId"), "Trip"."id", "Trip"."userId", 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Trip"
ON CONFLICT ("tripId", "userId") DO NOTHING;
