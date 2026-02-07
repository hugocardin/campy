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
    campgroundDetails: (id: string) => `/platformAdmin/campgrounds/${id}`,
    campgroundDetailsEdit: (id: string) =>
      `/platformAdmin/campgrounds/${id}/edit`,
  },
} as const;
