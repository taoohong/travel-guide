import { describe, expect, it } from "vitest";
import { PlanStage, TripStatus } from "@travel-guide/constants";
import type { Trip, TripDestination } from "@travel-guide/types";
import { canTransitionTripStatus, getCurrentTripStage, sortTripDestinations } from "../src/index";

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    userId: "u1",
    title: "东亚之旅",
    status: TripStatus.DRAFT,
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    ...overrides,
  };
}

function destination(id: string, countryCode: string, orderIndex: number): TripDestination {
  return {
    id,
    tripId: "t1",
    countryCode,
    continentCode: "AS",
    cityCode: null,
    orderIndex,
    arrivalDate: null,
    departureDate: null,
    isOrigin: false,
  };
}

describe("TripDestination 排序", () => {
  it("按 orderIndex 排序且不修改输入，允许同一国家再次出现", () => {
    const input = [destination("d3", "JP", 2), destination("d1", "JP", 0), destination("d2", "KR", 1)];
    expect(sortTripDestinations(input).map((entry) => entry.id)).toEqual(["d1", "d2", "d3"]);
    expect(input.map((entry) => entry.id)).toEqual(["d3", "d1", "d2"]);
  });

  it("缺少目的地时返回空列表", () => {
    expect(sortTripDestinations(undefined)).toEqual([]);
  });
});

describe("Trip 当前阶段", () => {
  it("用户确认的阶段优先于日期推断", () => {
    expect(getCurrentTripStage(trip({ status: TripStatus.PREPARING }), "2026-10-05"))
      .toBe(PlanStage.PREPARING);
    expect(getCurrentTripStage(trip({ status: TripStatus.DEPARTING }), "2026-10-05"))
      .toBe(PlanStage.DEPARTING);
    expect(getCurrentTripStage(trip({ status: TripStatus.TRAVELING }), "2026-09-20"))
      .toBe(PlanStage.TRAVELING);
  });

  it("草稿显示准备阶段，已完成显示归程阶段", () => {
    expect(getCurrentTripStage(trip(), "2026-10-05")).toBe(PlanStage.PREPARING);
    expect(getCurrentTripStage(trip({ status: TripStatus.COMPLETED }))).toBe(PlanStage.RETURNING);
    expect(getCurrentTripStage(null)).toBe(PlanStage.PREPARING);
  });

  it("未知状态才按注入日期兜底，不读取系统时钟", () => {
    const unknown = trip({ status: "INVALID" as Trip["status"] });
    expect(getCurrentTripStage(unknown, "2026-09-20")).toBe(PlanStage.PREPARING);
    expect(getCurrentTripStage(unknown, "2026-10-01")).toBe(PlanStage.DEPARTING);
    expect(getCurrentTripStage(unknown, "2026-10-05")).toBe(PlanStage.TRAVELING);
    expect(getCurrentTripStage(unknown, "2026-10-11")).toBe(PlanStage.RETURNING);
  });
});

it("只有相邻状态可由用户确认切换", () => {
  expect(canTransitionTripStatus(TripStatus.DRAFT, TripStatus.PREPARING)).toBe(true);
  expect(canTransitionTripStatus(TripStatus.TRAVELING, TripStatus.DEPARTING)).toBe(true);
  expect(canTransitionTripStatus(TripStatus.PREPARING, TripStatus.COMPLETED)).toBe(false);
  expect(canTransitionTripStatus(TripStatus.PREPARING, TripStatus.PREPARING)).toBe(false);
});
