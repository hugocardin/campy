"use client";

import {
  createAmenityCategoryAction,
  deleteAmenityCategoryAction,
} from "@/actions/amenity-categories";
import { AmenityCategory } from "@/entities/amenity-categories";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type Props = {
  initialCategories: AmenityCategory[];
};

export default function AmenityCategoriesClient({ initialCategories }: Props) {
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

    if (result.error) {
      setError(result.error);
    } else {
      setCode("");
      router.refresh();
    }

    setSubmitting(false);
  };

  const handleDelete = async (category: AmenityCategory) => {
    if (
      !confirm(
        `Delete "${category.code}"? This may affect associated amenities.`,
      )
    )
      return;

    setError(null);

    const result = await deleteAmenityCategoryAction(category.id);

    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label htmlFor="category-name">Category Name</Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              id="category-name"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. Services, Facilities, Activities"
              disabled={submitting}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={submitting || !code.trim()}>
              {submitting ? "Adding..." : "Add Category"}
            </Button>
          </div>
        </div>
      </form>

      {/* Categories list */}
      {initialCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-lg font-medium">
            No categories yet
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first amenity category using the form above.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.code}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(category)}
                      className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
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
