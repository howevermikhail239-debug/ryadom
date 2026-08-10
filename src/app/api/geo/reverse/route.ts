import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";

export const runtime = "nodejs";

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

type YandexGeocoderResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: { metaDataProperty?: { GeocoderMetaData?: { text?: string; Address?: { formatted?: string } } } };
      }>;
    };
  };
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные координаты." }, { status: 400 });

  const { latitude, longitude } = parsed.data;
  const url = new URL("https://geocode-maps.yandex.ru/v1/");
  url.searchParams.set("apikey", serverEnv.YANDEX_GEOCODER_API_KEY);
  url.searchParams.set("geocode", `${longitude},${latitude}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("results", "1");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error(`Geocoder ${response.status}`);
    const data = (await response.json()) as YandexGeocoderResponse;
    const metadata = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData;
    const address = metadata?.Address?.formatted ?? metadata?.text ?? null;
    return NextResponse.json({ address });
  } catch {
    return NextResponse.json({ address: null }, { status: 502 });
  }
}
