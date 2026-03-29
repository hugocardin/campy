"use client";

import { AmenityCategory } from "@/entities/amenity-categories";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAmenityCategoryAction,
  deleteAmenityCategoryAction,
} from "@/app/actions/amenity-categories";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { DeleteButtonWithConfirmation } from "@/components/dialogs/DeleteButtonWithConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "next-intl";

type Props = {
  initialCategories: AmenityCategory[];
};

export default function AmenityCategoriesClient({ initialCategories }: Props) {
  const tc = useTranslations("common");
  const t_amenityCategories = useTranslations("amenityCategories");

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setSubmitting(true);
    setError(null);

    const result = await createAmenityCategoryAction({ code: code.trim() });

    if (!result.success) {
      setError(result.errorCode);
    } else {
      setCode("");
      router.refresh();
    }

    setSubmitting(false);
  };

  const handleDelete = async (categoryId: number) => {
    setSubmitting(true);
    setError(null);

    const result = await deleteAmenityCategoryAction(categoryId);

    if (!result.success) {
      setError(result.errorCode);
    } else {
      router.refresh();
    }

    setSubmitting(false);
  };

  return (
    <div className="space-y-8">
      {/* Error */}
      <ErrorAlert errorMsg={error}></ErrorAlert>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label htmlFor="category-name">
            {t_amenityCategories("singular")}
          </Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              id="category-name"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t_amenityCategories(
                "form.createCategoryPlaceholder",
              )}
              disabled={submitting}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={submitting || !code.trim()}>
              {submitting ? tc("processing") : tc("add")}
            </Button>
          </div>
        </div>
      </form>

      {/* Categories list */}
      {initialCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-lg font-medium">
            {t_amenityCategories("noResult")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t_amenityCategories("singular")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.code}</TableCell>
                  <TableCell className="text-right">
                    <DeleteButtonWithConfirmation
                      title={t_amenityCategories(
                        "actions.deleteAmenityCategoryTitle",
                      )}
                      description={t_amenityCategories(
                        "actions.confirmAmenityCategoryDeletion",
                        {
                          category: category.code,
                        },
                      )}
                      onConfirm={() => handleDelete(category.id)}
                      disabled={submitting}
                    ></DeleteButtonWithConfirmation>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
