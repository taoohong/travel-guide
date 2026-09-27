-- Add the isolated countryGuide content version value.
ALTER TYPE "ContentModule" ADD VALUE 'countryGuide';

CREATE TYPE "VisaRequirementType" AS ENUM (
    'REQUIRED',
    'VISA_FREE',
    'VISA_ON_ARRIVAL',
    'E_VISA',
    'CONDITIONAL',
    'UNKNOWN'
);

CREATE TYPE "CountryGuideSectionCategory" AS ENUM (
    'COUNTRY_OVERVIEW',
    'ENTRY_RESIDENCE',
    'TRAVEL_RISK',
    'SAFETY',
    'TRANSPORT',
    'PRICE_MEDICAL',
    'PRACTICAL_INFO'
);

ALTER TABLE "VisaPolicy"
    ADD COLUMN "visaRequirement" "VisaRequirementType" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "passportRequired" BOOLEAN,
    ADD COLUMN "passportValidityMonths" INTEGER,
    ADD COLUMN "passportValidityRequirement" TEXT,
    ADD COLUMN "entrySummary" TEXT,
    ADD COLUMN "requirementText" TEXT,
    ADD COLUMN "sourceProvider" TEXT,
    ADD COLUMN "retrievedAt" TIMESTAMP(3);

CREATE TABLE "CountryGuideSection" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "category" "CountryGuideSectionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceProvider" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryGuideSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountryGuideSection_countryCode_category_sortOrder_idx"
    ON "CountryGuideSection"("countryCode", "category", "sortOrder");

ALTER TABLE "CountryGuideSection"
    ADD CONSTRAINT "CountryGuideSection_countryCode_fkey"
    FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE;
