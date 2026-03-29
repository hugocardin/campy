"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAmenityAction,
  deleteAmenityAction,
} from "@/app/actions/amenities";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { DeleteButtonWithConfirmation } from "@/components/dialogs/DeleteButtonWithConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Amenity } from "@/entities/amenity";
import { AmenityCategory } from "@/entities/amenity-categories";
import { useTranslations } from "next-intl";

type Props = {
  amenities: Amenity[];
  categories: AmenityCategory[];
};

export default function AmenitiesClient({ amenities, categories }: Props) {
  const tc = useTranslations("common");
  const t_amenities = useTranslations("amenities");
  const t_amenityCategories = useTranslations("amenityCategories");

  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !categoryId) return;

    setSubmitting(true);
    setError(null);

    const result = await createAmenityAction({
      code: code.trim(),
      category_id: Number(categoryId),
    });

    if (!result.success) {
      setError(result.errorCode);
    } else {
      setCode("");
      setCategoryId("");
      router.refresh();
    }

    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setSubmitting(true);

    const result = await deleteAmenityAction(id);

    if (!result.success) {
      setError(result.errorCode);
    } else {
      router.refresh();
    }

    setSubmitting(false);
  };

  return (
    <div className="space-y-8">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="code">{t_amenities("form.amenityLabel")}</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t_amenities("form.amenityPlaceholder")}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t_amenityCategories("singular")}</Label>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t_amenityCategories(
                    "form.selectAmenityCategoryPlaceholder",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !code.trim()}>
            {submitting ? (
              <>
                <span className="mr-2">{tc("processing")}</span>
              </>
            ) : (
              tc("add")
            )}
          </Button>
        </div>
      </form>

      {/* Amenities list */}
      {amenities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">{t_amenities("noResult")}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t_amenities("singular")}</TableHead>
                <TableHead>{t_amenityCategories("singular")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amenities.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.category_code || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteButtonWithConfirmation
                      title={t_amenities("actions.deleteAmenityTitle")}
                      description={t_amenities(
                        "actions.confirmAmenityDeletion",
                        {
                          code: a.code,
                        },
                      )}
                      onConfirm={() => handleDelete(a.id)}
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
