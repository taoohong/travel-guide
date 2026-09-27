import { describe, expect, it } from "vitest";
import { ContentStatus, VisaRequirementType, VisaType } from "@travel-guide/constants";
import type { VisaPolicy } from "@travel-guide/types";
import { buildVisaPolicyKey, getVisaFreshness, matchVisaPolicy } from "../src/index";

function policy(passportRegion: string, destinationCountryCode: string, visaType: VisaType = VisaType.UNKNOWN): VisaPolicy {
  return {
    passportRegion,
    destinationCountryCode,
    visaType,
    title: "签证政策",
    corePolicy: [],
    maxStayDays: null,
    fee: null,
    processingTime: null,
    requirements: [],
    notes: [],
    sourceName: "官方来源",
    sourceUrl: null,
    sourceProvider: null,
    visaRequirement: VisaRequirementType.UNKNOWN,
    passportRequired: null,
    passportValidityMonths: null,
    passportValidityRequirement: null,
    entrySummary: null,
    requirementText: null,
    retrievedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    lastVerifiedAt: null,
    version: 1,
    status: ContentStatus.PUBLISHED,
  };
}

describe("签证政策", () => {
  it("缓存键同时包含护照地区和目的地，拒绝非法代码", () => {
    expect(buildVisaPolicyKey(" cn ", "jp")).toBe("visa_CN_JP");
    expect(buildVisaPolicyKey("SG", "JP")).not.toBe(buildVisaPolicyKey("CN", "JP"));
    expect(buildVisaPolicyKey("CN", "JPN")).toBeNull();
  });

  it("精确匹配优先于两个兜底政策", () => {
    const exact = policy("CN", "JP", VisaType.VISA_REQUIRED);
    const result = matchVisaPolicy([policy("*", "JP"), policy("CN", "*"), exact], "CN", "JP");
    expect(result).toEqual({ policy: exact, matchLevel: "exact" });
  });

  it("护照地区通用政策优先于目的地全局政策", () => {
    const regional = policy("CN", "*");
    expect(matchVisaPolicy([policy("*", "JP"), regional], "CN", "JP"))
      .toEqual({ policy: regional, matchLevel: "region-fallback" });
  });

  it("最后才使用目的地全局政策；无匹配返回空视图", () => {
    const global = policy("*", "JP");
    expect(matchVisaPolicy([global], "SG", "JP")).toEqual({ policy: global, matchLevel: "global-fallback" });
    expect(matchVisaPolicy([global], "SG", "KR")).toEqual({ policy: null, matchLevel: "none" });
    expect(matchVisaPolicy(null, "CN", "JP")).toEqual({ policy: null, matchLevel: "none" });
  });

  it("同一目的地会按护照地区得到不同结论", () => {
    const policies = [policy("CN", "JP", VisaType.VISA_REQUIRED), policy("SG", "JP", VisaType.VISA_FREE)];
    expect(matchVisaPolicy(policies, "CN", "JP").policy?.visaType).toBe(VisaType.VISA_REQUIRED);
    expect(matchVisaPolicy(policies, "SG", "JP").policy?.visaType).toBe(VisaType.VISA_FREE);
  });
});

it("签证超过 90 天未确认时提示过期，未知确认时间不伪装为新鲜", () => {
  expect(getVisaFreshness(policy("CN", "JP"), new Date("2026-09-20"))).toEqual({
    expired: true, daysSinceVerified: null, freshnessMessage: "该政策尚未确认",
  });
  expect(getVisaFreshness({ ...policy("CN", "JP"), lastVerifiedAt: "2026-06-01" }, new Date("2026-09-20")).expired).toBe(true);
  expect(getVisaFreshness({ ...policy("CN", "JP"), lastVerifiedAt: "2026-09-19" }, new Date("2026-09-20")).expired).toBe(false);
});
