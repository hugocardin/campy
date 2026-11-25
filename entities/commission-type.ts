export interface CommissionType {
  id: number;
  /** DB `commission_types.name` — currently `percent` | `fixed`. */
  name: string;
}
