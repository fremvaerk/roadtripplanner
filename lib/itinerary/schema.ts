import { z } from "zod";

export const addPoiSchema = z.object({
  name: z.string().min(1, "Name is required"),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["user", "search", "map", "ai"]).optional(),
  dayId: z.string().optional(),
  groupId: z.string().optional(),
});

export type AddPoiBody = z.infer<typeof addPoiSchema>;

export const patchPoiSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    dayId: z.string().nullable(),
    orderInDay: z.number().int().min(0),
  }),
  z.object({
    op: z.literal("group"),
    groupId: z.string().nullable(),
    orderInGroup: z.number().int().min(0),
  }),
]);

export type PatchPoiBody = z.infer<typeof patchPoiSchema>;

export const createGroupSchema = z.object({ name: z.string().min(1, "Name is required") });
export type CreateGroupBody = z.infer<typeof createGroupSchema>;
export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #rrggbb hex color").optional(),
});
export const reorderGroupsSchema = z.object({ orderedIds: z.array(z.string()) });

export const addViaSchema = z.object({
  afterPoiId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export const moveViaSchema = z.object({ lat: z.number(), lng: z.number() });

export const setNightSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const updateNightSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
