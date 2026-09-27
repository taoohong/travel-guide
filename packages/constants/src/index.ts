export const TripStatus = {
  DRAFT: "DRAFT",
  PREPARING: "PREPARING",
  DEPARTING: "DEPARTING",
  TRAVELING: "TRAVELING",
  RETURNING: "RETURNING",
  COMPLETED: "COMPLETED",
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

export const TripMemberRole = { OWNER: "OWNER", MEMBER: "MEMBER" } as const;
export type TripMemberRole = (typeof TripMemberRole)[keyof typeof TripMemberRole];
export const TripMemberStatus = { ACTIVE: "ACTIVE", LEFT: "LEFT" } as const;
export type TripMemberStatus = (typeof TripMemberStatus)[keyof typeof TripMemberStatus];
export const UserAnchorType = {
  FIRST_USED: "FIRST_USED",
  FIRST_LOGIN: "FIRST_LOGIN",
  FIRST_TRIP_CREATED: "FIRST_TRIP_CREATED",
  FIRST_TRIP_STARTED: "FIRST_TRIP_STARTED",
  FIRST_TRIP_COMPLETED: "FIRST_TRIP_COMPLETED",
  FIRST_TEAMED_UP: "FIRST_TEAMED_UP",
} as const;
export type UserAnchorType = (typeof UserAnchorType)[keyof typeof UserAnchorType];
export const TRIP_INVITE_TTL_DAYS = 7;
export const TRIP_INVITE_MAX_USES = 20;
export const TRIP_INVITE_PREVIEW_RATE_LIMIT = 50;
export const TRIP_INVITE_JOIN_RATE_LIMIT = 20;
export const TRIP_INVITE_RATE_WINDOW_MS = 60_000;

export const PlanStage = {
  PREPARING: "PREPARING",
  DEPARTING: "DEPARTING",
  TRAVELING: "TRAVELING",
  RETURNING: "RETURNING",
} as const;
export type PlanStage = (typeof PlanStage)[keyof typeof PlanStage];

export const PlanItemType = {
  VISA_MATERIAL: "VISA_MATERIAL",
  PACKING_ITEM: "PACKING_ITEM",
  ATTRACTION: "ATTRACTION",
} as const;
export type PlanItemType = (typeof PlanItemType)[keyof typeof PlanItemType];

export const PlanScope = {
  TRIP: "TRIP",
  COUNTRY: "COUNTRY",
  DESTINATION: "DESTINATION",
} as const;
export type PlanScope = (typeof PlanScope)[keyof typeof PlanScope];

export const PlanSourceType = {
  GUIDE: "GUIDE",
  ATTRACTION: "ATTRACTION",
  USER: "USER",
} as const;
export type PlanSourceType = (typeof PlanSourceType)[keyof typeof PlanSourceType];

export const VisaType = {
  UNKNOWN: "UNKNOWN",
  VISA_REQUIRED: "VISA_REQUIRED",
  VISA_FREE: "VISA_FREE",
} as const;
export type VisaType = (typeof VisaType)[keyof typeof VisaType];

export const VisaRequirementType = {
  REQUIRED: "REQUIRED",
  VISA_FREE: "VISA_FREE",
  VISA_ON_ARRIVAL: "VISA_ON_ARRIVAL",
  E_VISA: "E_VISA",
  CONDITIONAL: "CONDITIONAL",
  UNKNOWN: "UNKNOWN",
} as const;
export type VisaRequirementType = (typeof VisaRequirementType)[keyof typeof VisaRequirementType];

export const ContentStatus = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const ContentModule = {
  COUNTRY: "country",
  COUNTRY_GUIDE: "countryGuide",
  VISA: "visa",
  ATTRACTION: "attraction",
  TRANSPORT: "transport",
  PACKING: "packing",
  TRAVEL_TIP: "travelTip",
  CITY: "city",
} as const;
export type ContentModule = (typeof ContentModule)[keyof typeof ContentModule];

export const CountryGuideSectionKey = {
  COUNTRY_OVERVIEW: "COUNTRY_OVERVIEW",
  ENTRY_RESIDENCE: "ENTRY_RESIDENCE",
  TRAVEL_RISK: "TRAVEL_RISK",
  SAFETY: "SAFETY",
  TRANSPORT: "TRANSPORT",
  PRICE_MEDICAL: "PRICE_MEDICAL",
  PRACTICAL_INFO: "PRACTICAL_INFO",
} as const;
export type CountryGuideSectionKey = (typeof CountryGuideSectionKey)[keyof typeof CountryGuideSectionKey];

export const CONTENT_MODULES = Object.values(ContentModule);
