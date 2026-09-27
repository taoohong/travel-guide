import { describe, expect, it } from "vitest";
import { normalizeText } from "../src/index";

describe("normalizeText", () => {
  it("统一全角字符、空白和大小写，同时保留中文", () => {
    expect(normalizeText("  ＰＡＳＳＰＯＲＴ\t原件  ")).toBe("passport 原件");
  });

  it("缺失文本返回空字符串", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});
