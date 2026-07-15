/**
 * Kenya location registry.
 *
 * Nuru is a national marketplace: a listing lives in a *county* and a
 * *town / area*. `neighborhood` on Listing stays the free-text primary
 * location token (an estate or area name); `county` groups it for national
 * browse, filtering and market stats.
 *
 * This registry is the single source of truth for:
 *  - the search parser (recognising places anywhere in Kenya),
 *  - deriving a county from a free-text area when the agent didn't pick one,
 *  - the homepage "browse by location" surface.
 *
 * It is intentionally not exhaustive to the sub-location — it covers all 47
 * counties and the areas people actually search in the major urban markets.
 * Unknown areas still work (free text); they just won't auto-map to a county.
 */

export interface CountyEntry {
  /** Canonical county name, e.g. "Nairobi", "Mombasa". */
  county: string;
  /** URL slug, e.g. "nairobi". */
  slug: string;
  /** Broad region, for grouping on the browse page. */
  region: Region;
  /** Searchable areas/estates/towns within the county (canonical names). */
  areas: string[];
}

export type Region =
  | "Nairobi Metro"
  | "Coast"
  | "Rift Valley"
  | "Central"
  | "Western"
  | "Nyanza"
  | "Eastern"
  | "North Eastern";

/**
 * Counties with their notable searchable areas. The big rental/sale markets
 * (Nairobi, Mombasa, Kiambu, Nakuru, Kisumu, Uasin Gishu) carry rich area
 * lists; smaller counties carry their principal towns.
 */
