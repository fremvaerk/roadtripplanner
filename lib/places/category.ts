export type PoiCategory = "food" | "sight" | "nature" | "lodging" | "other";

// Priority order matters: the first group with a matching type wins.
const CATEGORY_RULES: { category: PoiCategory; types: string[] }[] = [
  { category: "lodging", types: ["lodging", "hotel", "campground", "rv_park"] },
  {
    category: "nature",
    types: ["park", "natural_feature", "national_park", "hiking_area", "beach"],
  },
  {
    category: "food",
    types: ["restaurant", "cafe", "bar", "bakery", "meal_takeaway", "food"],
  },
  {
    category: "sight",
    types: [
      "tourist_attraction",
      "museum",
      "art_gallery",
      "church",
      "place_of_worship",
      "landmark",
      "zoo",
      "aquarium",
    ],
  },
];

export function categoryFromTypes(types: string[]): PoiCategory {
  const set = new Set(types);
  for (const rule of CATEGORY_RULES) {
    if (rule.types.some((t) => set.has(t))) return rule.category;
  }
  return "other";
}
