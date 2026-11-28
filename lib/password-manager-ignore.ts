/**
 * Opt-out hints for password-manager extensions on non-credential fields
 * (search, filters, etc.). Spread onto `<input>` / form controls.
 *
 * These only reduce decoration/autofill targeting. They do **not** stop
 * extensions from mutating ancestor DOM (e.g. `data-protonpass-form` on a
 * filter shell) before React hydrates — use `suppressHydrationWarning` on
 * that node when that is the observed mismatch.
 *
 * Attribute names follow each vendor’s documented / source-derived convention;
 * update this object when vendors change.
 */
export const PASSWORD_MANAGER_IGNORE_PROPS = {
  "data-1p-ignore": "",
  "data-lpignore": "true",
  "data-bwignore": "",
  "data-protonpass-ignore": "true",
  "data-form-type": "other",
} as const;
