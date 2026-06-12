import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createTrip, getTrip, listTrips } from "@/lib/trips/service";
import {
  addPoi,
  movePoi,
  setNight,
  addDay,
  insertDayAfter,
  removeDay,
  optimizeDay,
  ItineraryError,
} from "@/lib/itinerary/operations";
import { geocodePlace } from "@/lib/geocode";
import { searchPlacesText, searchPlacesNearby } from "@/lib/places/search";
import {
  requireWrite,
  requireRead,
  requireWriteForDay,
  requireWriteForPoi,
  HttpError,
} from "@/lib/auth/guards";
import type { Session } from "@/lib/auth/session";
import {
  buildDayRouteRequests,
  attributeLegDurations,
  type TripVia,
} from "@/lib/routing/itinerary-route";
import { computeRouteChunked, RouteError } from "@/lib/routing/routes";
import type { TripDetail } from "@/lib/api/trips";

// ---------------------------------------------------------------------------
// MCP content helpers
// ---------------------------------------------------------------------------

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (msg: string) => ({
  content: [{ type: "text" as const, text: "Error: " + msg }],
  isError: true,
});

/** Run a tool body, converting known errors into MCP error results. */
async function run(fn: () => Promise<ReturnType<typeof ok>>) {
  try {
    return await fn();
  } catch (e) {
    if (
      e instanceof ItineraryError ||
      e instanceof HttpError ||
      e instanceof RouteError ||
      e instanceof Error
    ) {
      return fail(e.message);
    }
    return fail(String(e));
  }
}

