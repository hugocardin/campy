"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import {
  createAmenityCategory,
  deleteAmenityCategory,
  getAllAmenityCategories,
} from "@/data/amenities-categories/get-amenities-categories";
import { AmenityCategory } from "@/entities/amenity-categories";

export default function AmenityCategoriesAdmin() {
  const [categories, setCategories] = useState<AmenityCategory[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      if (ignore) return;

      setLoading(true);
      setError(null);

      const data = await getAllAmenityCategories();

      if (!ignore) {
        if (data) {
          setCategories(data);
        }
        setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    await createAmenityCategory({ name: name });

    setName("");
    // Refresh without full reload — but call the same safe fetch
    const data = await getAllAmenityCategories();
    if (data) setCategories(data);

    setSubmitting(false);
  };

  const handleDelete = async (amenityCategory: AmenityCategory) => {
    if (
      !confirm(`Delete "${amenityCategory.name}"? This may affect amenities.`)
    )
      return;

    setError(null);
    await deleteAmenityCategory(amenityCategory.id);

    setCategories((prev) =>
      prev.filter((amCat) => amCat.id !== amenityCategory.id),
    );
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
        Manage Amenity Categories
      </h2>

      {/* Error message (global for the page) */}
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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          disabled={submitting || loading}
        />
        <button
          type="submit"
          disabled={submitting || loading || !name.trim()}
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
      {loading ? (
        <div className="py-12 text-center text-muted-foreground animate-pulse">
          Loading categories...
        </div>
      ) : categories.length === 0 ? (
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
              {categories.map((amenityCategory) => (
                <tr
                  key={amenityCategory.id}
                  className="
                    border-t border-border 
                    hover:bg-muted/20 
                    transition-colors
                  "
                >
                  <td className="p-4 font-medium text-foreground">
                    {amenityCategory.name}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(amenityCategory)}
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
