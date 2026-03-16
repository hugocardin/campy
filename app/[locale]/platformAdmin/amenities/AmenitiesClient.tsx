"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAmenityAction,
  deleteAmenityAction,
} from "@/app/actions/amenities";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { DeleteButton } from "@/components/buttons/DeleteButton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
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
  const t = useTranslations("AdminAmenitiesPage");
  const t_amenity = useTranslations("entities.amenity");
  const t_amenityCategory = useTranslations("entities.amenityCategory");

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
      setError(result.error.message);
    } else {
      setCode("");
      setCategoryId("");
      router.refresh();
    }

    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    console.log("test : in handleDelete");
    setError(null);
    setSubmitting(true);

    const result = await deleteAmenityAction(id);

    if (!result.success) {
      setError(result.error.message);
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
            <Label htmlFor="code">{t_amenity("amenityLabel")}</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t_amenity("amenityPlaceholder")}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              {t_amenityCategory("amenityCategory")}
            </Label>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t_amenityCategory("amenityCategoryPlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t_amenityCategory("noAmenityCategory")}
                </SelectItem>
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
          <p className="text-muted-foreground">{t("noAmenity")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("useFormToCreateOne")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t_amenity("amenity")}</TableHead>
                <TableHead>{t_amenityCategory("amenityCategory")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
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
                    {/* <ConfirmDialog
                      onConfirm={() => handleDelete(a.id)}
                      title={t("deleteAmenityTitle")}
                      description={t("confirmAmenityDeletion", {
                        code: a.code,
                      })}
                    > */}
                    <DeleteButton
                      disabled={submitting}
                      onConfirm={() => handleDelete(a.id)}
                    />
                    {/* </ConfirmDialog> */}
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
