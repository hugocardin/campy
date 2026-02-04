"use client";

import { ArrowLeft, Power, PowerOff, Save, AlertCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  activateCampgroundAction,
  inactivateCampgroundAction,
  updateCampgroundAction,
  //   updateCampgroundAction,
} from "@/app/actions/campgrounds-admin";
import { CampgroundAdmin } from "@/app/entities/campground-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

type Props = {
  campground: CampgroundAdmin;
};

type FormData = Omit<
  CampgroundAdmin,
  "id" | "owner_id" | "owner_full_name" | "owner_email" | "active"
>;

export default function CampgroundClient({ campground }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<FormData>({
    name: campground.name,
    description: campground.description || "",
    address: campground.address || "",
    city: campground.city || "",
    province: campground.province || "",
    country: campground.country || "",
    website: campground.website || "",
    phone: campground.phone || "",
    location: {
      lat: campground.location?.lat || 0,
      lng: campground.location?.lng || 0,
    },
  });

  const handleToggleStatus = () => {
    const action = campground.active
      ? inactivateCampgroundAction
      : activateCampgroundAction;
    const actionName = campground.active ? "deactivate" : "activate";
    const confirmMessage = `Are you sure you want to ${actionName} "${campground.name}"?`;

    if (!confirm(confirmMessage)) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await action(campground.id);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`Campground has been ${actionName}d`);
        router.refresh();
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateCampgroundAction({
        id: campground.id,
        ...form,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Campground updated successfully");
        router.refresh();
      }
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [name]: parseFloat(value) || 0,
      },
    }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Edit Campground</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {campground.active ? (
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-700">
                  Inactive
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Owner: {campground.owner_full_name} · {campground.owner_email}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant={campground.active ? "outline" : "default"}
            onClick={handleToggleStatus}
            disabled={isPending}
            className={cn(
              campground.active
                ? "border-amber-500 text-amber-700 hover:bg-amber-50"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
          >
            {campground.active ? (
              <>
                <PowerOff className="mr-2 h-4 w-4" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4" />
                Activate
              </>
            )}
          </Button>

          <Button type="submit" form="campground-form" disabled={isPending}>
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

      {/* Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="default" className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <form id="campground-form" onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - main info */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1.5"
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

          {/* Right column - location & address */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="mt-1.5"
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
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <Input
                  id="lat"
                  name="lat"
                  type="number"
                  step="any"
                  value={form.location.lat}
                  onChange={handleLocationChange}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="lng">Longitude</Label>
                <Input
                  id="lng"
                  name="lng"
                  type="number"
                  step="any"
                  value={form.location.lng}
                  onChange={handleLocationChange}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
