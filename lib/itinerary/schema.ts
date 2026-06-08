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
    op: z.literal("overnight"),
    isOvernight: z.boolean(),
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
export const renameGroupSchema = createGroupSchema;
export const reorderGroupsSchema = z.object({ orderedIds: z.array(z.string()) });

export const addViaSchema = z.object({
  afterPoiId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export const moveViaSchema = z.object({ lat: z.number(), lng: z.number() });
