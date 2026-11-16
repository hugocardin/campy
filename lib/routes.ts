import {
  formatGuestRigLengthParam,
  formatRigLengthUnitParam,
  type RigLengthUnit,
} from "@/lib/site-rig-length";

export type CampgroundDetailQuery = {
  /** Guest display/input unit; omitted / feet → no query param. */
  rigUnit?: RigLengthUnit;
  /** Canonical feet when the guest filter had a length. */
  rigLength?: number;
};

export const routes = {
  home: () => "/",
  campgrounds: () => "/campgrounds",
  /**
   * Guest campground detail. Optional query carries search rig prefs so the
   * sites table can lead with metres when the guest filtered in m (#34).
   */
  campgroundDetail: (id: string, query?: CampgroundDetailQuery) => {
    const params = new URLSearchParams();
    const unit = formatRigLengthUnitParam(query?.rigUnit);
    if (unit) params.set("rigUnit", unit);
    const length = formatGuestRigLengthParam(query?.rigLength);
    if (length) params.set("rigLength", length);
    const qs = params.toString();
    return qs ? `/campgrounds/${id}?${qs}` : `/campgrounds/${id}`;
  },

  auth: () => "/auth",
  profile: () => "/profile",
  platformAdmin: {
    root: () => "/platformAdmin",
    amenities: () => "/platformAdmin/amenities",
    amenityCategory: () => "/platformAdmin/amenity-categories",
    campgrounds: () => "/platformAdmin/campgrounds",
    campgroundCreate: () => "/platformAdmin/campgrounds/create",
    campgroundView: (id: string) => `/platformAdmin/campgrounds/${id}`,
    campgroundEdit: (id: string) => `/platformAdmin/campgrounds/${id}/edit`,
    campgroundAmenities: (id: string) =>
      `/platformAdmin/campgrounds/${id}/amenities`,

    campgroundSites: (id: string) => `/platformAdmin/campgrounds/${id}/sites`,
    campgroundSiteCreate: (id: string) =>
      `/platformAdmin/campgrounds/${id}/sites/create`,
    campgroundSiteView: (id: string, siteId: string) =>
      `/platformAdmin/campgrounds/${id}/sites/${siteId}`,
    campgroundSiteEdit: (id: string, siteId: string) =>
      `/platformAdmin/campgrounds/${id}/sites/${siteId}/edit`,
    campgroundSiteAmenities: (id: string, siteId: string) =>
      `/platformAdmin/campgrounds/${id}/sites/${siteId}/amenities`,
  },
} as const;
