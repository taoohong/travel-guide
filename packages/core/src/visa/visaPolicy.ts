import type { VisaMatchLevel, VisaPolicy } from "@travel-guide/types";

function code(value: string, allowWildcard = true): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && (normalized === "*" ? allowWildcard : /^[A-Z]{2}$/.test(normalized))
    ? normalized
    : null;
}

/** 与签证缓存使用同一键，护照地区和目的地都参与区分。 */
export function buildVisaPolicyKey(passportRegion: string, destinationCountryCode: string): string | null {
  const passport = code(passportRegion);
  const destination = code(destinationCountryCode);
  return passport && destination ? `visa_${passport}_${destination}` : null;
}

export function matchVisaPolicy(
  policies: readonly VisaPolicy[] | null | undefined,
  passportRegion: string,
  destinationCountryCode: string,
): { policy: VisaPolicy | null; matchLevel: VisaMatchLevel } {
  const passport = code(passportRegion, false);
  const destination = code(destinationCountryCode, false);
  if (!passport || !destination) return { policy: null, matchLevel: "none" };

  const matches = (region: string, country: string) =>
    (policies ?? []).find((policy) =>
      code(policy.passportRegion) === region && code(policy.destinationCountryCode) === country,
    ) ?? null;

  const exact = matches(passport, destination);
  if (exact) return { policy: exact, matchLevel: "exact" };
  const regional = matches(passport, "*");
  if (regional) return { policy: regional, matchLevel: "region-fallback" };
  const global = matches("*", destination);
  if (global) return { policy: global, matchLevel: "global-fallback" };
  return { policy: null, matchLevel: "none" };
}

export function getVisaFreshness(
  policy: Pick<VisaPolicy, "lastVerifiedAt" | "effectiveFrom" | "effectiveTo"> | null,
  now: Date = new Date(),
): { expired: boolean; daysSinceVerified: number | null; freshnessMessage: string } {
  if (!policy) return { expired: false, daysSinceVerified: null, freshnessMessage: "未维护签证政策" };
  const verified = policy.lastVerifiedAt ? new Date(policy.lastVerifiedAt).getTime() : NaN;
  const daysSinceVerified = Number.isFinite(verified) ? Math.max(0, Math.floor((now.getTime() - verified) / 86_400_000)) : null;
  const beforeStart = policy.effectiveFrom && now.getTime() < new Date(policy.effectiveFrom).getTime();
  const afterEnd = policy.effectiveTo && now.getTime() > new Date(policy.effectiveTo).getTime();
  const expired = Boolean(beforeStart || afterEnd || daysSinceVerified === null || daysSinceVerified > 90);
  return {
    expired,
    daysSinceVerified,
    freshnessMessage: daysSinceVerified === null ? "该政策尚未确认" : expired ? `该政策已 ${daysSinceVerified} 天未确认，请核对官方信息` : `该政策 ${daysSinceVerified} 天前已确认`,
  };
}
