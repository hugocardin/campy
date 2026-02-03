"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AmenityCategory } from "@/entities/amenity-categories";
import { Amenity } from "@/entities/amenity";
import { useRouter } from "next/navigation";
import {
  createAmenityAction,
  deleteAmenityAction,
} from "@/app/actions/amenities";

type Props = {
  amenities: Amenity[];
  categories: AmenityCategory[];
};

export default function AmenitiesClient({ amenities, categories }: Props) {
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
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
      category_id: categoryId,
    });

    if (result.error) {
      setError(result.error);
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

    if (result.error) {
      setError(result.error);
    } else {
      setCode("");
      setCategoryId("");
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col sm:flex-row gap-4 max-w-2xl"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Amenity name (e.g. WiFi, Pet friendly, Fire pit)"
          className="
            flex-1 px-4 py-3 
            bg-background 
            border border-border 
            rounded-lg 
            text-foreground 
            placeholder:text-muted-foreground 
            focus:ring-2 focus:ring-primary 
            focus:border-primary 
            outline-none 
            transition
          "
          required
          disabled={submitting}
        />

        <select
          value={categoryId}
          onChange={(e) =>
            setCategoryId(e.target.value ? Number(e.target.value) : "")
          }
          className="
            px-4 py-3 
            bg-background 
            border border-border 
            rounded-lg 
            text-foreground 
            min-w-45 
            focus:ring-2 focus:ring-primary 
            focus:border-primary 
            outline-none 
            transition
          "
          disabled={submitting}
        >
          <option value="">No category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.code}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={submitting || !code.trim() || !categoryId}
          className="
            px-6 py-3 
            bg-primary 
            text-primary-foreground 
            font-medium 
            rounded-lg 
            hover:bg-primary-hover 
            focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
            disabled:opacity-50 disabled:cursor-not-allowed 
            transition-all shadow-sm
            flex items-center gap-2
          "
        >
          {submitting ? "Adding..." : "Add Amenity"}
        </button>
      </form>

      {/* Table / List */}
      {amenities.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border border-border/50 rounded-lg bg-card/50">
          No amenities added yet.
          <br />
          Create one using the form above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full border-collapse bg-card">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-4 text-left font-semibold text-foreground">
                  Amenity Name
                </th>
                <th className="p-4 text-left font-semibold text-foreground">
                  Category
                </th>
                <th className="p-4 text-right font-semibold text-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {amenities.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border hover:bg-muted/20 transition-colors"
                >
                  <td className="p-4 font-medium text-foreground">{a.code}</td>
                  <td className="p-4 text-muted-foreground">
                    {a.category_code || "—"}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(a.id, a.code)}
                      className="
                        inline-flex items-center gap-1.5
                        px-3 py-1.5 
                        text-sm font-medium 
                        text-destructive 
                        hover:text-destructive/80 
                        hover:bg-destructive/10 
                        rounded-md 
                        transition-colors
                      "
                      title={`Delete ${a.code}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
