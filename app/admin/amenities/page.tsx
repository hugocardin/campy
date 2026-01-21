"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Trash2 } from "lucide-react";

type Amenity = {
  id: string;
  name: string;
  category_id: number | null;
  created_at: string;
  amenity_categories: { name: string } | null;
};

type Category = {
  id: number;
  name: string;
};

export default function AmenitiesAdmin() {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const loadData = async () => {
      if (ignore) return;

      setLoading(true);
      setError(null);

      // Fetch amenities with category join
      const { data: amenitiesData, error: amenitiesError } = await supabase
        .from("amenities")
        .select(
          `
          id, name, category_id, created_at,
          amenity_categories!left (name)
        `,
        )
        .order("name");

      if (!ignore) {
        if (amenitiesError) {
          setError(amenitiesError.message);
        } else if (amenitiesData) {
          const transformed = amenitiesData.map((item) => ({
            ...item,
            amenity_categories: item.amenity_categories?.[0] ?? null,
          })) as Amenity[];
          setAmenities(transformed);
        }
      }

      // Fetch categories for dropdown
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("amenity_categories")
        .select("id, name")
        .order("name");

      if (!ignore) {
        if (categoriesError) {
          setError(categoriesError.message);
        } else if (categoriesData) {
          setCategories(categoriesData);
        }
        setLoading(false);
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    const { error } = await supabase.from("amenities").insert({
      name: name.trim(),
      category_id: categoryId || null,
    });

    if (error) {
      setError(error.message);
    } else {
      setName("");
      setCategoryId("");

      // Refresh amenities list
      const { data } = await supabase
        .from("amenities")
        .select(
          `
          id, name, category_id, created_at,
          amenity_categories!left (name)
        `,
        )
        .order("name");

      if (data) {
        const transformed = data.map((item) => ({
          ...item,
          amenity_categories: item.amenity_categories?.[0] ?? null,
        })) as Amenity[];
        setAmenities(transformed);
      }
    }

    setSubmitting(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete amenity "${name}"? This action cannot be undone.`))
      return;

    setError(null);
    const { error } = await supabase.from("amenities").delete().eq("id", id);

    if (error) {
      setError(error.message);
    } else {
      setAmenities((prev) => prev.filter((a) => a.id !== id));
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
        Manage Amenities
      </h2>

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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          disabled={submitting || loading}
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
          disabled={submitting || loading}
        >
          <option value="">No category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

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
          {submitting ? "Adding..." : "Add Amenity"}
        </button>
      </form>

      {/* Table / List */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground animate-pulse">
          Loading amenities...
        </div>
      ) : amenities.length === 0 ? (
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
                  className="
                    border-t border-border 
                    hover:bg-muted/20 
                    transition-colors
                  "
                >
                  <td className="p-4 font-medium text-foreground">{a.name}</td>
                  <td className="p-4 text-muted-foreground">
                    {a.amenity_categories?.name || "—"}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(a.id, a.name)}
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
                      title={`Delete ${a.name}`}
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
