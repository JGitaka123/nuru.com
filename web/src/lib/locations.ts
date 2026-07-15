/**
 * Kenya location registry (web mirror of src/lib/locations.ts).
 *
 * Nuru is national: listings live in a county and a town/area. This drives
 * the homepage "browse by location" surface and the agent listing form's
 * county → area picker. Kept in sync with the server registry by hand — the
 * server remains the source of truth for search/derivation.
 */

export interface County {
  county: string;
  slug: string;
  region: Region;
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

export const KENYA_COUNTIES: County[] = [
  { county: "Nairobi", slug: "nairobi", region: "Nairobi Metro", areas: ["Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands", "Karen", "Runda", "Riverside", "Upperhill", "Hurlingham", "Ngong Road", "South B", "South C", "Langata", "Kasarani", "Roysambu", "Embakasi", "Donholm", "Buruburu", "Eastleigh", "Nairobi CBD"] },
  { county: "Mombasa", slug: "mombasa", region: "Coast", areas: ["Nyali", "Bamburi", "Shanzu", "Kizingo", "Tudor", "Mombasa CBD", "Likoni", "Mtwapa", "Kisauni", "Old Town"] },
  { county: "Kiambu", slug: "kiambu", region: "Nairobi Metro", areas: ["Thika", "Ruiru", "Juja", "Kiambu Town", "Kikuyu", "Limuru", "Ruaka", "Kahawa Sukari", "Membley", "Banana"] },
  { county: "Nakuru", slug: "nakuru", region: "Rift Valley", areas: ["Nakuru CBD", "Milimani", "Section 58", "Lanet", "Naivasha", "Gilgil", "Molo", "Njoro", "Kiamunyi"] },
  { county: "Kisumu", slug: "kisumu", region: "Nyanza", areas: ["Kisumu CBD", "Milimani", "Mamboleo", "Nyalenda", "Kondele", "Riat", "Manyatta", "Migosi"] },
  { county: "Uasin Gishu", slug: "uasin-gishu", region: "Rift Valley", areas: ["Eldoret CBD", "Elgon View", "Kapsoya", "Langas", "Pioneer", "Kimumu", "Annex", "West Indies"] },
  { county: "Machakos", slug: "machakos", region: "Eastern", areas: ["Machakos Town", "Athi River", "Mavoko", "Syokimau", "Kitengela", "Mlolongo"] },
  { county: "Kajiado", slug: "kajiado", region: "Rift Valley", areas: ["Kitengela", "Ngong", "Ongata Rongai", "Kiserian", "Kajiado Town", "Isinya"] },
  { county: "Nyeri", slug: "nyeri", region: "Central", areas: ["Nyeri Town", "Kamakwa", "Karatina", "Othaya", "Mweiga"] },
  { county: "Kilifi", slug: "kilifi", region: "Coast", areas: ["Kilifi Town", "Malindi", "Watamu", "Mtwapa", "Mariakani", "Vipingo"] },
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

/** Counties grouped by region, for the browse page. */
export function countiesByRegion(): Array<{ region: Region; counties: County[] }> {
  return REGIONS.map((region) => ({
    region,
    counties: KENYA_COUNTIES.filter((c) => c.region === region),
  })).filter((g) => g.counties.length > 0);
}
