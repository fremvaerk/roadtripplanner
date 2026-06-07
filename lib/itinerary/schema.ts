import { z } from "zod";

export const addPoiSchema = z.object({
  name: z.string().min(1, "Name is required"),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["user", "search", "map", "ai"]).optional(),
  dayId: z.string().optional(),
});

export type AddPoiBody = z.infer<typeof addPoiSchema>;

export const patchPoiSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    dayId: z.string().nullable(),
    orderInDay: z.number().int().min(0),
  }),
  z.object({
    op: z.literal("overnight"),
    isOvernight: z.boolean(),
  }),
]);

export type PatchPoiBody = z.infer<typeof patchPoiSchema>;
