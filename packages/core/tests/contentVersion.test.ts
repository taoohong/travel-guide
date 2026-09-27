import { describe, expect, it } from "vitest";
import { ContentModule, CONTENT_MODULES } from "@travel-guide/constants";
import { diffContentVersion } from "../src/index";

describe("ContentVersion diff", () => {
  it("只标记版本变化的模块，本地缺失且服务端为 0 不刷新", () => {
    const result = diffContentVersion(
      { country: 12, visa: 27 },
      { country: 12, visa: 28, attraction: 0 },
    );
    expect(result.changedModules).toEqual([ContentModule.VISA]);
    expect(result.diffs.find((diff) => diff.module === ContentModule.ATTRACTION))
      .toEqual({ module: "attraction", local: 0, server: 0, changed: false });
  });

  it("服务端版本回退也视为变化，客户端需重新获取", () => {
    expect(diffContentVersion({ visa: 5 }, { visa: 4 }).changedModules).toEqual([ContentModule.VISA]);
  });

  it("完全缺失的版本快照等同于所有模块版本 0", () => {
    const result = diffContentVersion(null, undefined);
    expect(result.changedModules).toEqual([]);
    expect(result.diffs).toHaveLength(CONTENT_MODULES.length);
  });
});
