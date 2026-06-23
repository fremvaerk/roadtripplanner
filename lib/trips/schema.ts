import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a YYYY-MM-DD date");

const placeInput = z.object({
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().nullable(),
});

export const createTripSchema = z.object({
  title: z.string().min(1, "Title is required"),
  start: placeInput,
  startDate: isoDate.nullable().optional(),
  finish: z
    .object({ mode: z.enum(["open", "round", "place"]), place: placeInput.optional() })
    .refine((f) => f.mode !== "place" || !!f.place, {
      message: "A place is required for a specific finish",
      path: ["place"],
    })
    .optional(),
  coverImage: z.string().url().nullable().optional(),
  description: z.string().optional(),
  dayCount: z.coerce.number().int().min(1).max(60).default(1),
});

export const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: isoDate.nullable().optional(),
  archived: z.boolean().optional(),
  coverImage: z.string().url().nullable().optional(),
  start: placeInput.optional(),
  finish: z
    .object({
      mode: z.enum(["open", "round", "place"]),
      place: placeInput.optional(),
    })
    .refine((f) => f.mode !== "place" || !!f.place, {
      message: "A place is required for a specific finish",
      path: ["place"],
    })
    .optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;

export type ResolvedLocation = {
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
};

export type CreateTripData = {
  title: string;
  description: string;
  startDate: Date | null;
  dayCount: number;
  start: ResolvedLocation;
  finish?: { mode: "open" | "round" | "place"; place?: ResolvedLocation };
  coverImage?: string | null;
};
