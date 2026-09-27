import { CONTENT_MODULES } from "@travel-guide/constants";
import type { ContentVersionDiff, ContentVersionSnapshot } from "@travel-guide/types";

function version(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** 本地缺失按 0 处理；服务端也为 0 时不触发刷新。 */
export function diffContentVersion(
  local: Partial<ContentVersionSnapshot> | null | undefined,
  server: Partial<ContentVersionSnapshot> | null | undefined,
): ContentVersionDiff {
  const diffs = CONTENT_MODULES.map((module) => {
    const current = version(local?.[module]);
    const remote = version(server?.[module]);
    return { module, local: current, server: remote, changed: current !== remote };
  });
  return { diffs, changedModules: diffs.filter((diff) => diff.changed).map((diff) => diff.module) };
}
