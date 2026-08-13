import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { trackProductEvent } from "@/lib/analytics/events";
import { assertSameOrigin } from "@/lib/http/security";

const eventSchema = z.object({
  name: z.enum(["map_opened", "map_search_here", "map_return_to_me", "map_radius_changed", "map_task_marker_opened", "map_task_opened", "map_cluster_opened", "map_executor_layer_toggled", "map_executor_marker_opened"]),
  taskId: z.string().uuid().nullable().optional(),
  properties: z.record(z.string(), z.union([z.string().max(80), z.number().finite(), z.boolean(), z.null()])).optional(),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = eventSchema.parse(await request.json());
    const user = await getCurrentUser();
    trackProductEvent({ name: input.name, userId: user?.id, taskId: input.taskId, properties: input.properties });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: error instanceof Error && error.message === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
