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
    campgroundDetails: (id: string) => `/platformAdmin/campgrounds/${id}`,
    campgroundDetailsEdit: (id: string) =>
      `/platformAdmin/campgrounds/${id}/edit`,
  },
} as const;

// <Link href={routes.campgroundDetail("abc123")}>View Campground</Link>
// <Link href={routes.admin.amenityCategory()}>Categories</Link>
