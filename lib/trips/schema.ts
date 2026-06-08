import { z } from "zod";

export const createTripSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    startName: z.string().min(1, "Start location is required"),
    endName: z.string().min(1).optional(),
    isRoundTrip: z.boolean().default(false),
    description: z.string().min(1, "Description is required"),
    startDate: z.string().optional(),
    dayCount: z.coerce.number().int().min(1).max(60).default(1),
  })
  .refine((d) => d.isRoundTrip || !!d.endName, {
    message: "End location is required unless this is a round trip",
    path: ["endName"],
  });

export const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
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
  isRoundTrip: boolean;
  startDate: Date | null;
  dayCount: number;
  start: ResolvedLocation;
  end: ResolvedLocation | null;
};
