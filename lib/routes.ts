import {
  formatRigLengthUnitParam,
  type RigLengthUnit,
} from "@/lib/site-rig-length";

export type CampgroundDetailQuery = {
  /**
   * Guest display unit for dual rig-length labels on the detail page.
   * Written as `rigUnit=ft|m` when set (`rigLength` is not carried here —
   * detail does not filter/highlight by length yet).
   */
  rigUnit?: RigLengthUnit;
};

export const routes = {
  home: () => "/",
  campgrounds: () => "/campgrounds",
  /**
   * Guest campground detail. Optional `rigUnit` so the sites table can lead
   * with metres when the guest filtered in m (#34).
   */
  campgroundDetail: (id: string, query?: CampgroundDetailQuery) => {
    const unit = formatRigLengthUnitParam(query?.rigUnit);
    return unit
      ? `/campgrounds/${id}?rigUnit=${unit}`
      : `/campgrounds/${id}`;
  },

  auth: () => "/auth",
  profile: () => "/profile",
  profileEdit: () => "/profile/edit",
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
