CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "participantUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripExpense_tripId_createdAt_idx" ON "TripExpense"("tripId", "createdAt");
CREATE INDEX "TripExpense_payerUserId_idx" ON "TripExpense"("payerUserId");

ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_tripId_fkey"
FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_payerUserId_fkey"
FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
