ALTER TABLE "CountryGuideSection"
    ADD COLUMN "effectiveFrom" TIMESTAMP(3),
    ADD COLUMN "effectiveTo" TIMESTAMP(3);

CREATE TABLE "CountryMedia" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CountryMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CountryMedia_countryCode_mediaAssetId_key"
    ON "CountryMedia"("countryCode", "mediaAssetId");

CREATE INDEX "CountryMedia_countryCode_sortOrder_idx"
    ON "CountryMedia"("countryCode", "sortOrder");

ALTER TABLE "CountryMedia"
    ADD CONSTRAINT "CountryMedia_countryCode_fkey"
    FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE;
