"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { createSiteAction } from "@/app/actions/site-admin.ts";
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
import { Textarea } from "@/components/ui/textarea";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { SiteType } from "@/entities/site-type";
import { cn } from "@/lib/utils";

type Props = {
  campground: CampgroundAdmin;
  siteTypes: SiteType[];
};

type FormData = {
  name: string;
  description: string;
  site_type_id: string;
  max_rig_length: string;
  price_per_night: string;
  min_stay_nights: string;
};

export default function SiteCreateClient({ campground, siteTypes }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    description: "",
    site_type_id: "",
    max_rig_length: "",
    price_per_night: "",
    min_stay_nights: "",
  });

  const isFormValid = Boolean(
    form.name.trim() &&
    form.site_type_id &&
    !isNaN(parseFloat(form.price_per_night)) &&
    !isNaN(parseFloat(form.min_stay_nights)),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const maxRigLengthNum = parseFloat(form.max_rig_length);
    const pricePerNightNum = parseFloat(form.price_per_night);
    const minStayNightsNum = parseFloat(form.min_stay_nights);
    const siteTypeNum = parseFloat(form.site_type_id);

    // Client-side validation
    if (!form.name.trim()) {
      setError("Site name is required");
      return;
    }
    if (!form.description) {
      setError("Please select an owner");
      return;
    }
    if (!form.site_type_id) {
      setError("Please select a site type");
      return;
    }
    if (!form.description) {
      setError("Please select an owner");
      return;
    }
    if (!isNaN(maxRigLengthNum) && maxRigLengthNum < 0) {
      setError("Please fill the max rig length");
      return;
    }
    if (isNaN(pricePerNightNum) || pricePerNightNum < 0) {
      setError("Please fill the price per night");
      return;
    }
    if (isNaN(minStayNightsNum) || minStayNightsNum < 0) {
      setError("Please fill the minimum stay nights");
      return;
    }

    const payload = {
      ...form,
      site_type_id: siteTypeNum,
      max_rig_length: maxRigLengthNum,
      price_per_night: pricePerNightNum,
      min_stay_nights: minStayNightsNum,
    };

    startTransition(async () => {
      const result = await createSiteAction(campground.id, payload);

      if (!result.success) {
        setError(result.error.message);
      }
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSiteTypeChange = (value: string) => {
    setForm((prev) => ({ ...prev, site_type_id: value }));
    setError(null);
  };

  const sortedSiteTypes = [...siteTypes].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  return (
    <div className="space-y-10">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      <form id="site-form" onSubmit={handleSubmit} className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1.5"
                placeholder="Enter site name"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                className="mt-1.5 resize-y"
                placeholder="Describe the site..."
              />
            </div>

            <div>
              <Label htmlFor="max_rig_length">Max rig length</Label>
              <Input
                id="max_rig_length"
                name="max_rig_length"
                value={form.max_rig_length}
                onChange={handleChange}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="site_type_id">Site type</Label>
              <Select
                value={form.site_type_id}
                onValueChange={handleSiteTypeChange}
                required
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {sortedSiteTypes.map((siteType) => (
                    <SelectItem key={siteType.id} value={String(siteType.id)}>
                      {siteType.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="price_per_night">Price per night</Label>
              <Input
                id="price_per_night"
                name="price_per_night"
                value={form.price_per_night}
                onChange={handleChange}
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min_stay_nights">Minimal stay nights</Label>
                <Input
                  id="min_stay_nights"
                  name="min_stay_nights"
                  value={form.min_stay_nights}
                  onChange={handleChange}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                form="site-form"
                disabled={isPending || !isFormValid}
                size="lg"
                className={cn(
                  "min-w-40",
                  (isPending || !isFormValid) &&
                    "opacity-70 cursor-not-allowed",
                )}
              >
                {isPending ? (
                  "Saving..."
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
