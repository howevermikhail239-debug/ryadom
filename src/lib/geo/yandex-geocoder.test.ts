import assert from "node:assert/strict";
import test from "node:test";

import { selectBestYandexAddress, type YandexGeoFeature } from "./yandex-geocoder";

function feature(kind: string, formatted: string, components: Array<{ kind: string; name: string }>, precision = "exact"): YandexGeoFeature {
  return { GeoObject: { metaDataProperty: { GeocoderMetaData: { kind, precision, Address: { formatted, Components: components } } } } };
}

test("reverse geocoder prefers a precise house over the first administrative result", () => {
  const result = selectBestYandexAddress([
    feature("district", "Россия, Москва, Южный административный округ, Донской район", [
      { kind: "country", name: "Россия" }, { kind: "locality", name: "Москва" }, { kind: "district", name: "Донской район" },
    ]),
    feature("house", "Россия, Москва, улица Орджоникидзе, 11", [
      { kind: "country", name: "Россия" }, { kind: "locality", name: "Москва" }, { kind: "street", name: "улица Орджоникидзе" }, { kind: "house", name: "11" },
    ]),
  ]);

  assert.deepEqual(result, { address: "Москва, улица Орджоникидзе, д. 11", kind: "house", precision: "exact" });
});

test("reverse geocoder falls back to the most precise address actually returned", () => {
  const result = selectBestYandexAddress([
    feature("district", "Россия, Москва, Донской район", [{ kind: "locality", name: "Москва" }, { kind: "district", name: "Донской район" }]),
    feature("street", "Россия, Москва, улица Вавилова", [{ kind: "locality", name: "Москва" }, { kind: "street", name: "улица Вавилова" }], "street"),
  ]);

  assert.equal(result?.address, "Москва, улица Вавилова");
  assert.equal(result?.kind, "street");
});
