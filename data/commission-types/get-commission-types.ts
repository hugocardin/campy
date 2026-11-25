import { CommissionType } from "@/entities/commission-type";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type CommissionTypeRow = {
  id: number;
  name: string;
};

function toDomain(row: CommissionTypeRow): CommissionType {
  return {
    id: Number(row.id),
    name: String(row.name).trim().toLowerCase(),
  };
}

export const getAllCommissionTypes = cache(
  async (): Promise<ActionResult<CommissionType[]>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase.from("commission_types").select("id, name").order("id"),
      );

      if (!result.success) {
        return result;
      }

      return resultSuccess(
        (result.data as CommissionTypeRow[]).map(toDomain),
      );
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
