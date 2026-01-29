"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AmenityCategory } from "@/entities/amenity-categories";
import { useRouter } from "next/navigation";
import {
  createAmenityCategoryAction,
  deleteAmenityCategoryAction,
} from "@/app/actions/amenity-categories";

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
      router.refresh(); // Refresh server data
    }

    setSubmitting(false);
  };

  const handleDelete = async (category: AmenityCategory) => {
    if (!confirm(`Delete "${category.code}"? This may affect amenities.`))
      return;

    setError(null);

    const result = await deleteAmenityCategoryAction(category.id);

    if (result.error) {
      setError(result.error);
    } else {
      setCode("");
      router.refresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col sm:flex-row gap-4 max-w-xl"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="New category name (e.g. Services, Facilities, Activities)"
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
        <button
          type="submit"
          disabled={submitting || !code.trim()}
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
          {submitting ? "Adding..." : "Add Category"}
        </button>
      </form>

      {/* Table / List */}
      {initialCategories.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border border-border/50 rounded-lg bg-card/50">
          No categories added yet.
          <br />
          Create your first one above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full border-collapse bg-card">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-4 text-left font-semibold text-foreground">
                  Category Name
                </th>
                <th className="p-4 text-right font-semibold text-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {initialCategories.map((category) => (
                <tr
                  key={category.id}
                  className="border-t border-border hover:bg-muted/20 transition-colors"
                >
                  <td className="p-4 font-medium text-foreground">
                    {category.code}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(category)}
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
                      title="Delete category"
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
