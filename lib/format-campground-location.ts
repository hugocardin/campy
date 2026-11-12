/** Join non-empty location parts (nullable city/province/country, etc.). */
export function formatCampgroundLocation(
  ...parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(", ");
}
