ALTER TABLE "CountryGuideSection"
    ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "CountryGuideSection_countryCode_sourceKey_key"
    ON "CountryGuideSection"("countryCode", "sourceKey");
