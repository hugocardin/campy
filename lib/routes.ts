export const routes = {
  home: () => "/",
  campgroundDetail: (id: string) => `/campgrounds/${id}`,

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
