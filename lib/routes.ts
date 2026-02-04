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
    campgroundDetail: (id: string) => `/platformAdmin/campgrounds/${id}`,
  },
} as const;

// <Link href={routes.campgroundDetail("abc123")}>View Campground</Link>
// <Link href={routes.admin.amenityCategory()}>Categories</Link>
