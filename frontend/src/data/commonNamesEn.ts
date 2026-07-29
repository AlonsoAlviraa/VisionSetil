/**
 * English common names for catalog taxa (educational only).
 * Prefer SSOT vernacular_names.en; this map fills iconic gaps.
 * Never invents consumption permission.
 */

const COMMON_NAMES_EN_BASE: Record<string, string[]> = {
  'agaricus arvensis': ['Horse mushroom'],
  'agaricus bisporus': ['Cultivated mushroom', 'Button mushroom'],
  'agaricus campestris': ['Field mushroom'],
  'agaricus xanthodermus': ['Yellow-stainer'],
  'amanita caesarea': ["Caesar's mushroom"],
  'amanita muscaria': ['Fly agaric'],
  'amanita pantherina': ['Panther cap'],
  'amanita phalloides': ['Death cap'],
  'amanita rubescens': ['Blusher'],
  'amanita verna': ["Fool's mushroom"],
  'amanita virosa': ['Destroying angel'],
  'armillaria mellea': ['Honey fungus'],
  'boletus aereus': ['Dark cep', 'Bronze bolete'],
  'boletus edulis': ['Porcini', 'Penny bun', 'King bolete'],
  'boletus reticulatus': ['Summer bolete'],
  'calocybe gambosa': ["St. George's mushroom"],
  'cantharellus cibarius': ['Chanterelle', 'Golden chanterelle'],
  'cantharellus cinereus': ['Ashen chanterelle'],
  'chlorophyllum molybdites': ['Green-spored parasol'],
  'clitocybe rivulosa': ["Fool's funnel"],
  'coprinopsis atramentaria': ['Common inkcap'],
  'coprinus comatus': ['Shaggy inkcap', "Lawyer's wig"],
  'cortinarius orellanus': ["Fool's webcap"],
  'cortinarius rubellus': ['Deadly webcap'],
  'craterellus cornucopioides': ['Horn of plenty', 'Black trumpet'],
  'craterellus tubaeformis': ['Winter chanterelle', 'Yellowfoot'],
  'entoloma sinuatum': ['Livid entoloma'],
  'fistulina hepatica': ['Beefsteak fungus'],
  'flammulina velutipes': ['Enoki', 'Velvet shank'],
  'fomes fomentarius': ['Tinder fungus'],
  'galerina marginata': ['Funeral bell', 'Deadly galerina'],
  'ganoderma lucidum': ['Reishi'],
  'grifola frondosa': ['Hen of the woods'],
  'gyromitra esculenta': ['False morel'],
  'hericium erinaceus': ["Lion's mane"],
  'hydnum repandum': ['Wood hedgehog', 'Sweet tooth'],
  'hydnum rufescens': ['Terracotta hedgehog'],
  'hypholoma fasciculare': ['Sulphur tuft'],
  'hypholoma lateritium': ['Brick tuft'],
  'inocybe erubescens': ['Deadly fibrecap'],
  'inocybe geophylla': ['White fibrecap'],
  'lactarius deliciosus': ['Saffron milkcap'],
  'lactarius sanguifluus': ['Bloody milkcap'],
  'lactarius semisanguifluus': ['Semi-bloody milkcap'],
  'laetiporus sulphureus': ['Chicken of the woods'],
  'lepiota brunneoincarnata': ['Deadly dapperling'],
  'lepiota cristata': ['Stinking dapperling'],
  'lepista nuda': ['Wood blewit'],
  'macrolepiota excoriata': ['Slender parasol'],
  'macrolepiota procera': ['Parasol mushroom'],
  'marasmius oreades': ['Fairy ring mushroom'],
  'marasmius scorodonius': ['Garlic parachute'],
  'morchella elata': ['Black morel'],
  'morchella esculenta': ['Yellow morel'],
  'omphalotus olearius': ['Jack-o-lantern mushroom'],
  'paxillus involutus': ['Brown roll-rim'],
  'phallus impudicus': ['Common stinkhorn'],
  'pleurotus eryngii': ['King oyster'],
  'pleurotus ostreatus': ['Oyster mushroom'],
  'russula cyanoxantha': ['Charcoal burner'],
  'russula emetica': ['The sickener'],
  'russula vesca': ['Bare-toothed russula'],
  'scleroderma citrinum': ['Common earthball'],
  'sparassis crispa': ['Cauliflower fungus'],
  'suillus granulatus': ['Weeping bolete'],
  'suillus luteus': ['Slippery jack'],
  'trametes versicolor': ['Turkey tail'],
  'tricholoma equestre': ['Man on horseback'],
  'tricholoma portentosum': ['Soapy knight'],
  'tuber melanosporum': ['Black truffle'],
  'verpa conica': ['Thimble morel'],
}

export const COMMON_NAMES_EN: Record<string, string[]> = { ...COMMON_NAMES_EN_BASE }

/** Merge curated EN names with catalog vernaculars (curated first). */
export function enrichCommonNamesEn(taxon: string, existing: string[] = []): string[] {
  const key = taxon.trim().toLowerCase()
  const extra = COMMON_NAMES_EN[key] || []
  const merged: string[] = []
  const seen = new Set<string>()
  for (const n of [...extra, ...existing]) {
    const t = (n || '').trim()
    if (!t) continue
    // Never use scientific binomial as a "common" name filler
    if (t.toLowerCase() === key) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(t)
  }
  return merged
}
