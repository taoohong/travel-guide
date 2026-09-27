CREATE TABLE "PlanItemCompletion" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanItemCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanItemCompletion_planItemId_userId_key" ON "PlanItemCompletion"("planItemId", "userId");
CREATE INDEX "PlanItemCompletion_userId_idx" ON "PlanItemCompletion"("userId");

ALTER TABLE "PlanItemCompletion" ADD CONSTRAINT "PlanItemCompletion_planItemId_fkey"
FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanItemCompletion" ADD CONSTRAINT "PlanItemCompletion_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlanItemCompletion" ("id", "planItemId", "userId", "completedAt")
SELECT md5("PlanItem"."id" || ':' || "TripMember"."userId"), "PlanItem"."id", "TripMember"."userId",
       COALESCE("PlanItem"."doneAt", CURRENT_TIMESTAMP)
FROM "PlanItem"
JOIN "TripMember" ON "TripMember"."tripId" = "PlanItem"."tripId" AND "TripMember"."status" = 'ACTIVE'
WHERE "PlanItem"."done" = true;
