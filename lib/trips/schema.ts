import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a YYYY-MM-DD date");

export const createTripSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startName: z.string().min(1, "Start location is required"),
  description: z.string().optional(),
  startDate: isoDate.optional(),
  dayCount: z.coerce.number().int().min(1).max(60).default(1),
});

export const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: isoDate.nullable().optional(),
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
};
