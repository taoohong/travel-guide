ALTER TABLE "User" ADD COLUMN "uid" TEXT;
UPDATE "User" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
ALTER TABLE "User" ALTER COLUMN "uid" SET NOT NULL;
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");

CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AuthIdentity" ("id", "userId", "provider", "providerUserId", "updatedAt")
SELECT 'auth_' || md5('WECHAT:' || "openId"), "id", 'WECHAT_MINI_PROGRAM', "openId", CURRENT_TIMESTAMP
FROM "User" WHERE "openId" IS NOT NULL;

INSERT INTO "AuthIdentity" ("id", "userId", "provider", "providerUserId", "updatedAt")
SELECT 'auth_' || md5('DEVELOPMENT:' || "devKey"), "id", 'DEVELOPMENT', "devKey", CURRENT_TIMESTAMP
FROM "User" WHERE "devKey" IS NOT NULL;

CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "AuthIdentity"("provider", "providerUserId");
CREATE INDEX "AuthIdentity_userId_provider_idx" ON "AuthIdentity"("userId", "provider");
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "User_openId_key";
DROP INDEX "User_devKey_key";
ALTER TABLE "User" DROP COLUMN "openId", DROP COLUMN "devKey";
