ALTER TYPE "MediaUsage" ADD VALUE 'USER_AVATAR';

ALTER TABLE "User"
  ADD COLUMN "openId" TEXT,
  ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "User_openId_key" ON "User"("openId");