/** Build an MCP server with all road-trip tools bound to one owner session. */
export function buildMcpServer(session: Session): McpServer {
  const server = new McpServer({ name: "roadtrip", version: "1.0.0" });

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_trips",
    { description: "List all trips owned by or shared with the owner." },
    async () => run(async () => ok(await listTrips(prisma, session))),
  );

  server.registerTool(
    "get_trip",
    {
      description:
        "Fetch a single trip with its days, places, nights and route vias.",
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) =>
      run(async () => {
        const trip = await getTrip(prisma, tripId, session);
        if (!trip) throw new Error("Trip not found or not accessible");
        return ok(trip);
      }),
  );

  server.registerTool(
    "create_trip",
    {
      description:
        "Create a new trip; the start location name is geocoded automatically.",
      inputSchema: {
        title: z.string(),
        startName: z.string(),
        dayCount: z.number().int().positive(),
        startDate: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ title, startName, dayCount, startDate, description }) =>
      run(async () => {
        const start = await geocodePlace(startName);
        const trip = await createTrip(
          prisma,
          {
            title,
            description: description ?? "",
            startDate: startDate ? new Date(startDate) : null,
            dayCount,
            start,
          },
          session.userId,
        );
        return ok({ tripId: trip.id });
      }),
  );

  server.registerTool(
    "search_places",
    {
      description:
        "Search for places by text; if nearLat and nearLng are given, bias/restrict results to that area.",
      inputSchema: {
        query: z.string(),
        nearLat: z.number().optional(),
        nearLng: z.number().optional(),
        radiusMeters: z.number().optional(),
        limit: z.number().int().optional(),
      },
    },
    async ({ query, nearLat, nearLng, radiusMeters, limit }) =>
      run(async () => {
        if (nearLat !== undefined && nearLng !== undefined) {
          return ok(
            await searchPlacesText(query, {
              near: { lat: nearLat, lng: nearLng },
              radiusMeters,
              limit,
            }),
          );
        }
        return ok(await searchPlacesText(query, { limit }));
      }),
  );

  server.registerTool(
    "search_places_nearby",
    {
      description:
        "Find popular places within a radius (meters) around a center point.",
      inputSchema: {
        lat: z.number(),
        lng: z.number(),
        radiusMeters: z.number(),
        limit: z.number().int().optional(),
      },
    },
    async ({ lat, lng, radiusMeters, limit }) =>
      run(async () =>
        ok(await searchPlacesNearby({ lat, lng }, radiusMeters, { limit })),
      ),
  );

  server.registerTool(
    "geocode",
    {
      description: "Resolve a place name or address to a name, lat, lng and placeId.",
      inputSchema: { query: z.string() },
    },
    async ({ query }) => run(async () => ok(await geocodePlace(query))),
  );

  server.registerTool(
    "add_place",
    {
      description:
        "Add a place (POI) to a trip, optionally assigning it to a specific day.",
      inputSchema: {
        tripId: z.string(),
        name: z.string(),
        lat: z.number(),
        lng: z.number(),
        placeId: z.string().optional(),
        category: z.string().optional(),
        address: z.string().optional(),
        description: z.string().optional(),
        dayId: z.string().optional(),
      },
    },
    async ({ tripId, name, lat, lng, placeId, category, address, description, dayId }) =>
      run(async () => {
        await requireWrite(prisma, session, tripId);
        const poi = await addPoi(prisma, tripId, {
          name,
          lat,
          lng,
          placeId,
          category,
          address,
          description,
          source: "ai",
          dayId,
        });
        return ok({ poiId: poi.id });
      }),
  );

  server.registerTool(
    "add_day",
    {
      description: "Append a new empty day to the end of a trip.",
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) =>
      run(async () => {
        await requireWrite(prisma, session, tripId);
        return ok(await addDay(prisma, tripId));
      }),
  );

  server.registerTool(
    "insert_day",
    {
      description: "Insert a new empty day immediately after the given day.",
      inputSchema: { tripId: z.string(), afterDayId: z.string() },
    },
    async ({ tripId, afterDayId }) =>
      run(async () => {
        await requireWrite(prisma, session, tripId);
        return ok(await insertDayAfter(prisma, tripId, afterDayId));
      }),
  );

  server.registerTool(
    "remove_day",
    {
      description: "Delete a day; its places become unassigned (kept in the trip).",
      inputSchema: { dayId: z.string() },
    },
    async ({ dayId }) =>
      run(async () => {
        await requireWriteForDay(prisma, session, dayId);
        return ok(await removeDay(prisma, dayId));
      }),
  );

  server.registerTool(
    "assign_place_to_day",
    {
      description:
        "Move a place to a day at a given position, or unassign it by passing dayId null.",
      inputSchema: {
        poiId: z.string(),
        dayId: z.string().nullable(),
        orderInDay: z.number().int().optional(),
      },
    },
    async ({ poiId, dayId, orderInDay }) =>
      run(async () => {
        await requireWriteForPoi(prisma, session, poiId);
        return ok(
          await movePoi(prisma, poiId, { dayId, orderInDay: orderInDay ?? 9999 }),
        );
      }),
  );

  server.registerTool(
    "set_night",
    {
      description: "Set (or replace) the overnight stop for a day.",
      inputSchema: {
        dayId: z.string(),
        name: z.string(),
        lat: z.number(),
        lng: z.number(),
      },
    },
    async ({ dayId, name, lat, lng }) =>
      run(async () => {
        await requireWriteForDay(prisma, session, dayId);
        return ok(await setNight(prisma, dayId, { lat, lng, title: name }));
      }),
  );

  server.registerTool(
    "optimize_day",
    {
      description:
        "Reorder a day's intermediate stops to minimize travel, keeping its first and last stop fixed.",
      inputSchema: { dayId: z.string() },
    },
    async ({ dayId }) =>
      run(async () => {
        await requireWriteForDay(prisma, session, dayId);
        return ok(await optimizeDay(prisma, dayId));
      }),
  );

  server.registerTool(
    "build_route",
    {
      description:
        "Compute driving times and distances per day for a trip, plus totals and any days that failed to route.",
      inputSchema: { tripId: z.string() },
    },
    async ({ tripId }) =>
      run(async () => {
        await requireRead(prisma, session, tripId);
        const trip = await getTrip(prisma, tripId, session);
        if (!trip) return fail("not found");

        const vias = ((trip as unknown as { routeVias?: TripVia[] }).routeVias ??
          []) as TripVia[];
        const segments = buildDayRouteRequests(trip as unknown as TripDetail, vias);

        const legDayIdAll: (string | null)[] = [];
        const legSeconds: number[] = [];
        const legMeters: number[] = [];
        const failed = new Set<string>();

        if (segments.length > 0) {
          const results = await Promise.allSettled(
            segments.map((seg) =>
              computeRouteChunked(seg.waypoints, undefined, { legPolylines: false }),
            ),
          );

          results.forEach((res, i) => {
            const seg = segments[i];
            if (res.status === "fulfilled") {
              if (res.value.length !== seg.legDayId.length) {
                for (const d of seg.legDayId) if (d) failed.add(d);
                return;
              }
              res.value.forEach((leg, j) => {
                legDayIdAll.push(seg.legDayId[j] ?? null);
                legSeconds.push(leg.durationSeconds);
                legMeters.push(leg.distanceMeters);
              });
            } else {
              if (!(res.reason instanceof RouteError)) throw res.reason;
              for (const d of seg.legDayId) if (d) failed.add(d);
            }
          });
        }

        const { perDaySeconds, perDayMeters, totalSeconds, totalMeters } =
          attributeLegDurations(legDayIdAll, legSeconds, legMeters);

        return ok({
          perDay: Object.keys(perDaySeconds).map((dayId) => ({
            dayId,
            seconds: perDaySeconds[dayId],
            meters: perDayMeters[dayId],
          })),
          totalSeconds,
          totalMeters,
          failedDayIds: [...failed],
        });
      }),
  );

  return server;
}
