import { describe, expect, it } from "vitest";
import { PlanItemType, PlanScope, PlanSourceType, PlanStage } from "@travel-guide/constants";
import type { PlanItem } from "@travel-guide/types";
import { buildDedupeKey, calculatePlanProgress, isDuplicatePlanItem } from "../src/index";

function item(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "p1",
    tripId: "t1",
    stage: PlanStage.PREPARING,
    itemType: PlanItemType.VISA_MATERIAL,
    scope: PlanScope.TRIP,
    title: "护照原件",
    description: null,
    sourceType: PlanSourceType.GUIDE,
    sourceId: null,
    sourceCountryCode: null,
    dedupeKey: null,
    dedupeHash: null,
    sortOrder: 0,
    done: false,
    doneAt: null,
    planDate: null,
    ...overrides,
  };
}

describe("PlanItem 去重", () => {
  it("后台配置键优先，跨国家的护照只出现一次", () => {
    const japan = item({ dedupeKey: " Passport ", sourceCountryCode: "JP", sourceId: "jp-passport" });
    const korea = item({ dedupeKey: "passport", sourceCountryCode: "KR", sourceId: "kr-passport" });
    expect(buildDedupeKey(japan)).toBe("k:passport");
    expect(isDuplicatePlanItem([japan], korea)).toBe(true);
  });

  it("来源键包含国家，同名景点可分别加入不同国家", () => {
    const japan = item({ itemType: PlanItemType.ATTRACTION, sourceType: PlanSourceType.ATTRACTION, sourceId: "park", sourceCountryCode: "JP" });
    const korea = item({ ...japan, sourceCountryCode: "KR" });
    expect(buildDedupeKey(japan)).toBe("s:ATTRACTION:JP:park");
    expect(isDuplicatePlanItem([japan], korea)).toBe(false);
  });

  it("无后台键和来源时使用类型、阶段及归一化标题", () => {
    expect(buildDedupeKey(item({ title: "  护照   原件  " }))).toBe("k:VISA_MATERIAL:PREPARING:护照 原件");
    expect(buildDedupeKey(item({ title: "  " }))).toBeNull();
    expect(buildDedupeKey({ title: "护照" })).toBeNull();
    expect(buildDedupeKey(undefined)).toBeNull();
  });

  it("仅在同一 Trip 中判重；无法生成键时不误判", () => {
    const existing = item({ dedupeHash: "k:passport" });
    expect(isDuplicatePlanItem([existing], item({ dedupeKey: "passport", tripId: "t2" }))).toBe(false);
    expect(isDuplicatePlanItem([existing], item({ dedupeKey: "passport" }))).toBe(true);
    expect(isDuplicatePlanItem([existing], item({ title: "", sourceId: null }))).toBe(false);
    expect(isDuplicatePlanItem(null, item({ dedupeKey: "passport" }))).toBe(false);
  });
});

describe("calculatePlanProgress", () => {
  it("空计划为 0%，不会除零", () => {
    expect(calculatePlanProgress(undefined)).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it("只按真实 PlanItem 完成状态计算，百分比取整", () => {
    expect(calculatePlanProgress([item({ done: true }), item({ done: true }), item()]))
      .toEqual({ total: 3, done: 2, percent: 67 });
  });
});
