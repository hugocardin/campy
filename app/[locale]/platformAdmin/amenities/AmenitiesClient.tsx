"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAmenityAction,
  deleteAmenityAction,
} from "@/app/actions/amenities";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
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

type Props = {
  amenities: Amenity[];
  categories: AmenityCategory[];
};

export default function AmenitiesClient({ amenities, categories }: Props) {
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState<string>(""); // changed to string for Select value
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
      category_id: Number(categoryId), // convert back to number
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

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete amenity "${code}"? This action cannot be undone.`))
      return;

    setError(null);

    const result = await deleteAmenityAction(id);

    if (!result.success) {
      setError(result.error.message);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-4 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="code">Amenity Name</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. WiFi, Pet friendly, Fire pit"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
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
                <span className="mr-2">Adding...</span>
                {/* Optional: add a spinner if you want */}
              </>
            ) : (
              "Add Amenity"
            )}
          </Button>
        </div>
      </form>

      {/* Amenities list */}
      {amenities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No amenities added yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use the form above to create one.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amenity Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(a.id, a.code)}
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