export const KENYA_COUNTIES: CountyEntry[] = [
  {
    county: "Nairobi", slug: "nairobi", region: "Nairobi Metro",
    areas: [
      "Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands", "Karen",
      "Runda", "Spring Valley", "Riverside", "Upperhill", "Hurlingham",
      "Ngong Road", "Kilimani", "South B", "South C", "Langata", "Kasarani",
      "Roysambu", "Ruaraka", "Embakasi", "Donholm", "Buruburu", "Umoja",
      "Eastleigh", "Ngara", "Pangani", "Kahawa", "Githurai", "Zimmerman",
      "Dagoretti", "Kawangware", "Kibra", "Imara Daima", "Syokimau", "Utawala",
      "Ruai", "Nairobi CBD",
    ],
  },
  {
    county: "Mombasa", slug: "mombasa", region: "Coast",
    areas: [
      "Nyali", "Bamburi", "Shanzu", "Kizingo", "Tudor", "Mombasa CBD",
      "Likoni", "Mtwapa", "Bombolulu", "Kisauni", "Mvita", "Ganjoni",
      "Old Town", "Changamwe", "Miritini", "Mikindani",
    ],
  },
  {
    county: "Kiambu", slug: "kiambu", region: "Nairobi Metro",
    areas: [
      "Thika", "Ruiru", "Juja", "Kiambu Town", "Kikuyu", "Limuru", "Karuri",
      "Kabete", "Kahawa Sukari", "Kahawa Wendani", "Membley", "Githunguri",
      "Ruaka", "Banana", "Ndenderu", "Tigoni", "Gigiri",
    ],
  },
  {
    county: "Nakuru", slug: "nakuru", region: "Rift Valley",
    areas: [
      "Nakuru CBD", "Milimani", "Section 58", "Lanet", "Naivasha", "Gilgil",
      "Molo", "Njoro", "Bahati", "Free Area", "Pipeline", "London", "Kiamunyi",
    ],
  },
  {
    county: "Kisumu", slug: "kisumu", region: "Nyanza",
    areas: [
      "Kisumu CBD", "Milimani", "Mamboleo", "Nyalenda", "Kondele", "Riat",
      "Tom Mboya", "Dunga", "Ahero", "Manyatta", "Migosi",
    ],
  },
  {
    county: "Uasin Gishu", slug: "uasin-gishu", region: "Rift Valley",
    areas: [
      "Eldoret CBD", "Elgon View", "Kapsoya", "Langas", "Pioneer", "Huruma",
      "Kimumu", "Annex", "Chepkoilel", "West Indies",
    ],
  },
  {
    county: "Machakos", slug: "machakos", region: "Eastern",
    areas: ["Machakos Town", "Athi River", "Mavoko", "Syokimau", "Kitengela", "Mlolongo", "Kangundo"],
  },
  {
    county: "Kajiado", slug: "kajiado", region: "Rift Valley",
    areas: ["Kitengela", "Ngong", "Ongata Rongai", "Kiserian", "Kajiado Town", "Isinya", "Namanga"],
  },
  {
    county: "Nyeri", slug: "nyeri", region: "Central",
    areas: ["Nyeri Town", "Kamakwa", "Ruring'u", "Karatina", "Othaya", "Mweiga"],
  },
  {
    county: "Kilifi", slug: "kilifi", region: "Coast",
    areas: ["Kilifi Town", "Malindi", "Watamu", "Mtwapa", "Mariakani", "Vipingo"],
  },
  { county: "Meru", slug: "meru", region: "Eastern", areas: ["Meru Town", "Maua", "Nkubu", "Timau"] },
  { county: "Kericho", slug: "kericho", region: "Rift Valley", areas: ["Kericho Town", "Litein", "Kipkelion", "Brooke"] },
  { county: "Kakamega", slug: "kakamega", region: "Western", areas: ["Kakamega Town", "Mumias", "Malava", "Lurambi"] },
  { county: "Bungoma", slug: "bungoma", region: "Western", areas: ["Bungoma Town", "Webuye", "Kimilili", "Chwele"] },
  { county: "Kisii", slug: "kisii", region: "Nyanza", areas: ["Kisii Town", "Suneka", "Ogembo", "Nyamache"] },
  { county: "Trans Nzoia", slug: "trans-nzoia", region: "Rift Valley", areas: ["Kitale", "Kiminini", "Endebess"] },
  { county: "Laikipia", slug: "laikipia", region: "Rift Valley", areas: ["Nanyuki", "Nyahururu", "Rumuruti"] },
  { county: "Nyandarua", slug: "nyandarua", region: "Central", areas: ["Ol Kalou", "Njabini", "Engineer"] },
  { county: "Muranga", slug: "muranga", region: "Central", areas: ["Murang'a Town", "Kenol", "Maragua", "Kangema"] },
  { county: "Kirinyaga", slug: "kirinyaga", region: "Central", areas: ["Kerugoya", "Kutus", "Sagana", "Mwea"] },
  { county: "Embu", slug: "embu", region: "Eastern", areas: ["Embu Town", "Runyenjes", "Siakago"] },
  { county: "Tharaka Nithi", slug: "tharaka-nithi", region: "Eastern", areas: ["Chuka", "Marimanti"] },
  { county: "Kitui", slug: "kitui", region: "Eastern", areas: ["Kitui Town", "Mwingi", "Mutomo"] },
  { county: "Makueni", slug: "makueni", region: "Eastern", areas: ["Wote", "Emali", "Makindu", "Sultan Hamud"] },
  { county: "Bomet", slug: "bomet", region: "Rift Valley", areas: ["Bomet Town", "Sotik", "Longisa"] },
  { county: "Nandi", slug: "nandi", region: "Rift Valley", areas: ["Kapsabet", "Nandi Hills", "Mosoriot"] },
  { county: "Baringo", slug: "baringo", region: "Rift Valley", areas: ["Kabarnet", "Eldama Ravine", "Marigat"] },
  { county: "Narok", slug: "narok", region: "Rift Valley", areas: ["Narok Town", "Kilgoris", "Ololulunga"] },
  { county: "Migori", slug: "migori", region: "Nyanza", areas: ["Migori Town", "Rongo", "Awendo", "Isebania"] },
  { county: "Homa Bay", slug: "homa-bay", region: "Nyanza", areas: ["Homa Bay Town", "Oyugis", "Mbita", "Kendu Bay"] },
  { county: "Siaya", slug: "siaya", region: "Nyanza", areas: ["Siaya Town", "Bondo", "Ugunja", "Yala"] },
  { county: "Vihiga", slug: "vihiga", region: "Western", areas: ["Mbale", "Luanda", "Chavakali"] },
  { county: "Busia", slug: "busia", region: "Western", areas: ["Busia Town", "Malaba", "Nambale"] },
  { county: "Nyamira", slug: "nyamira", region: "Nyanza", areas: ["Nyamira Town", "Keroka", "Nyansiongo"] },
  { county: "Turkana", slug: "turkana", region: "Rift Valley", areas: ["Lodwar", "Kakuma", "Lokichar"] },
  { county: "West Pokot", slug: "west-pokot", region: "Rift Valley", areas: ["Kapenguria", "Makutano"] },
  { county: "Samburu", slug: "samburu", region: "Rift Valley", areas: ["Maralal", "Baragoi"] },
  { county: "Elgeyo Marakwet", slug: "elgeyo-marakwet", region: "Rift Valley", areas: ["Iten", "Kapsowar"] },
  { county: "Taita Taveta", slug: "taita-taveta", region: "Coast", areas: ["Voi", "Wundanyi", "Taveta", "Mwatate"] },
  { county: "Kwale", slug: "kwale", region: "Coast", areas: ["Kwale Town", "Ukunda", "Diani", "Msambweni"] },
  { county: "Lamu", slug: "lamu", region: "Coast", areas: ["Lamu Town", "Mokowe", "Hindi"] },
  { county: "Tana River", slug: "tana-river", region: "Coast", areas: ["Hola", "Garsen", "Bura"] },
  { county: "Garissa", slug: "garissa", region: "North Eastern", areas: ["Garissa Town", "Dadaab", "Masalani"] },
  { county: "Wajir", slug: "wajir", region: "North Eastern", areas: ["Wajir Town", "Habaswein"] },
  { county: "Mandera", slug: "mandera", region: "North Eastern", areas: ["Mandera Town", "El Wak", "Takaba"] },
  { county: "Marsabit", slug: "marsabit", region: "Eastern", areas: ["Marsabit Town", "Moyale", "Laisamis"] },
  { county: "Isiolo", slug: "isiolo", region: "Eastern", areas: ["Isiolo Town", "Merti", "Garbatulla"] },
];

