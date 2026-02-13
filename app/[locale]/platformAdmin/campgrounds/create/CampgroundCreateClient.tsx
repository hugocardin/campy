"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { createCampgroundAction } from "@/app/actions/campgrounds-admin";
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
import { UserProfileNoRole } from "@/entities/user-profile";
import { cn } from "@/lib/utils";

type FormData = {
  name: string;
  owner_id: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  website: string;
  phone: string;
  location: {
    lat: string;
    lng: string;
  };
};

type Props = {
  owners: UserProfileNoRole[];
};

export default function CampgroundCreateClient({ owners }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    owner_id: "",
    description: "",
    address: "",
    city: "",
    province: "",
    country: "",
    website: "",
    phone: "",
    location: {
      lat: "",
      lng: "",
    },
  });

  const isFormValid = Boolean(
    form.name.trim() &&
    form.owner_id &&
    form.location.lat.trim() &&
    form.location.lng.trim() &&
    !isNaN(parseFloat(form.location.lat)) &&
    !isNaN(parseFloat(form.location.lng)),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(form.location.lat);
    const lngNum = parseFloat(form.location.lng);

    // Basic client-side validation for required fields
    if (!form.name.trim()) {
      setError("Campground name is required");
      return;
    }
    if (!form.owner_id) {
      setError("Please select an owner");
      return;
    }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError("Latitude must be between -90 and +90");
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError("Longitude must be between -180 and +180");
      return;
    }

    // Convert lat/lng to numbers for the action
    const payload = {
      ...form,
      location: {
        lat: latNum,
        lng: lngNum,
      },
    };

    startTransition(async () => {
      const result = await createCampgroundAction(payload);

      if (!result.success) {
        setError(result.error.code);
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

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [name]: value,
      },
    }));
    setError(null);
  };

  const handleOwnerChange = (value: string) => {
    setForm((prev) => ({ ...prev, owner_id: value }));
    setError(null);
  };

  const sortedOwners = [...owners].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  return (
    <div className="space-y-10">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      <form id="campground-form" onSubmit={handleSubmit} className="space-y-10">
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
                placeholder="Enter campground name"
              />
            </div>

            <div>
              <Label htmlFor="owner_id">
                Owner <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.owner_id}
                onValueChange={handleOwnerChange}
                required
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select an owner" />
                </SelectTrigger>
                <SelectContent>
                  {sortedOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.full_name
                        ? `${owner.full_name} (${owner.email})`
                        : owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                placeholder="Describe the campground..."
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={form.website}
                onChange={handleChange}
                placeholder="https://..."
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="mt-1.5"
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="province">Province / State</Label>
                <Input
                  id="province"
                  name="province"
                  value={form.province}
                  onChange={handleChange}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
                className="mt-1.5"
                placeholder="Canada"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">
                  Latitude <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lat"
                  name="lat"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={form.location.lat}
                  onChange={handleLocationChange}
                  required
                  className="mt-1.5"
                  placeholder="e.g. 45.4215"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Range: -90° to +90°
                </p>
              </div>

              <div>
                <Label htmlFor="lng">
                  Longitude <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lng"
                  name="lng"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={form.location.lng}
                  onChange={handleLocationChange}
                  required
                  className="mt-1.5"
                  placeholder="e.g. -75.6972"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Range: -180° to +180°
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                form="campground-form"
                disabled={isPending || !isFormValid}
                size="lg"
                className={cn(
                  "min-w-40",
                  (isPending || !isFormValid) &&
                    "opacity-70 cursor-not-allowed",
                )}
              >
                {isPending ? (
                  "Creating..."
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create campground
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
