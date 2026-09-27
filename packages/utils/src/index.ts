/** 供通用文本比较使用，保留中文并统一全角字符和空白。 */
export function normalizeText(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    : "";
}