/** Region display order for the browse page. */
export const REGIONS: Region[] = [
  "Nairobi Metro", "Coast", "Rift Valley", "Central", "Nyanza", "Western", "Eastern", "North Eastern",
];

/** Cities we spotlight on the homepage (biggest markets first). */
export const FEATURED_MARKETS: Array<{ name: string; county: string; blurb: string }> = [
  { name: "Nairobi", county: "Nairobi", blurb: "Kilimani, Westlands, Karen & more" },
  { name: "Mombasa", county: "Mombasa", blurb: "Nyali, Bamburi & the coast" },
  { name: "Kisumu", county: "Kisumu", blurb: "Milimani, Mamboleo & the lakeside" },
  { name: "Nakuru", county: "Nakuru", blurb: "Milimani, Section 58 & Naivasha" },
  { name: "Eldoret", county: "Uasin Gishu", blurb: "Elgon View, Kapsoya & Annex" },
  { name: "Thika", county: "Kiambu", blurb: "Thika, Ruiru, Juja & Kikuyu" },
];

// --- Lookup helpers -------------------------------------------------------

const COUNTY_BY_NAME = new Map<string, CountyEntry>();
const COUNTY_BY_AREA = new Map<string, CountyEntry>();
for (const c of KENYA_COUNTIES) {
  COUNTY_BY_NAME.set(c.county.toLowerCase(), c);
  for (const area of c.areas) {
    // First writer wins so a duplicated area name (e.g. "Milimani" exists in
    // several counties, "Syokimau" in Nairobi & Machakos) maps to the first,
    // largest market. Callers that know the county should pass it explicitly.
    const key = area.toLowerCase();
    if (!COUNTY_BY_AREA.has(key)) COUNTY_BY_AREA.set(key, c);
  }
}

export const ALL_COUNTY_NAMES: string[] = KENYA_COUNTIES.map((c) => c.county);

/** Is this string a known county name (case-insensitive)? */
export function isKnownCounty(name: string): boolean {
  return COUNTY_BY_NAME.has(name.trim().toLowerCase());
}

/** Canonical county name for a free-text input, or null. */
export function canonicalCounty(name: string): string | null {
  return COUNTY_BY_NAME.get(name.trim().toLowerCase())?.county ?? null;
}

/**
 * Best-effort county for a free-text area/neighborhood. Checks the area index
 * first, then falls back to treating the input as a county name itself.
 */
export function countyForArea(area: string): string | null {
  const key = area.trim().toLowerCase();
  return (COUNTY_BY_AREA.get(key) ?? COUNTY_BY_NAME.get(key))?.county ?? null;
}

/** Flat, de-duplicated list of every searchable place (areas + counties). */
export function allSearchablePlaces(): string[] {
  const set = new Set<string>();
  for (const c of KENYA_COUNTIES) {
    set.add(c.county);
    for (const a of c.areas) set.add(a);
  }
  return Array.from(set);
}
