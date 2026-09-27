CREATE TABLE "UserAnchor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tripId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAnchor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAnchor_userId_type_key" ON "UserAnchor"("userId", "type");
CREATE INDEX "UserAnchor_userId_occurredAt_idx" ON "UserAnchor"("userId", "occurredAt");
CREATE INDEX "UserAnchor_tripId_idx" ON "UserAnchor"("tripId");

ALTER TABLE "UserAnchor" ADD CONSTRAINT "UserAnchor_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAnchor" ADD CONSTRAINT "UserAnchor_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
