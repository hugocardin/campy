type HasMessages = {
  has: (key: string) => boolean;
  (key: string): string;
};

/** Map DB codes like `PET FRIENDLY` → message key `PET_FRIENDLY`. */
export function codeToMessageKey(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Translate a lookup code under `namespacePrefix.*`, falling back to the raw code. */
export function translateCode(
  t: HasMessages,
  namespacePrefix: string,
  code: string | null | undefined,
): string {
  const raw = code?.trim() ?? "";
  if (!raw) return "";
  const key = `${namespacePrefix}.${codeToMessageKey(raw)}`;
  return t.has(key) ? t(key) : raw;
}
