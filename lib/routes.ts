export const routes = {
  home: () => "/",
  auth: () => "/auth",
  profile: () => "/profile",
  platformAdmin: {
    root: () => "/platformAdmin",
    amenities: () => "/platformAdmin/amenities",
    amenityCategory: () => "/platformAdmin/amenity-categories",
  },
} as const;

// campgroundDetail: (id: string) => `/campgrounds/${id}`,
// <Link href={routes.campgroundDetail("abc123")}>View Campground</Link>
// <Link href={routes.admin.amenityCategory()}>Categories</Link>
