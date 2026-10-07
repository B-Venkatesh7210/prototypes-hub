import type { Lang } from "./types";

export type CatalogVoice = {
  id: string;
  name: string;
  lang: Lang;
  gender: "f" | "m";
  region: string;
  description: string;
};

type Row = [string, string, Lang, "f" | "m", string, string];

// Gradium flagship voices (docs.gradium.ai/guides/voices/flagship-voices).
const ROWS: Row[] = [
  ["NbpkqMVS3CJeq2j8", "Zoey", "en", "f", "United States", "Playful, upbeat and Gen Z energy voice with a standard American accent"],
  ["YVzbrdWnnu9FgRn5", "Sunnie", "en", "f", "United States", "A joyful young American voice at medium-high pitch, warm and bubbly"],
  ["Bla6SbVMczYnOhfK", "Marlowe", "en", "f", "United States", "A bubbly, warm young American voice with a laugh under every word"],
  ["4SZHfMpw-p46Ywgs", "Harper", "en", "f", "United States", "Modern, confident and friendly voice with a standard American accent"],
  ["D6COLz20Hw7uh3UK", "Brooklyn", "en", "f", "United States", "A warm, effusive young American voice with contagious laughter"],
  ["6MFfc37kq0sBjBjy", "Sterling", "en", "m", "United States", "A warm energetic American adult voice with theatrical flair"],
  ["_6Aslh2DxfmnRLmP", "Russell", "en", "m", "United States", "A high-energy American adult voice that pushes and encourages"],
  ["r2sIQdqqoqgRJuXw", "Marcus", "en", "m", "United States", "A high-energy resonant American adult voice with unshakeable conviction"],
  ["POBHtemksfWQbng0", "Garrett", "en", "m", "United States", "A smooth low-pitched American adult voice with quiet magnetism"],
  ["KUpE0JVhjiIzp1Fk", "Damon", "en", "m", "United States", "A bright American adult voice that lights up with unfiltered excitement"],
  ["4rdlkbxRv4m3UQTW", "Tilly", "en", "f", "United Kingdom", "A bright, welcoming British English adult voice"],
  ["6PWnV0Nq4wu7RVBT", "Maeve", "en", "f", "United Kingdom", "A sparky, attentive British English adult voice that gets to the point"],
  ["GgfEkEJtxZR7gnpy", "Freya", "en", "f", "United Kingdom", "A young British voice, glossy and confident with bubbly sparkle"],
  ["y9bQqIDnyxwqK01t", "Elodie-Rose", "en", "f", "United Kingdom", "A young British voice with sharp energy and crisp articulation"],
  ["dME3IWyZBvmh1n1q", "Toby", "en", "m", "United Kingdom", "A sparky, attentive British English adult voice that gets to the point"],
  ["CF0NgaMwHMMrHZn0", "Reuben", "en", "m", "United Kingdom", "A confident, upbeat British English adult voice with infectious energy"],
  ["s_k3kLBbgeK9-xUg", "Freddie", "en", "m", "United Kingdom", "An easy-going, friendly British English adult voice"],
  ["kfzLbcdE_yXgLeUI", "Archie", "en", "m", "United Kingdom", "A bright, welcoming British English adult voice"],
  ["gqn4ytOULe-TQfjl", "Saoirse", "en", "f", "Ireland", "Warm and natural Irish English voice for conversational applications"],
  ["vimnD4UQG_36P43U", "Aoife", "en", "f", "Ireland", "Bright and engaging Irish English voice with lively, natural pacing"],
  ["I7GYfpcKbafFrYUv", "Declan", "en", "m", "Ireland", "Calm and confident Irish English voice with steady, natural pacing"],
  ["JuMRs5W5S52hzuge", "Cormac", "en", "m", "Ireland", "Bright and warm Irish English voice with cheerful, natural pacing"],
  ["YhIHaAfQ0cQPDV9R", "Solène", "fr", "f", "France", "A young French voice, bright and warm at a lively pace"],
  ["FXxJ9mANRq6BCTX5", "Noémie", "fr", "f", "France", "A young Parisian voice, warm and expressive with a quick playful pace"],
  ["s048cR1l2Jmu4k3B", "Maëlys", "fr", "f", "France", "A young French voice with a welcoming, upbeat delivery"],
  ["ZeSg853xFACESHHI", "Coralie", "fr", "f", "France", "A young Parisian voice, sweet and airy with fast, giggly charm"],
  ["6oIkS98REoVZ1dEw", "Apolline", "fr", "f", "France", "A sparky, attentive French adult voice that gets to the point"],
  ["biuhvu17TxVKOcyy", "Marius", "fr", "m", "France", "An energetic, well-poised French adult voice with confident assurance"],
  ["YKeBw3OV1RgpdhLh", "Jules", "fr", "m", "France", "A lively, expressive French adult voice"],
  ["iEu63s1rhn_kegTr", "Gaspard", "fr", "m", "France", "A warm, grounded French adult voice with the confidence of a trusted friend"],
  ["25AzBFyp6svYnJsj", "Damien", "fr", "m", "France", "An intense, engaging French adult voice with real conviction"],
  ["Tek4tJXiX6_yvXq7", "Augustin", "fr", "m", "France", "A curious, animated French adult voice"],
  ["xynYWquoAsrvM7UY", "Mélanie", "fr", "f", "Canada", "A warm, welcoming Québécois French adult voice"],
  ["sBLwTd5womVX8JOw", "Maude", "fr", "f", "Canada", "A bubbly, reassuring Québécois French adult voice"],
  ["MAYVpVTYBzLRqNC7", "Resi", "de", "f", "Germany", "Warm, grounded Bavarian voice with a measured, trustworthy delivery"],
  ["aBNlTApBeOlVKa23", "Lorena", "de", "f", "Germany", "A warm young German voice, gentle and lively"],
  ["4Mn9VfG2wsLLEzi5", "Jette", "de", "f", "Germany", "An upbeat young German voice with a light tone and warm bounce"],
  ["W4IqRNmU0pbxrKyn", "Femke", "de", "f", "Germany", "A joyful young German voice, warm and bubbly"],
  ["p6Uutkyi3j2iNAUu", "Annika", "de", "f", "Germany", "A sparky, attentive German adult voice that gets to the point"],
  ["2cx941cbFIXRc0ok", "Wastl", "de", "m", "Germany", "Lively, charming Bavarian voice with quick comedic timing"],
  ["Kf5m22mROozoMWj3", "Mats", "de", "m", "Germany", "A sparky, attentive German adult voice that gets to the point"],
  ["20zdyYrQPzKlCwkk", "Leon", "de", "m", "Germany", "A bright, welcoming German adult voice"],
  ["yyS1KYWs6mXoEw7D", "Henrik", "de", "m", "Germany", "An easy-going, friendly German adult voice"],
  ["lbpBQTVCOcOHJ5zS", "Erik", "de", "m", "Germany", "A confident, upbeat German adult voice with infectious energy"],
  ["3ZKKapPOvuWFcw9f", "Anton", "de", "m", "Germany", "A vibrant, engaging German adult voice"],
  ["TXbEUrHXNFlYBBKb", "Sophie", "de", "f", "Austria", "A warm, easy-going Austrian German adult voice"],
  ["iTQW2xFICXk8riV4", "Vera", "es", "f", "Spain", "A sweet, expressive young Castilian Spanish voice"],
  ["b6FvJAiokjdqIti4", "Noa", "es", "f", "Spain", "A glossy, confident young Castilian Spanish voice"],
  ["3p0eIGbkmny71GlA", "Lucía-Sol", "es", "f", "Spain", "A bouncy, chipper young Castilian Spanish voice"],
  ["c9wqBDmQiBie5q6Y", "Candela", "es", "f", "Spain", "An enthusiastic, bubbly young Castilian Spanish voice"],
  ["u2UscyAnHilpiwmf", "Alba", "es", "f", "Spain", "A sweet, expressive young Castilian Spanish voice with lively emphasis"],
  ["sVLgzKMqaptUdaY8", "Mateo", "es", "m", "Spain", "A sparky, attentive Peninsular Spanish adult voice"],
  ["jvPx8j8zLGQ3utZz", "Marcos", "es", "m", "Spain", "A confident, upbeat Peninsular Spanish adult voice"],
  ["t-_TS1e-0GzDAX02", "Iker", "es", "m", "Spain", "An easy-going, friendly Peninsular Spanish adult voice"],
  ["ZeL1KGaZ4BZ2w0Np", "Alvaro", "es", "m", "Spain", "A bright, welcoming Peninsular Spanish adult voice"],
  ["VDwnGxAo68C8U8vC", "Ximena", "es", "f", "Mexico", "A playful, expressive Mexican Spanish adult voice"],
  ["B36pbz5_UoWn4BDl", "Valentina", "es", "f", "Mexico", "A warm and engaging Mexican voice for natural storytelling"],
  ["tWll9uiMafMXfOGw", "Emiliano", "es", "m", "Mexico", "An assured, upbeat Mexican Spanish adult voice with a touch of humor"],
  ["n7vovxcDTVG4gClo", "Diego", "es", "m", "Mexico", "A lively, expressive Mexican Spanish adult voice"],
  ["6k6cRt7QJfm5ChrH", "Rafaela", "pt", "f", "Brazil", "A spirited young voice with bell-like clarity and joyful bounce"],
  ["KgC2Nqnjj48NUiyV", "Manuela-Lu", "pt", "f", "Brazil", "A bright, sweet, chirpy young voice with a constant smile"],
  ["CtNvKUUMrx1h56ih", "Isadora", "pt", "f", "Brazil", "An upbeat young voice with a light tone and warm bounce"],
  ["uCqxlQCKi8sPHwG2", "Bianca", "pt", "f", "Brazil", "A bright, welcoming Brazilian Portuguese adult voice"],
  ["E8Zwjozrxupd4iQD", "Beatriz", "pt", "f", "Brazil", "A glossy, confident young voice with charismatic warmth"],
  ["AByHrwi1S-yLzW-s", "Mateus", "pt", "m", "Brazil", "A bright, welcoming Brazilian Portuguese adult voice"],
  ["NuUr_x5V90hSHzCJ", "Davi", "pt", "m", "Brazil", "A confident, upbeat Brazilian Portuguese adult voice"],
  ["Qit9Oc9fEO9yXsVw", "Caio", "pt", "m", "Brazil", "A sparky, attentive Brazilian Portuguese adult voice"],
  ["tWO-Q6DxWPj7syQA", "Sofia", "pt", "f", "Portugal", "Pleasant and engaging European Portuguese voice"],
  ["7yIuXOsv9bkpmRVv", "Joana", "pt", "f", "Portugal", "Friendly and approachable European Portuguese voice"],
  ["-n1BmuOkydfLDjxE", "Ricardo", "pt", "m", "Portugal", "Confident and articulate European Portuguese voice"],
  ["7iWpEw5Nt05GC1B0", "Paulo", "pt", "m", "Portugal", "Professional and reliable European Portuguese voice"],
];

export const CATALOG: CatalogVoice[] = ROWS.map(([id, name, lang, gender, region, description]) => ({
  id,
  name,
  lang,
  gender,
  region,
  description,
}));

export function voicesFor(lang: Lang): CatalogVoice[] {
  return CATALOG.filter((v) => v.lang === lang);
}

export function catalogVoice(id: string): CatalogVoice | undefined {
  return CATALOG.find((v) => v.id === id);
}

export function defaultVoice(lang: Lang, gender?: "f" | "m"): CatalogVoice {
  const list = voicesFor(lang);
  return (gender && list.find((v) => v.gender === gender)) || list[0];
}
