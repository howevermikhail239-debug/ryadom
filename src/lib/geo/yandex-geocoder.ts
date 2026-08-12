export type YandexAddressComponent = { kind?: string; name?: string };

export type YandexGeoFeature = {
  GeoObject?: {
    name?: string;
    description?: string;
    metaDataProperty?: {
      GeocoderMetaData?: {
        kind?: string;
        text?: string;
        precision?: string;
        Address?: { formatted?: string; Components?: YandexAddressComponent[] };
      };
    };
  };
};

const kindWeight: Record<string, number> = {
  house: 500,
  street: 350,
  metro: 250,
  district: 160,
  locality: 140,
  area: 100,
  province: 80,
  country: 10,
};

const precisionWeight: Record<string, number> = {
  exact: 80,
  number: 65,
  near: 30,
  range: 20,
  street: 15,
  other: 0,
};

function componentsOf(feature: YandexGeoFeature) {
  return feature.GeoObject?.metaDataProperty?.GeocoderMetaData?.Address?.Components ?? [];
}

function componentName(components: YandexAddressComponent[], kind: string) {
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const component = components[index];
    if (component?.kind === kind && component.name) return component.name.trim();
  }
  return undefined;
}

function scoreFeature(feature: YandexGeoFeature) {
  const metadata = feature.GeoObject?.metaDataProperty?.GeocoderMetaData;
  const components = componentsOf(feature);
  return (kindWeight[metadata?.kind ?? ""] ?? 0)
    + (precisionWeight[metadata?.precision ?? ""] ?? 0)
    + (componentName(components, "street") ? 60 : 0)
    + (componentName(components, "house") ? 120 : 0);
}

function cleanFormattedAddress(value: string) {
  return value
    .replace(/^\s*\d{6},\s*/u, "")
    .replace(/^\s*Россия,\s*/iu, "")
    .trim();
}

export function selectBestYandexAddress(features: YandexGeoFeature[]) {
  const feature = [...features].sort((left, right) => scoreFeature(right) - scoreFeature(left))[0];
  if (!feature?.GeoObject) return null;

  const metadata = feature.GeoObject.metaDataProperty?.GeocoderMetaData;
  const components = componentsOf(feature);
  const locality = componentName(components, "locality")
    ?? componentName(components, "province");
  const street = componentName(components, "street");
  const house = componentName(components, "house");

  const preciseParts = [locality, street, house ? `д. ${house.replace(/^д\.\s*/iu, "")}` : null]
    .filter((part): part is string => Boolean(part));
  const address = street && preciseParts.length >= 2
    ? preciseParts.join(", ")
    : cleanFormattedAddress(
      metadata?.Address?.formatted
        ?? metadata?.text
        ?? [feature.GeoObject.description, feature.GeoObject.name].filter(Boolean).join(", "),
    );

  return address ? {
    address,
    kind: metadata?.kind ?? null,
    precision: metadata?.precision ?? null,
  } : null;
}
