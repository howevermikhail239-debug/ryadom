import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const placeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  addressLabel: z.string().trim().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const places = await prisma.favoritePlace.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, addressLabel: true, latitude: true, longitude: true },
    });
    return NextResponse.json({ places: places.map((place) => ({ ...place, latitude: Number(place.latitude), longitude: Number(place.longitude) })) });
  } catch {
    return NextResponse.json({ error: "Войдите, чтобы открыть сохранённые места." }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = placeSchema.parse(await request.json());
    const place = await prisma.favoritePlace.upsert({
      where: { userId_name: { userId: user.id, name: input.name } },
      create: { userId: user.id, ...input, addressLabel: input.addressLabel || null },
      update: { latitude: input.latitude, longitude: input.longitude, addressLabel: input.addressLabel || null },
      select: { id: true, name: true, addressLabel: true, latitude: true, longitude: true },
    });
    return NextResponse.json({ place: { ...place, latitude: Number(place.latitude), longitude: Number(place.longitude) } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLACE_FAILED";
    const status = message === "UNAUTHORIZED" ? 401 : message === "INVALID_ORIGIN" ? 403 : 400;
    return NextResponse.json({ error: status === 401 ? "Войдите, чтобы сохранить место." : "Проверьте название и точку." }, { status });
  }
}
