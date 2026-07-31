# VisionSetil Mycology + Performance Uplift Audit

- **Generated:** 2026-07-31T1603Z
- **Workflow:** visionsetil-mycology-perf-uplift
- **Repo:** `C:\Users\Mariano\Documents\ALONSOO\VISIONSETIL`
- **Focus:** media+catalog+lookalikes+games
- **product_unlock:** false (orientation only)
- **Deploy:** none (plan only)

## Executive summary

VisionSetil already ships the full orientation-only product surface for Identify, Encyclopedia, Species Detail, Lookalike Studio, and Daily Games, with open-set abstain paths and product_unlock held false. The remaining work for the user focus media+catalog+lookalikes+games is not greenfield features but verifiable hardening: cut remote bandwidth and probe storms on encyclopedia grid and species gallery, remove the speciesPhotos hydrate race that thins the games pool, unify dual catalog-photo load paths, and deepen lookalike multi-view education without ever framing foodQuality or recipes as culinary permission.

This plan is capped at 10 tickets and a small PR DAG. P0 tickets attack measurable network/DOM waste (SpeciesPhotoCard quality/cascade defaults; SpeciesGallery blind Image probes). P1 tickets fix games pool readiness after hydrate, single-source speciesPhotos access, encyclopedia list scaling, a documented media prefer-local matrix, expanded diagnostic lookalike copy from open in-repo maps, broader verified games coverage from open-license photo rows, and FE/BE catalog snapshot parity stamping. P2 cleans residual content-visibility vs opacity jank. Every acceptance criterion is unit/e2e/curl-testable locally; no deploy, no product_unlock flip, no forage/consume language, open knowledge only (Index Fungorum, GBIF, Wikimedia Commons, iNaturalist open data, in-repo catalog/media SSOT).

## Phase A — Codebase explore

### Stack notes

React 18 + Vite dual shell (main-app.tsx / main-web.tsx, VITE_LAYOUT_MODE) PWA; FastAPI backend (classify, species, media, nomenclature, health) dual-mounted at / and /api. FE encyclopedia/games/lookalikes primarily offline-capable via code-split species_catalog_snapshot + speciesPhotos.json + static media/species/*/{thumb,card,detail}.webp. Identify critical path is backend-dependent (axios POST /classify). Orientation-only product language enforced in PageShell orientationSticky and catalog policy strings.

### Surfaces

- **Identify (multi-view classify UX)** (implemented) — paths: `frontend/src/pages/IdentifyPage.tsx`, `frontend/src/components/MultiViewWizard.tsx`, `frontend/src/components/ResultCard.tsx`, `frontend/src/components/ResultModeBanner.tsx`, `frontend/src/api/client.ts`, `frontend/src/lib/multiViewSlots.ts`, `frontend/src/lib/classifyMode.ts`, `frontend/src/lib/preflight.ts`, `backend/app/api/routes_classify.py`; Honesty flow capture|loading|result; classifyImages POST /classify with view_types + metadata; open-set/result modes via resolveDisplayMode; soft pre-submit coach; orientation sticky; no product_unlock consumption path.
- **Encyclopedia listing** (implemented) — paths: `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/hooks/useSpeciesCatalog.ts`, `frontend/src/data/speciesCatalog.ts`, `frontend/src/data/generated/species_catalog_snapshot.json`, `frontend/src/lib/catalogSearch.ts`, `frontend/src/data/photoTiers.ts`, `frontend/src/App.tsx`; Route /enciclopedia; SSOT client catalog (~523 via loadSpeciesCatalog snapshot v2); risk/food/family/trait/genus filters; ENCYCLOPEDIA_FIRST_PAGE_SIZE=12 + IntersectionObserver load-more; SpeciesPhotoCard grid; orientationSticky.
- **Species Detail ficha** (implemented) — paths: `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/components/SpeciesGallery.tsx`, `frontend/src/components/LookalikeCompare.tsx`, `frontend/src/lib/speciesAttribution.ts`, `frontend/src/lib/lookalikeRisk.ts`, `frontend/src/lib/speciesMeta.ts`, `frontend/src/lib/speciesRecipes.ts`, `frontend/src/lib/diagnosticViews.ts`; Route /enciclopedia/:slug; tabs morphology|habitat|lookalikes; SpeciesGallery multi-photo + attribution; rankLookalikes; Index Fungorum nomenclature resolve; collapsed external recipes with disclaimer; deadly multiview coach.
- **Lookalike Studio** (implemented) — paths: `frontend/src/pages/LookalikeStudioPage.tsx`, `frontend/src/lib/lookalikeStudio.ts`, `frontend/src/components/LookalikeCompare.tsx`, `frontend/src/lib/lookalikeRisk.ts`; Route /lookalikes; CLASSIC_LOOKALIKE_PAIRS educational confusions; 2–3 taxon compare; study badge on compare; never consumption guidance.
- **Games hub / dailyGames / quiz pool** (implemented) — paths: `frontend/src/pages/GamesHubPage.tsx`, `frontend/src/lib/dailyGames.ts`, `frontend/src/lib/dailyGames.test.ts`, `frontend/src/pages/SetadlePage.tsx`, `frontend/src/lib/setadle.ts`, `frontend/src/pages/QuizGamePage.tsx`, `frontend/src/lib/mushroomQuiz.ts`, `frontend/src/lib/quizMatch.ts`, `frontend/src/pages/MushroomWordlePage.tsx`, `frontend/src/lib/mushroomWordle.ts`, `frontend/src/components/setadle/HabitatSortGame.tsx`; LoLdle-style DAILY_GAME_MODES (setadle classic/photo/habitat, wordle, quiz); gamesDayKey + hashSeed; buildVerifiedGamesPool over CURATED_GAMES_TAXA; localStorage visionsetil_daily_games_v1; quiz modes name|photo|food|lookalike|season from documented foodQuality only.
- **Media cascade (speciesPhotos + /media)** (implemented) — paths: `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/lib/speciesImageService.ts`, `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/lib/speciesImageUrl.ts`, `frontend/src/data/speciesPhotos.json`, `frontend/src/hooks/useSpeciesImage.ts`, `frontend/src/main-web.tsx`, `frontend/src/main-app.tsx`, `media/species/`, `backend/app/api/routes_media.py`, `backend/app/services/species_media.py`; hydrateSpeciesPhotos dynamic import; thumb|display|hd via upgradePhotoUrl (Commons 250/500/1280); stage cascade catalog→local→placeholder→inline; SpeciesPhotoCard maxCandidates=5; Vite serves /media by default.
- **Backend catalog API** (implemented) — paths: `backend/app/api/routes_species.py`, `backend/app/services/unified_catalog.py`, `backend/app/services/species_catalog.py`, `backend/app/main.py`, `data/species_catalog/`; GET /species list/search, /species/{slug}, /species/lookup, /species/poisonous, by-scientific-name; locale es|ca|eu|en; FE encyclopedia does not call these — uses embedded snapshot instead.

### Performance hotspots

- **[P0]** Encyclopedia grid bandwidth: Grid cards default quality='display' (~500px wiki / iNat medium) with preferLocal:false and maxCandidates:5, so first paint prefers remote HD-ish covers and may fire multi-URL cascades per visible card. — `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/lib/speciesMediaStack.ts` — evidence: SpeciesPhotoCard quality = 'display' default; mediaStackWithTerminal({ quality, preferLocal: false, maxCandidates: 5 }); ENCYCLOPEDIA_FIRST_PAGE_SIZE=12 still multiplies remote weight. _(cite: repo path)_
- **[P0]** Species detail gallery probing: When gallery API empty, buildStaticGallery probes detail+card and 8 gallery URLs via new Image() — up to ~10 HEAD/GET probes per ficha open, then SpeciesImage may cascade more. — `frontend/src/components/SpeciesGallery.tsx` — evidence: probeImage(); Promise.all([probeImage(detail), probeImage(card)]); galleryUrls length 8; fetch tries /api/media/.../gallery then /media/.../gallery first. _(cite: repo path)_
- **[P1]** List virtualization absent: No react-window/virtuoso/FixedSizeList; infinite scroll appends (page+1)*PAGE_SIZE DOM cards. Grepped frontend/src for virtual|react-window|react-virtuoso|FixedSizeList — zero matches. — `frontend/src/pages/EncyclopediaPage.tsx` — evidence: results = allResults.slice(0, (page+1)*PAGE_SIZE); IntersectionObserver rootMargin '320px' setPage+1; full 523-taxon browse can accumulate large DOM + img nodes. _(cite: repo path)_
- **[P1]** speciesPhotos dual load path: hydrateSpeciesPhotos() code-splits speciesPhotos.json (~159KB) while speciesAttribution static-imports the same JSON — dual bundle path and attribution always pays the cost when detail/attribution loads. — `frontend/src/lib/speciesImageService.ts`, `frontend/src/lib/speciesAttribution.ts`, `frontend/src/main-web.tsx` — evidence: speciesImageService: import('../data/speciesPhotos.json'); speciesAttribution: import photosDb from '../data/speciesPhotos.json'; main-web void hydrateSpeciesPhotos() after paint. _(cite: repo path)_
- **[P1]** Daily games pool vs photo hydrate race: buildVerifiedGamesPool requires getCatalogPhotoUrl(taxon); if photos db still pending, pool drops taxa (empty/thin) until re-render after hydrate — GamesHub does not await hydrateSpeciesPhotos. — `frontend/src/lib/dailyGames.ts`, `frontend/src/pages/GamesHubPage.tsx`, `frontend/src/lib/speciesImageService.ts` — evidence: if (!photoUrl || !isPlausiblePhotoUrl(photoUrl)) continue; db starts version 'pending'; GamesHub useMemo([catalog, locale]) only. _(cite: repo path)_
- **[P1]** Media opacity / content-visibility interplay: Opacity fade on load is intentional; content-visibility was removed from cards due to black frames with opacity:0, but still applied on family sections, marketing card imgs, and mushroom-grid cards — residual risk of empty frames / layout jank. — `frontend/src/styles/tokens.css`, `frontend/src/styles/campo-nocturno.css`, `frontend/src/styles/marketing.css`, `frontend/src/styles/global.css`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx` — evidence: species-image__img--loading opacity 0.35 → --loaded 1; species-photo-card__img:not(.is-loaded) opacity 0.55; comment 'content-visibility removed from cards — left empty black frames'; still .ency-family-section content-visibility:auto; marketing .species-photo-card__img content-visibility:auto; .mushroom-grid .mushroom-card content-visibility:auto. _(cite: repo path)_
- **[P2]** Per-card 404 cascade on local stubs: Stack tries detail/card/thumb/gallery/catalog URLs; missing local webps cause sequential onError advances. Backend serve_species_variant may sibling-fallback but FE still issues multiple requests. — `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/components/SpeciesImage.tsx`, `backend/app/services/species_media.py` — evidence: buildSpeciesMediaStack ranks detail/card/catalog/gallery/thumb/lqip; SpeciesImage advanceFrom on error/tiny naturalWidth; serve_species_variant sibling fallback quality=sibling_fallback. _(cite: repo path)_
- **[P2]** Index Fungorum search chattiness: Scientific queries and every detail open hit backend /nomenclature/resolve (debounced 280ms on search) — fine for single calls, extra latency on ficha open. — `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/indexFungorum.ts` — evidence: resolveIndexFungorumName → `${API_BASE}/nomenclature/resolve?q=`; SpeciesDetailPage useEffect on scientificName. _(cite: repo path)_

### Product gaps

- **Encyclopedia vs backend catalog**: FE browse/detail use client snapshot (loadSpeciesCatalog) not GET /species; backend catalog locale/edibility enrichment is parallel SSOT not wired into UI list/detail. — `frontend/src/data/speciesCatalog.ts`, `backend/app/api/routes_species.py`, `frontend/src/hooks/useSpeciesCatalog.ts` — impact: Catalog drift risk between FE snapshot and API; no server-side pagination of 523 taxa.
- **Species Detail recipes**: Collapsed external recipe links for documented comestible taxa (speciesRecipes) — educational framing present but high policy sensitivity next to risk chips; still not forage permission if copy holds. — `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/speciesRecipes.ts`, `frontend/src/data/speciesRecipes.json` — impact: Safety/copy audit surface; ensure never surfaces on Identify ResultCard (code comment asserts encyclopedia-only).
- **Games verified pool coverage**: Pool excludes curated taxa lacking catalog photo URL shape or common/family; games quality uneven until speciesPhotos coverage improves. — `frontend/src/lib/dailyGames.ts`, `frontend/src/data/speciesPhotos.json` — impact: Fewer daily secrets / fallbacks; foto-mode modes thinner than catalog size.
- **Lookalike education depth**: Detail lookalikes often name-ranked list + LookalikeCompare thumbs; diagnostic pair notes exist for classics but many SSOT lookalikes lack multi-view diagnostic copy. — `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/lookalikeRisk.ts`, `frontend/src/lib/diagnosticViews.ts`, `frontend/src/lib/lookalikeStudio.ts` — impact: Educational confusion teaching uneven outside CLASSIC_LOOKALIKE_PAIRS.
- **Encyclopedia list scaling**: No windowed virtualization; group-by-family multiplies sections; full filtered catalog can be walked via infinite scroll. — `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/data/photoTiers.ts` — impact: Scroll jank / memory on low-end phones as page grows.
- **Media dual-origin complexity**: Prefer catalog remote vs local /media differs by component (SpeciesPhotoCard preferLocal false; SpeciesImage detail preferCatalog true; grid useSpeciesImage context=grid sync-only) — hard to reason about failures. — `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/hooks/useSpeciesImage.ts` — impact: Inconsistent first paint, harder perf tuning.

### Media cascade

Canonical cascade: hydrateSpeciesPhotos → getCatalogPhotoUrlHd(upgradePhotoUrl Commons/iNat sizes) + speciesImageUrl(/media/species/{slug}/{variant}.webp). SpeciesImage stageOrder: detail prefers catalog then local primary/card/thumb/placeholder/inline; grids insert catalog before placeholder after local. SpeciesPhotoCard uses mediaStackWithTerminal ranked stack with onError peel + terminal SVG. Opacity: tokens.css loading 0.35/loaded 1; campo-nocturno card imgs 0.55→1 (always paint, never opacity 0). content-visibility:auto on ency-family-section and some card/grid selectors; intentionally not full card virtualization. Backend routes_media: /media/species/{slug}/{variant}, gallery JSON, manifest; sibling_fallback for missing variants.

### Games

GamesHubPage builds verified pool from CURATED_GAMES_TAXA ∩ catalog ∩ plausible photo URL; pickDailyFromPool(hashSeed(day|salt)). Modes: /setadle/classic|photo|habitat, /wordle, /reto (quiz). Setadle modes classic|clue|trait|habitat|photo in setadle.ts; HabitatSortGame for habitat. Quiz pool buildQuizPool/buildDailyChallenge from foodQuality-documented taxa; DAILY_MATCH_ROUNDS=6, DAILY_QUIZ_SECONDS=20. Progress localStorage visionsetil_daily_games_v1 + quiz best keys. Educational only · markDailyGameDone on completion.

## Phase B — Open knowledge sources (license-gated)

Accepted **33** sources (CC0/CC-BY/ODbL/open API/MIT/Apache/PD). Rejected **19** (license/url gate).

- **Danish Fungi 2020 / DanishFungiDataset (DF20/DF24)** — https://github.com/BohemianVRA/DanishFungiDataset — **license:** BSD-3-Clause (code; https://github.com/BohemianVRA/DanishFungiDataset/blob/main/LICENSE); data/models non-commercial research only per README — lane:`github-oa` — Large European (Denmark Atlas of Danish Fungi) fine-grained image+metadata catalog (~1.6k species): habitat/substrate/month metadata, train/test splits, baselines—useful for media catalog and multi-view ID research, not culinary use.
- **FungiTastic multimodal fungi benchmark** — https://github.com/BohemianVRA/FungiTastic — **license:** BSD-3-Clause (code; https://github.com/BohemianVRA/FungiTastic/blob/main/LICENSE); dataset terms follow project docs/Kaggle—verify before product use — lane:`github-oa` — ~350k multimodal expert-curated observations / ~5k species (Atlas of Danish Fungi lineage): open-set/few-shot/chronological splits, body-part masks, DNA-sequenced test subset, cost-sensitive poisonous-vs-edible error framing for lookalike/safety education UX (orientation only).
- **FGVCx 2018 Fungi Classification Challenge (Svampe Atlas)** — https://github.com/visipedia/fgvcx_fungi_comp — **license:** MIT (repo; https://github.com/visipedia/fgvcx_fungi_comp/blob/master/LICENSE); dataset CLOSED non-commercial + no redistribution of images per Terms of Use — lane:`github-oa` — 1,394 European (Denmark) fungi species with COCO-style JSON categories/annotations and image packs hosted via GBIF labs—species catalog + media for FGVC baselines; not redistributable for product media.
- **GloBI FungalTraits (Põlme et al. 2020) machine-readable tables** — https://github.com/globalbioticinteractions/fungaltraits — **license:** UNKNOWN (repo has no LICENSE; packaged CSVs of Fungal Diversity OA supplementary—recheck source terms) — lane:`github-oa` — CSV/TSV trait matrices of fungal genera and sequences (primary/secondary lifestyle, growth form, fruitbody type, pathogen/endophyte capacity)—core open trait resource for catalog enrichment and lookalike ecological context.
- **traitecoevo/fungaltraits (funfun) dynamic fungal trait DB** — https://github.com/traitecoevo/fungaltraits — **license:** MIT (DESCRIPTION License: MIT + file LICENSE; https://github.com/traitecoevo/fungaltraits/blob/master/LICENSE) — lane:`github-oa` — Versioned R package/living trait database collating fungal functional measurements and genus-level FUNGuild-style guilds—programmatic trait matrix for orientation encyclopedia.
- **dnabarcoder fungal barcode similarity cutoffs** — https://github.com/vuthuyduong/dnabarcoder — **license:** Apache-2.0 (https://github.com/vuthuyduong/dnabarcoder/blob/master/LICENSE) — lane:`github-oa` — Open tool + ready UNITE 2024 ITS/ITS1/ITS2 cutoffs for clade-aware sequence identification; supports open-set abstain behavior when similarity is below cutoffs—catalog/taxonomy validation lane, not field foraging.
- **Catalogue of the Rust Fungi of Belgium (Darwin Core checklist)** — https://github.com/trias-project/uredinales-belgium-checklist — **license:** MIT (https://github.com/trias-project/uredinales-belgium-checklist/blob/master/LICENSE) — lane:`github-oa` — Europe (Belgium) standardized Darwin Core species checklist of Uredinales with raw→processed pipeline; GBIF-publishable checklist pattern reusable for Iberia regional lists.
- **FungiCLEF 2025 starter / tooling (dsgt-arc)** — https://github.com/dsgt-arc/fungiclef-2025 — **license:** MIT (https://github.com/dsgt-arc/fungiclef-2025/blob/main/LICENSE) — lane:`github-oa` — Open MIT code for LifeCLEF FungiCLEF 2025 fine-grained fungi classification (poisonous-species focus in challenge literature); patterns for media classifiers and safety-weighted ranking in education products.
- **100 Species Challenge web app (Luomus)** — https://github.com/luomus/species-challenge — **license:** MIT (https://github.com/luomus/species-challenge/blob/main/LICENSE) — lane:`github-oa` — Open game/challenge UX for observing 100 species of plants/fungi/insects with admin-managed species lists (JSON taxa files)—template for gamified catalog learning, not foraging permission.
- **Global Soil Mycobiome consortium (GSMc) analysis code** — https://github.com/Mycology-Microbiology-Center/GSMc — **license:** MIT (https://github.com/Mycology-Microbiology-Center/GSMc/blob/main/LICENSE) — lane:`github-oa` — MIT pipelines for global soil fungal diversity (UNITE clustering/BLAST); points to PlutoF OTU+taxonomy+functional metadata—Europe/global diversity catalog backbone (data via PlutoF DOI).
- **GBIF Terms of use (data licensing CC0 / CC BY / CC BY-NC)** — https://www.gbif.org/terms — **license:** CC0 OR CC-BY-4.0 OR CC-BY-NC-4.0 (per dataset; plus data user agreement) — lane:`taxonomic-apis` — Governs all GBIF-mediated occurrence and related open data: publishers must assign one of three Creative Commons choices (CC0, CC BY 4.0, CC BY-NC 4.0). Users must follow the data user agreement (attribution, DOI citation of downloads). Clarifies commercial-use grey areas for CC BY-NC. Essential license gate for media+catalog pipelines that ingest Spain/Europe fungi occurrences.
- **GBIF API Reference (base URL, sections, rate limits)** — https://techdocs.gbif.org/en/openapi/ — **license:** CC0 OR CC-BY-4.0 OR CC-BY-NC-4.0 (per dataset; API access under GBIF terms) — lane:`taxonomic-apis` — Canonical REST docs: base https://api.gbif.org/; sections Registry, Species, Occurrence, Occurrence Images, Maps v2, Literature, Validator, Vocabularies. Documents paging (limit/offset), repeatable params (e.g. country=ES), range queries (year for phenology), rate limits (HTTP 429), download-for-bulk preference, User-Agent guidance. Foundation for taxonomy IDs, Iberian occurrence filters, maps, and seasonal histograms.
- **GBIF Species API (Checklist Bank, name match, taxon keys)** — https://techdocs.gbif.org/en/openapi/v1/species — **license:** CC0 OR CC-BY-4.0 OR CC-BY-NC-4.0 (checklist/source dependent; under GBIF terms) — lane:`taxonomic-apis` — Taxonomic backbone services: discover species/higher taxa, interpret/match scientific names, retrieve GBIF taxon keys and complete names used on the portal. Bridges Index Fungorum/Species Fungorum names into occurrence/map queries. Critical for catalog IDs, lookalike taxon linking, and game species decks with stable keys.
- **GBIF Occurrence API (search, downloads, geotemporal filters)** — https://techdocs.gbif.org/en/openapi/v1/occurrence — **license:** CC0 OR CC-BY-4.0 OR CC-BY-NC-4.0 (per occurrence/dataset; under GBIF terms) — lane:`taxonomic-apis` — Occurrence Store search and async downloads for presence points with coordinates, event dates, country/region, taxonKey, media links. Filter kingdom/Fungi + country=ES (Spain) or European ISO codes for Iberia-focused phenology (month/year distributions) and range maps. Prefer downloads for large extracts; cite DOI. Supports catalog density, lookalike co-occurrence context, and map-backed education games—not forage permission.
- **GBIF Maps API v2 (tiled occurrence maps)** — https://techdocs.gbif.org/en/openapi/v2/maps — **license:** CC0 OR CC-BY-4.0 OR CC-BY-NC-4.0 (underlying data per dataset; map display under GBIF terms) — lane:`taxonomic-apis` — Tiled web map service to visualize GBIF-mobilized occurrences on interactive maps (overlay with other layers). Use for species range orientation, Iberian density heat-style tiles by taxonKey/country, and map UIs in catalog/games. Accuracy/boundary disclaimers apply (see GBIF terms maps section).
- **Species Fungorum Plus (Kew checklist on GBIF)** — https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 — **license:** CC-BY-4.0 — lane:`taxonomic-apis` — GBIF-registered global fungal checklist from Royal Botanic Gardens, Kew (accepted names / taxonomic opinions complementary to Index Fungorum nomenclature). Provides citable dataset with explicit CC BY 4.0 for checklist-backed catalog labels and synonym orientation usable with GBIF Species/Occurrence APIs. Pair with IF for name registration IDs vs accepted-name views.
- **iNaturalist API v1 Swagger/OpenAPI docs** — https://api.inaturalist.org/v1/docs/ — **license:** UNKNOWN (API access under iNaturalist Terms; per-record media/observation licenses vary CC0/CC-BY/CC-BY-NC/etc.) — lane:`taxonomic-apis` — Primary REST surface for observations, taxa, places, identifications, projects (swagger.json). Filter by place (Spain/Iberia places), taxon (Fungi), quality_grade=research, month for phenology, photos for media catalog/lookalike training sets and games. Rate limits and bulk-export guidance on sister pages; do not treat labels as culinary permission.
- **iNaturalist Open Data (AWS S3 licensed images + metadata README)** — https://github.com/inaturalist/inaturalist-open-data — **license:** CC0 OR CC-BY OR CC-BY-NC (per photo/observation; Creative Commons varying by image) — lane:`taxonomic-apis` — Documentation for s3://inaturalist-open-data: bulk photos (original/large/medium/small/thumb/square) plus monthly CSVs (observations, observers, photos, taxa, projects). License column + observer attribution required. Best open path for large media catalogs, lookalike photo sets, and educational games without hammering live API. Filter to open CC licenses only; NC restricts commercial product use.
- **iNaturalist Licensed Observation Images (AWS Open Data Registry)** — https://registry.opendata.aws/inaturalist-open-data/ — **license:** Creative Commons or Public Domain (CC0), varying by image — lane:`taxonomic-apis` — Official AWS Registry listing: no-sign-request S3 access, real-time image posts, monthly metadata, cite registry URL. Entry point for reproducible open media pulls tied to observation date/location for phenology and Iberia subsets via metadata joins. License varies per image—always join photos.csv license field before reuse in catalog/games.
- **Wikidata:Licensing** — https://www.wikidata.org/wiki/Wikidata:Licensing — **license:** CC0 (structured data in main/property/lexeme namespaces); CC BY-SA 4.0 (text in other namespaces) — lane:`wikidata-wiki` — Authoritative license policy: all main-namespace structured fungus/taxon claims are CC0 for catalog joins, quizzes, and offline media metadata; non-data wiki text is CC BY-SA 4.0 with attribution.
- **Wikidata:Data access** — https://www.wikidata.org/wiki/Wikidata:Data_access — **license:** CC0 (structured data); OA API terms (Wikimedia Terms of Use apply to service use) — lane:`wikidata-wiki` — Documents free SPARQL/API dumps for fungi taxon graphs; CC0 data enables educational catalogs and game decks without royalty friction; attribution to Wikidata encouraged though not required under CC0.
- **Wikidata Property:P789 edibility** — https://www.wikidata.org/wiki/Property:P789 — **license:** CC0 (property definition and structured values) — lane:`wikidata-wiki` — Mycology-specific property with constrained values (e.g. deadly mushroom Q19888591, poisonous mushroom Q359511, choice/edible/caution/inedible). Use ONLY as field-guide orientation labels for educational UI and toxicity triage—never as culinary permission; supports open-set abstain when missing/conflicting.
- **Wikidata Property:P788 mushroom ecological type** — https://www.wikidata.org/wiki/Property:P788 — **license:** CC0 — lane:`wikidata-wiki` — Habitat/ecology axis for mushrooms (mycorrhiza Q99974, saprobiont Q114750, parasitism Q186517). Useful for educational filters, habitat quizzes, and catalog facets—not foraging guidance.
- **Wikidata Property:P225 taxon name** — https://www.wikidata.org/wiki/Property:P225 — **license:** CC0 — lane:`wikidata-wiki` — Canonical scientific name strings for fungus taxa; example includes Cantharellaceae (Q80945). Core catalog key for species encyclopedia, sitelinks, and crosswalk to images/media.
- **Wikidata Property:P1391 Index Fungorum taxon ID** — https://www.wikidata.org/wiki/Property:P1391 — **license:** CC0 (Wikidata property/claims); external IF records are separate (check Index Fungorum terms) — lane:`wikidata-wiki` — Stable external ID bridge from Wikidata fungi items to Index Fungorum (formatter https://www.indexfungorum.org/names/NamesRecord.asp?RecordID=$1). Examples: Agaricus Q390456 → 17030. Enables open catalog dedupe and nomenclatural crosswalks.
- **Wikidata mushroom morphology properties (P783–P787 listing context)** — https://www.wikidata.org/wiki/Wikidata:Database_reports/List_of_properties/all — **license:** CC0 (structured property metadata); page prose CC BY-SA 4.0 — lane:`wikidata-wiki` — Documents mycology property set: P783 hymenium type, P784 mushroom cap shape, P785 hymenium attachment, P786 stipe character, P787 spore print color, plus P788/P789. Trait vectors for ID training games, lookalike contrast cards, and morphological catalogs—not identification certificates.
- **Wikidata:SPARQL query service/queries/examples** — https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples — **license:** CC0 (queryable data results); example page text CC BY-SA 4.0 — lane:`wikidata-wiki` — Official example SPARQL patterns for building fungus catalogs (filter by instance of fungus/taxon, properties P225/P105/P789/P788/P1391). Example query skeleton: SELECT ?item ?taxonName ?edibility WHERE { ?item wdt:P225 ?taxonName; wdt:P789 ?edibility. } — educational retrieval only; low-confidence/missing P789 must abstain.
- **Category:Fungi of Spain — Wikimedia Commons** — https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain — **license:** Per-file free licenses (typically CC BY / CC BY-SA / PD / CC0); structured file metadata often CC0; non-free not hosted — lane:`wikidata-wiki` — Iberia-relevant free image pool for species cards, multi-view capture education, and media galleries. Always read each file description page for exact license and attribution before reuse.
- **Commons:Licensing — Wikimedia Commons** — https://commons.wikimedia.org/wiki/Commons:Licensing — **license:** Policy page (reuse rules for free content); accepted file licenses include CC0, CC BY, CC BY-SA, PD (NC/ND rejected) — lane:`wikidata-wiki` — Rules for which fungus photos can enter educational apps/games: commercial-compatible free licenses only; fair-use and NC/ND excluded. Pair with Wikipedia article text CC BY-SA 4.0 (https://en.wikipedia.org/wiki/Wikipedia:Copyrights and https://creativecommons.org/licenses/by-sa/4.0/).
- **iNaturalist Research-grade Observations (GBIF dataset)** — https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 — **license:** CC0 / CC BY 4.0 / CC BY-NC 4.0 (observation-level; export filter) — lane:`toxicity-iberia` — Open RG citizen-science media+occurrences of toxic/lookalike fungi in Spain/Portugal when licensed CC0/CC-BY/CC-BY-NC; photos for catalog UI and games. Confirm per-record license; not a curated toxicity authority.
- **Wikimedia Commons Category:Poisonous fungi** — https://commons.wikimedia.org/wiki/Category:Poisonous_fungi — **license:** Mixed open (per-file: typically CC BY / CC BY-SA / PD / GFDL dual; check each file) — lane:`toxicity-iberia` — Open media pool tagged poisonous fungi (includes Amanita phalloides and related categories)—source images for encyclopedia cards, lookalike side-by-sides, and non-commercial games if file license allows. Never scrape closed stock.
- **Wikidata (fungi taxa and linked media/properties)** — https://www.wikidata.org/ — **license:** CC0 — lane:`traits-multiview` — Taxon QIDs, Index Fungorum/MycoBank IDs, interlanguage labels, and Commons image links for catalog backbone and lookalike graph stubs without closed copyright text.
- **Mushroom Observer (observations, multi-image, licenses)** — https://mushroomobserver.org/info/how_to_use — **license:** CC BY-SA 4.0 default (user-selectable CC / public domain) — lane:`traits-multiview` — Community multi-view observations with notes useful for trait-tagged quizzes and lookalike discussions; software MIT on GitHub; require per-image license check before speciesPhotos ingest.

### Rejected (not used in plan)

- ~~FUNGuild ecological guild parser + database API~~ — https://github.com/UMNFuN/FUNGuild — UNKNOWN (no LICENSE file in repo) — reason: license-gate
- ~~UNITE Species Hypothesis (SH) info files (SBDI)~~ — https://github.com/biodiversitydata-se/unite-shinfo — CC BY-SA 4.0 (dataset DOI 10.17044/scilifelab.19411403.v2 per README) — reason: license-gate
- ~~Index Fungorum Data provision (SOAP API overview)~~ — https://www.indexfungorum.org/data.asp — UNKNOWN — reason: license-gate
- ~~Index Fungorum Fungus Web Service (SOAP endpoints + WSDL)~~ — https://www.indexfungorum.org/ixfwebservice/fungus.asmx — UNKNOWN — reason: license-gate
- ~~iNaturalist API Recommended Practices~~ — https://www.inaturalist.org/pages/api+recommended+practices — UNKNOWN (site/API terms; not a data license) — reason: license-gate
- ~~Amanita phalloides — Wikipedia (español)~~ — https://es.wikipedia.org/wiki/Amanita_phalloides — CC BY-SA 4.0 (article text; dual-license GFDL where applicable); media per file page — reason: license-gate
- ~~Envenenamiento por setas — Wikipedia (español)~~ — https://es.wikipedia.org/wiki/Envenenamiento_por_setas — CC BY-SA 4.0 (article text); media per file page — reason: license-gate
- ~~List of poisonous mushroom species (English Wikipedia)~~ — https://en.wikipedia.org/wiki/List_of_poisonous_mushroom_species — CC BY-SA 4.0 — reason: license-gate
- ~~List of deadly mushroom species (English Wikipedia)~~ — https://en.wikipedia.org/wiki/List_of_deadly_mushroom_species — CC BY-SA 4.0 — reason: license-gate
- ~~Anexo:Setas letales (Spanish Wikipedia)~~ — https://es.wikipedia.org/wiki/Anexo:Setas_letales — CC BY-SA 4.0 — reason: license-gate
- ~~Hongos venenosos (Spanish Wikipedia)~~ — https://es.wikipedia.org/wiki/Hongos_venenosos — CC BY-SA 4.0 — reason: license-gate
- ~~Amanita phalloides (English Wikipedia)~~ — https://en.wikipedia.org/wiki/Amanita_phalloides — CC BY-SA 4.0 — reason: license-gate
- ~~Amanita phalloides / oronja verde (Spanish Wikipedia)~~ — https://es.wikipedia.org/wiki/Amanita_phalloides — CC BY-SA 4.0 — reason: license-gate
- ~~Species Fungorum Plus (GBIF checklist dataset)~~ — https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 — CC BY 4.0 — reason: license-gate
- ~~FETOC Manual de setas tóxicas por toxíndromes (Spain clinical PDF)~~ — https://www.fetoc.es/asistencia/Micologia_manual_setas.pdf — UNKNOWN — reason: license-gate
- ~~Wikimedia Commons: Category Fungal morphology and anatomy~~ — https://commons.wikimedia.org/wiki/Category:Fungal_morphology_and_anatomy — Per-file CC / GFDL (mixed; check each file) — reason: license-gate
- ~~Commons file: Mushroom cap morphology2.png (cap/gill trait chart)~~ — https://commons.wikimedia.org/wiki/File:Mushroom_cap_morphology2.png — CC BY-SA 3.0 (also GFDL) — reason: license-gate
- ~~Wikipedia: Mushroom (macro morphology overview)~~ — https://en.wikipedia.org/wiki/Mushroom — CC BY-SA 4.0 — reason: license-gate
- ~~FungalTraits (Põlme et al.) via UNITE repository~~ — https://unite.ut.ee/repository.php — CC BY 4.0 (open-access paper/data ecosystem; confirm download bundle) — reason: license-gate

## Phase C — Gap matrix (knowledge → product)

| Surface | Need | Priority | Open sources | Proposed use | Safety |
|---|---|---|---|---|---|
| identify | Stable taxon keys, multi-view morphology cues (hymenium/cap/stipe/habitat), open-set similarity thresholds, and cost-sensitive poisonous-vs-edible error framing for abstain/reject UX. | P0 | https://github.com/BohemianVRA/FungiTastic; https://github.com/vuthuyduong/dnabarcoder; https://techdocs.gbif.org/en/openapi/v1/species; https://www.wikidata.org/wiki/Property:P783; https://www.wikidata.org/wiki/Property:P784; https://www.wikidata.org/wiki/Property:P785; https://www.wikidata.org/wiki/Property:P786; https://www.wikidata.org/wiki/Property:P787; https://github.com/dsgt-arc/fungiclef- | Ground identify ranking and missing-evidence multi-view prompts in open morphology properties and FungiTastic body-part/open-set patterns; use dnabarcoder-style cutoffs as conceptual abstain thresholds (catalog validation lane, not field barcode claims); keep deadly false-positive preference over culinary labels. | product_unlock=false. Orientation only. Never treat model top-1 as consume/forage permission. Preserve open-set abstain/reject and expert-review CTA; deadly/poisonous over-recall over under-recall. |
| encyclopedia | Single educational SSOT: scientific/common names, family, locale-aware labels, risk orientation fields, photo URL shape for cards, GBIF/IF/Wikidata keys—not parallel FE snapshot vs backend /species enrichment. | P0 | https://techdocs.gbif.org/en/openapi/v1/species; https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598; https://www.wikidata.org/wiki/Property:P225; https://www.wikidata.org/wiki/Property:P1391; https://www.wikidata.org/wiki/Property:P789; https://www.wikidata.org/wiki/Wikidata:Licensing; https://api.inaturalist.org/v1/docs/ | Plan wire of loadSpeciesCatalog/useSpeciesCatalog to GET /species (or shared build-time open pack) so browse/detail consume one locale/edibility-enriched catalog; join Wikidata P225/P1391 + Species Fungorum Plus for accepted names; list cards use license-gated thumb URLs only. Address FE virtualization later; knowledge join first. | P789/backend edibility = field-guide orientation chips only. Never map 'edible' to culinary permission. Missing/conflicting labels → abstain or unknown risk. Cite open dataset DOIs/attribution; no paywalled PDFs. |
| species-detail | Morphology, ecology type, toxicity orientation, lookalike stubs, multi-view media, optional phenology histogram—plus policy-safe handling of any recipe-adjacent links for documented comestible taxa. | P0 | https://www.wikidata.org/wiki/Property:P788; https://www.wikidata.org/wiki/Property:P789; https://www.wikidata.org/wiki/Property:P783; https://www.wikidata.org/wiki/Property:P784; https://www.wikidata.org/wiki/Property:P785; https://www.wikidata.org/wiki/Property:P786; https://www.wikidata.org/wiki/Property:P787; https://github.com/globalbioticinteractions/fungaltraits; https://github.com/traiteco | Enrich SpeciesDetailPage ficha sections from open trait matrices + Wikidata morphology/ecology; keep speciesRecipes collapsed external links only if copy stays educational and never implies forage/cook permission; prefer risk chips + lookalikes + multi-view over recipe surfaces. Paths: frontend/src/pages/SpeciesDetailPage.tsx, frontend/src/lib/speciesRecipes.ts. | HIGH POLICY SENSITIVITY next to risk chips: recipes are not permission to pick/cook/eat. Prefer demoting or removing recipe UX if copy weakens orientation framing. Expert confirmation always required. No closed-copyright recipe books. |
| lookalikes | Dangerous-pair graph, multi-view diagnostic contrast copy (gills/cap/stipe/habitat), co-occurrence context, and cost-sensitive poisonous/edible confusion framing for education—not ID certificates. | P0 | https://github.com/BohemianVRA/FungiTastic; https://github.com/dsgt-arc/fungiclef-2025; https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://github.com/inaturalist/inaturalist-open-data; https://mushroomobserver.org/info/how_to_use; https://www.wikidata.org/; https://techdocs.gbif.org/en/openapi/v1/occurrence | Deepen lookalikeRisk/diagnosticViews/lookalikeStudio beyond name-ranked lists: pair-level multi-view notes for classics first, then SSOT pairs lacking copy; pull license-checked dual thumbs from iNat Open Data / Commons / MO; FungiTastic poisonous-vs-edible error framing for education ranking of confusable pairs. | Always surface dangerous lookalikes when present. Side-by-sides are orientation aids only. Never say a taxon is safe to eat because a lookalike is not. Open-set: low-confidence pairs → refuse definitive discrimination. |
| traits-ficha | Machine-readable trait vectors: lifestyle/guild, growth form, fruitbody type, hymenium/cap/stipe/spore-print, ecological type (P788), substrate/habitat axes for educational ficha filters. | P1 | https://github.com/globalbioticinteractions/fungaltraits; https://github.com/traitecoevo/fungaltraits; https://www.wikidata.org/wiki/Property:P783; https://www.wikidata.org/wiki/Property:P784; https://www.wikidata.org/wiki/Property:P785; https://www.wikidata.org/wiki/Property:P786; https://www.wikidata.org/wiki/Property:P787; https://www.wikidata.org/wiki/Property:P788; https://www.wikidata.org/wi | Build orientation trait ficha from GloBI FungalTraits + traitecoevo/fungaltraits (MIT package) joined to Wikidata morphology properties via SPARQL dumps; expose as catalog facets and Species Detail sections—not field harvesting cues. Recheck GloBI repo LICENSE (UNKNOWN) before product packaging; prefer OA supplementary terms. | Traits are ecological/morphological orientation. Never infer edibility from lifestyle/guild. Missing traits → show unknown and abstain from forced completeness. Open knowledge only. |
| dichotomous-key | Ordered multi-view character states (cap shape, hymenium type/attachment, stipe, spore print color, ecology) plus abstain paths when characters missing—aligned to CANONICAL_VIEWS. | P1 | https://www.wikidata.org/wiki/Property:P783; https://www.wikidata.org/wiki/Property:P784; https://www.wikidata.org/wiki/Property:P785; https://www.wikidata.org/wiki/Property:P786; https://www.wikidata.org/wiki/Property:P787; https://www.wikidata.org/wiki/Property:P788; https://github.com/traitecoevo/fungaltraits; https://github.com/BohemianVRA/DanishFungiDataset | Author educational key steps from open morphology/ecology property vocabularies and DF20-style multi-view research metadata patterns (non-commercial research data terms—do not redistributable DF images into product without license clear). Key ends in orientation shortlist + expert review, never forage go-ahead. | Keys must include 'cannot determine / missing evidence' branches. Deadly taxa paths over-weight caution. No consumption advice at terminal nodes. DF20 data/models non-commercial research only per README—code BSD-3 may be used; data not free commercial media. |
| quiz-pool | Verified taxa with common name, family, license-clean photo URL shape, optional trait/toxicity orientation labels for educational decks—pool quality currently gated by speciesPhotos coverage. | P0 | https://github.com/luomus/species-challenge; https://github.com/inaturalist/inaturalist-open-data; https://registry.opendata.aws/inaturalist-open-data/; https://commons.wikimedia.org/wiki/Commons:Licensing; https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://www.wikidata.org/wiki/Property:P225; https://www.wikidata.org/wiki/Property:P789 | Expand dailyGames verified pool by requiring catalog photo URL + common/family from open media joins (iNat Open Data license column, Commons free licenses only); adopt species-challenge JSON taxa-list pattern for admin-managed educational decks. Paths: frontend/src/lib/dailyGames.ts, frontend/src/data/speciesPhotos.json. | Quizzes teach recognition, not foraging. Prefer toxic/lookalike education decks with high severity framing. Exclude NC media from commercial builds. Never score 'edible ID' as culinary success. |
| daily-games | Even quiz/media coverage, challenge UX patterns, Iberia-relevant taxa decks, map/phenology optional bonus rounds—without implying harvest seasons as pick windows. | P1 | https://github.com/luomus/species-challenge; https://github.com/BohemianVRA/FungiTastic; https://techdocs.gbif.org/en/openapi/v1/occurrence; https://techdocs.gbif.org/en/openapi/v2/maps; https://github.com/inaturalist/inaturalist-open-data; https://www.wikidata.org/wiki/Wikidata:Data_access | Use Luomus species-challenge as MIT UX/list template; fill media holes via license-filtered open bulk photos; optional GBIF month histograms/maps as educational seasonality games with range disclaimers. Improve uneven quality by blocking pool members lacking photo+names. | Gamification is catalog learning only—not forage permission. Phenology games must state observation seasonality ≠ safe harvest window. Attribution for CC-BY media required. |
| speciesPhotos-media-cascade | License-gated multi-origin media policy: remote catalog vs local /media, per-image CC fields, Iberia/Spain pools, multi-view preference; unify SpeciesPhotoCard/SpeciesImage/useSpeciesImage failure modes. | P0 | https://github.com/inaturalist/inaturalist-open-data; https://registry.opendata.aws/inaturalist-open-data/; https://api.inaturalist.org/v1/docs/; https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://commons.wikidata.org/wiki/Commons:Licensing; https://mushroomobserver.org/info/how_to_use; https://www.gbif.org/terms; https://github.com/BohemianVRA/DanishFungiDataset | Plan single media resolver policy doc + code path: prefer local offline when present, else catalog remote with license/attribution metadata; grid sync-only from speciesPhotos (no live hammer); detail may hydrate open catalog URLs. Ingest only CC0/CC-BY/CC-BY-SA/PD (exclude NC/ND for commercial). DF20/FGVCx images: research/non-redistributable—use for research baselines, not product media packs. Pa | Per-file license + attribution mandatory. No scraping paywalled/stock. FGVCx Terms: CLOSED non-commercial + no redistribution of images—do not productize those packs. Media never certifies identity or edibility. |
| safety-copy | Orientation-only product language, toxicity severity tiers, lookalike warning templates, open-set abstain phrasing, expert validation CTAs—aligned to SAFETY_POLICY and mycology-safety skill. | P0 | https://www.wikidata.org/wiki/Property:P789; https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://github.com/BohemianVRA/FungiTastic; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7; https://www.wikidata.org/wiki/Wikidata:Licensing | Drive ES/EN safety strings from constrained P789 value set (deadly/poisonous/caution/inedible/etc.) as risk orientation labels; FungiTastic cost-sensitive error framing for copy that prioritizes poisonous misses; never rephrase edible into permission. Cross-check SpeciesDetail recipe adjacency copy. | HARD: never grant permission to consume, forage, pick, cook, or eat. Forbidden: safe to eat / you can eat this. Required: orientation only, unsafe_to_consume, expert human validation, confidence + possible rejection. |
| offline-pack | Honest subset of catalog+media+lookalike notes redistributable offline: CC0/CC-BY (and commercial-compatible) taxa cards, toxicity orientation, diagnostic pairs—explicit license manifest and coverage limits. | P1 | https://github.com/inaturalist/inaturalist-open-data; https://www.wikidata.org/wiki/Wikidata:Licensing; https://www.wikidata.org/wiki/Wikidata:Data_access; https://commons.wikimedia.org/wiki/Commons:Licensing; https://techdocs.gbif.org/en/openapi/v1/species; https://github.com/traitecoevo/fungaltraits | Ship offline pack as curated open-knowledge slice with LICENSE map per asset; exclude CC-BY-NC from commercial offline if product is commercial; document that offline pack is incomplete (open-set honesty) and not a field harvest guide. Prefer Wikidata CC0 structured claims + filtered Commons/iNat media. | Offline does not unlock culinary use. Pack must still abstain on low-confidence/missing taxa. No auto-deploy. No closed-copyright books/PDFs. Attribute CC-BY assets. |
| toxicity-labels | Consistent risk taxonomy (deadly/poisonous/caution/unknown) crosswalk from open structured sources into UI chips and backend poisonous catalog—never culinary grades. | P0 | https://www.wikidata.org/wiki/Property:P789; https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://github.com/BohemianVRA/FungiTastic; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7; https://github.com/dsgt-arc/fungiclef-2025 | Map P789 constrained values + local poisonous_species SSOT to FE risk chips; use poisonous-fungi Commons only for educational media; FungiCLEF/FungiTastic patterns for safety-weighted ranking in education UIs. Backend /species/poisonous remains authority for deadly list display. | Labels are risk classification for education and triage—not edibility certificates or cook advice. Conflicts/missing → unknown + caution. Prefer false positive deadly flags over false negatives. iNat RG is not a toxicity authority. |
| phenology | Month/year occurrence distributions for Iberia/Spain educational seasonality histograms and optional map tiles—observation density, not harvest calendars. | P2 | https://techdocs.gbif.org/en/openapi/v1/occurrence; https://techdocs.gbif.org/en/openapi/v2/maps; https://www.gbif.org/terms; https://api.inaturalist.org/v1/docs/; https://github.com/inaturalist/inaturalist-open-data; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 | Build educational phenology facets via GBIF Occurrence filters (kingdom Fungi, country=ES / Iberia ISO) with downloads+DOI citation preferred over heavy live search; iNat open metadata month filters as secondary; Maps API v2 for range orientation tiles with accuracy disclaimers. Wire as encyclopedia/detail/game context only. | Seasonality = when observations occur in open data—not when to forage. Maps have boundary/accuracy disclaimers per GBIF terms. CC-BY-NC datasets restrict commercial use—filter licenses. Never present as picking guide. |
| encyclopedia | List scaling awareness: full filtered catalog walk + group-by-family sections without windowed virtualization—knowledge packs must not assume unbounded in-memory render of media-heavy cards. | P2 | https://techdocs.gbif.org/en/openapi/; https://www.wikidata.org/wiki/Wikidata:Data_access; https://github.com/inaturalist/inaturalist-open-data | When expanding open catalog size (GBIF/Wikidata/iNat joins), plan progressive disclosure: page/window encyclopedia lists and tiered photos (photoTiers) so media enrichment does not freeze UI; knowledge layer remains SSOT joins, presentation uses virtualization later. Paths: EncyclopediaPage.tsx, photoTiers.ts. | Scaling is UX reliability; still orientation-only content. Do not drop toxicity/lookalike fields to save space on deadly taxa cards. |
| identify | Iberia/Europe checklist patterns and occurrence context for region-aware education priors—not permission to pick local taxa. | P2 | https://github.com/trias-project/uredinales-belgium-checklist; https://techdocs.gbif.org/en/openapi/v1/occurrence; https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598; https://github.com/Mycology-Microbiology-Center/GSMc | Reuse Darwin Core checklist pipeline patterns (trias-project MIT) for future Iberia educational lists; GBIF taxon keys for region filters; GSMc/UNITE as diversity backbone references via PlutoF DOI—not field foraging. | Regional presence in checklists/occurrences is educational biogeography only. Open-set abstain outside trained/catalogued coverage. No scrape of closed regional floras. |
| identify | Stable scientific-name match, multi-view diagnostic slots (cap/hymenium/stipe/habitat), open-set abstain thresholds, and deadly/poisonous lookalike flags for result cards—not culinary labels. | P0 | https://techdocs.gbif.org/en/openapi/v1/species (CC0/CC-BY/CC-BY-NC per checklist; GBIF terms); https://www.wikidata.org/wiki/Property:P783–P787 morphology properties (CC0 structured); https://www.wikidata.org/wiki/Property:P789 edibility (CC0 orientation values only); https://github.com/BohemianVRA/FungiTastic (BSD-3-Clause code; verify dataset terms—open-set/few-shot/cost-sensitive poisonous fra | Crosswalk user/catalog names via GBIF Species name-match + Wikidata P225/P1391; surface missing multi-view evidence using morphology props + FungiTastic body-part patterns; when confidence/margin low or below analog cutoffs, preserve reject/abstain; rank deadly confusions first using P789 + FungiCLEF safety-weight ideas. Paths: frontend IdentifyPage, MultiViewWizard, diagnosticViews, openSetReason | Never rephrase edibility as permission to consume. Open-set reject and recommend_human_review must remain first-class. product_unlock=false orientation only. |
| encyclopedia | Locale-enriched species catalog SSOT (scientific name, common names ES/EN, family, habitat/ecology, toxicity orientation, lookalike stubs, photo attribution) wired from open checklists—not parallel client-only snapshot vs backend. | P0 | https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 Species Fungorum Plus (CC-BY-4.0); https://techdocs.gbif.org/en/openapi/v1/species (GBIF terms); https://www.wikidata.org/wiki/Wikidata:Data_access (CC0 structured); https://www.wikidata.org/wiki/Property:P225; https://www.wikidata.org/wiki/Property:P1391 Index Fungorum ID; https://www.wikidata.org/wiki/Property:P788 ecological type | Plan single SSOT join: FE loadSpeciesCatalog / species_catalog_snapshot ↔ backend GET /species with GBIF taxonKey + IF/Wikidata IDs, locale common names, ecology facets (P788/FungalTraits), toxicity chips from P789 as field-guide orientation. Close gap at frontend/src/data/speciesCatalog.ts, useSpeciesCatalog.ts, backend/app/api/routes_species.py. Virtualization remains a FE scaling concern; knowl | Edibility/toxicity fields are educational risk labels only; missing/conflicting values must abstain. No closed-book scraping. Attribute CC-BY checklist DOIs. |
| species-detail | Per-taxon ficha: morphology vector, ecology, phenology, multi-view media with license/attribution, curated lookalikes with risk rank, open study links; no recipe-as-forage framing. | P0 | https://www.wikidata.org/ (CC0 claims + Commons media links); https://www.wikidata.org/wiki/Property:P783–P787; https://www.wikidata.org/wiki/Property:P788; https://www.wikidata.org/wiki/Property:P789; https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain (per-file free licenses); https://commons.wikimedia.org/wiki/Commons:Licensing; https://techdocs.gbif.org/en/openapi/v1/occurrence; https:/ | Enrich SpeciesDetailPage tabs (morphology/habitat/lookalikes) from Wikidata trait props + GBIF occurrence month histograms + license-gated media. Prefer open media metadata over speciesRecipes culinary adjacency; if recipe links remain, keep collapsed educational external links only for documented taxa and never next to risk chips as permission. Paths: SpeciesDetailPage.tsx, speciesMeta, Phenology | NEVER treat edible labels or recipes as consume/forage/cook permission. Expert confirmation required copy must stay visible. Avoid NC media in commercial builds without legal review. |
| lookalikes | Pairwise dangerous confusions, multi-view diagnostic contrast copy, co-occurrence context, cost-sensitive poisonous-vs-edible education framing. | P0 | https://github.com/BohemianVRA/FungiTastic (BSD-3-Clause code; dataset terms verify—poisonous error cost framing); https://www.wikidata.org/wiki/Property:P783–P787 morphology contrast; https://www.wikidata.org/wiki/Property:P789; https://commons.wikimedia.org/wiki/Category:Poisonous_fungi (per-file licenses); https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 iNat RG via GBIF (filte | Expand SSOT lookalike graph beyond name-ranked lists: for each pair, attach diagnostic multi-view notes (cap/hymenium/stipe/habitat) from morphology props + curated educational text; LookalikeCompare thumbs from Commons/iNat open photos only. Prefer deadly lookalikes first (lookalikeRisk). Close depth gap vs diagnosticViews/lookalikeStudio. Paths: SpeciesDetailPage lookalikes tab, LookalikeStudioP | Lookalike education is orientation only—never ID certificate or forage go/no-go. Deadly confusions over-indexed; abstain when pair media/traits incomplete. |
| traits-ficha | Machine-readable trait matrix: hymenium, cap shape, attachment, stipe, spore print, ecological type, lifestyle/guild, fruitbody form for filters and study cards. | P1 | https://www.wikidata.org/wiki/Property:P783; https://www.wikidata.org/wiki/Property:P784; https://www.wikidata.org/wiki/Property:P785; https://www.wikidata.org/wiki/Property:P786; https://www.wikidata.org/wiki/Property:P787; https://www.wikidata.org/wiki/Property:P788; https://github.com/traitecoevo/fungaltraits (MIT); https://github.com/globalbioticinteractions/fungaltraits (recheck source terms) | Build orientation trait vectors on catalog taxa for encyclopedia filters, studyTraits/flashcards, and dichotomous-key steps; join genus-level FungalTraits when species-level sparse; mark provenance + confidence. Paths: studyTraits.ts, speciesMeta, DichotomousKey. | Traits are educational morphology/ecology—not identification certificates. Missing traits → show unknown/abstain, never invent. |
| dichotomous-key | Ordered binary/ternary morphological decisions (hymenium type, cap shape, attachment, stipe character, spore print, ecology) with multi-view photo anchors and open-set exit ramps. | P1 | https://www.wikidata.org/wiki/Property:P783–P787 (CC0); https://www.wikidata.org/wiki/Property:P788; https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples; https://github.com/BohemianVRA/DanishFungiDataset (BSD-3-Clause code; data non-commercial research per README—do not productize NC images); https://github.com/BohemianVRA/FungiTastic (body-part masks as multi-view researc | Drive dichotomousKey.ts / DichotomousKey.tsx steps from Wikidata morphology axes; attach open multi-view examples only under free commercial-compatible licenses. Provide “not enough evidence / expert review” terminal nodes. DF20/FungiTastic inform research UX patterns only unless license allows product media. | Key is educational orientation—not definitive ID. Terminal nodes must not grant consumption advice; preserve abstain on ambiguous branches. |
| quiz-pool | Verified species decks with stable taxon keys, common+scientific names, family, free multi-view photos, toxicity orientation tags, and trait distractors for fair educational quizzes. | P0 | https://github.com/luomus/species-challenge (MIT game list patterns); https://github.com/inaturalist/inaturalist-open-data; https://registry.opendata.aws/inaturalist-open-data/; https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://techdocs.gbif.org/en/openapi/v1/species; https://www.wikidata.org/wiki/Property:P225; https://www.wikidata.org/wiki/Property:P789; https://github.com/Bohe | Regenerate quiz-eligible pool when species has license-OK photo URL shape + common name + family (close dailyGames gap). Use Wikidata/GBIF keys for stable IDs; Luomus challenge as UX template for admin-managed taxa JSON. Paths: mushroomQuiz.ts, quizMatch.ts, QuizGamePage, speciesPhotos.json. | Quizzes teach recognition/lookalike risk—never forage permission. Poisonous taxa may appear as educational hazards; copy must say orientation only. |
| daily-games | Daily seeded decks, habitat-sort and name games, photo quality tiers, and admin-style taxa lists with honest coverage limits when media missing. | P1 | https://github.com/luomus/species-challenge (MIT); https://github.com/inaturalist/inaturalist-open-data (per-photo licenses); https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://www.wikidata.org/wiki/Property:P788 habitat/ecology for habitat-sort; https://techdocs.gbif.org/en/openapi/v1/occurrence (month filters for seasonal daily themes—educational); https://github.com/dsgt-arc/fu | Improve dailyGames.ts pool quality by requiring verified speciesPhotos + family/common; HabitatSortGame ecology tags from P788; seasonal daily themes from GBIF month histograms without implying harvest windows. Paths: dailyGames.ts, GamesHubPage, setadle, speciesPhotos.json, photoTiers.ts. | Games are educational entertainment. No edible-as-win framing. Exclude closed FGVC image packs (FGVCx non-redistributable). |
| speciesPhotos-media-cascade | License-gated multi-origin media resolution (catalog remote vs local /media vs Commons/iNat open S3), attribution, tiered quality, and unified preferLocal/preferCatalog policy. | P0 | https://github.com/inaturalist/inaturalist-open-data (CC0/CC-BY/CC-BY-NC per photo); https://registry.opendata.aws/inaturalist-open-data/; https://api.inaturalist.org/v1/docs/ (per-record licenses); https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://commons.wikimedia.org/wiki/Commons:Licensing; https://techdocs.gbif.org/en/openapi/v1/occurrence (media links; per-dataset license);  | Plan single media cascade SSOT for SpeciesPhotoCard (preferLocal false), SpeciesImage (preferCatalog true), useSpeciesImage grid sync-only: ordered sources, license filter commercial-compatible, attribution chip, fallback placeholder, no silent closed ingest. Document dual-origin failure modes. Paths: SpeciesPhotoCard.tsx, SpeciesImage.tsx, useSpeciesImage.ts, speciesPhotos.json, speciesMediaStack | Join license column before any reuse; reject NC/ND/closed packs for product redistributable media. DF20/FGVCx images not for product redistribution. Attribution mandatory where license requires. |
| safety-copy | Consistent orientation-only language, toxicity severity chips, open-set abstain copy, expert validation CTAs, and cost-sensitive confusion messaging for deadly taxa. | P0 | https://www.wikidata.org/wiki/Property:P789 (orientation values: deadly/poisonous/choice/inedible—never culinary permission); https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://github.com/BohemianVRA/FungiTastic (poisonous-vs-edible error cost framing for education UX); https://github.com/dsgt-arc/fungiclef-2025 (poisonous-species focus patterns); https://www.gbif.org/terms | Centralize safetyCopy.ts / educationCopy / riskLabels: map P789-like classes to UI severity; forbid safe-to-eat phrasing; require expert confirmation; pair lookalike deadly alerts with multi-view missing-evidence prompts. Align with docs/SAFETY_POLICY and mycology-safety skill. Paths: safetyCopy.ts, RiskChip, FoodQualityChip, ResultCard, SpeciesDetailPage. | HARD: no consume/forage/pick/cook/eat permission. Edible labels = field-guide orientation only. product_unlock=false. Prefer false-positive deadly warnings over misses. |
| offline-pack | Honest offline subset: license-cleared taxa cards, toxicity orientation, lookalike names, trait stubs, and photo thumbnails with attribution—coverage % and freshness disclosed. | P1 | https://www.wikidata.org/wiki/Wikidata:Licensing (CC0 structured); https://github.com/inaturalist/inaturalist-open-data (filter free commercial-compatible only); https://commons.wikimedia.org/wiki/Commons:Licensing; https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 (CC-BY-4.0 checklist backbone); https://github.com/traitecoevo/fungaltraits (MIT trait excerpts with attribution) | offlinePack.ts / OfflinePackPage: ship only open-license snapshots with explicit pack composition (N taxa, media tier, license mix, last build), no claim of full Iberian coverage or live ID offline certainty. Prefer CC0/CC-BY media; exclude NC unless product policy allows. | Offline pack is educational orientation—not offline forage license. Disclose media/license gaps; preserve abstain when taxon not in pack. |
| toxicity-labels | Normalized toxicity/risk classes (deadly, poisonous, caution, unknown) with provenance, Iberian high-risk taxa media for education, and open-set when sources conflict. | P0 | https://www.wikidata.org/wiki/Property:P789 (CC0); https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 (filter open licenses; not toxicity authority); https://github.com/BohemianVRA/FungiTastic (cost-sensitive poisonous framing; verify data terms); https://github.com/dsgt-arc/fungiclef-2025 | Unify FE poisonousSpecies.json + backend /species/poisonous with Wikidata P789 as orientation layer; UI severity always max when any source says deadly. iNat/GBIF only for media/occurrence context, not as culinary or legal toxicity authority. Paths: poisonousSpecies.json, RiskChip, edibility.ts, foodQuality. | Not a curated medical authority. Conflicting/missing labels → unknown + abstain. Never edible=safe. Expert human validation required. |
| phenology | Month/year occurrence histograms for Iberia/Europe educational seasonality bars and seasonal game themes—not harvest calendars. | P1 | https://techdocs.gbif.org/en/openapi/v1/occurrence (country=ES/EU filters, month/year ranges; cite download DOI); https://techdocs.gbif.org/en/openapi/v2/maps; https://api.inaturalist.org/v1/docs/ (place Spain/Iberia, month, quality_grade=research); https://github.com/inaturalist/inaturalist-open-data (observation dates join); https://www.gbif.org/terms | Feed PhenologyBar / season packs from GBIF occurrence month distributions for Spain/Europe fungi with uncertainty disclaimers; optional Maps v2 tiles for range orientation. Paths: phenology.ts, PhenologyBar, season_pack_v1.json, SeasonRadar. | Phenology is observation density education only—never forage timing advice or permission to collect. Boundary/accuracy disclaimers per GBIF terms. |
| encyclopedia-list-scaling | Tiered media and catalog facets so filtered list can virtualize without loading full multi-origin images; family grouping metadata. | P2 | https://techdocs.gbif.org/en/openapi/v1/species; https://www.wikidata.org/wiki/Property:P225; https://github.com/inaturalist/inaturalist-open-data (thumb/square tiers); https://www.wikidata.org/wiki/Wikidata:Data_access | Pair photoTiers.ts with open thumb URLs and family from SSOT catalog so EncyclopediaPage can window/virtualize group-by-family without walking entire filtered catalog images. Knowledge mapping enables smaller offline/list payloads. Paths: EncyclopediaPage.tsx, photoTiers.ts, useSpeciesCatalog.ts. | List scaling is UX engineering; still show toxicity chips and orientation disclaimers on cards. No closed media shortcuts. |
| catalog-taxonomy-validation | Nomenclatural IDs (IF, GBIF taxonKey, Wikidata QID), synonym orientation, regional checklist patterns for Iberia backbone. | P1 | https://www.wikidata.org/wiki/Property:P1391; https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 (CC-BY-4.0); https://techdocs.gbif.org/en/openapi/v1/species; https://github.com/vuthuyduong/dnabarcoder (Apache-2.0—barcode cutoffs for open-set research lane); https://github.com/trias-project/uredinales-belgium-checklist (MIT Darwin Core checklist pipeline pattern); https://github.com | Dedupe catalog on IF/GBIF/Wikidata keys; Darwin Core checklist pipeline as template for future Iberia regional lists; DNA cutoffs only for lab/catalog validation lane—not field forage. Supports encyclopedia SSOT wiring and game deck stability. Paths: indexFungorum.ts, taxon_synonyms.json, backend species routes. | Taxonomy IDs are catalog hygiene—not field ID certificates. DNA tools never authorize consumption. |
| species-detail-recipes | Policy audit of speciesRecipes external links for documented comestible taxa: educational framing only, high sensitivity beside risk chips. | P0 | https://www.wikidata.org/wiki/Property:P789 (orientation only); https://www.wikidata.org/wiki/Wikidata:Licensing; https://commons.wikimedia.org/wiki/Commons:Licensing | Audit-only plan: keep or further demote collapsed external recipe links (speciesRecipes.ts/json) behind explicit orientation disclaimers; never promote as forage permission; prefer open study morphology/ecology links over culinary adjacency when risk chip is deadly/poisonous/caution. Paths: SpeciesDetailPage.tsx, speciesRecipes.ts, speciesRecipes.json. | HARD CONSTRAINT: NEVER grant permission to consume, forage, pick, cook, or eat any fungus. Edible labels and recipes are not culinary permission; expert confirmation required. product_unlock=false. |
| speciesPhotos-media-cascade | License-filtered multi-view image URLs + attribution + license field per photo; stable taxon keys (scientific name / GBIF taxonKey / IF id) to unify catalog remote vs local /media resolution and raise games-eligible photo coverage. | P0 | https://github.com/inaturalist/inaturalist-open-data (CC0/CC-BY/CC-BY-NC per photo; filter commercial-compatible only); https://registry.opendata.aws/inaturalist-open-data/ (S3 open data registry); https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain (per-file free licenses); https://commons.wikimedia.org/wiki/Commons:Licensing; https://mushroomobserver.org/info/how_to_use (default CC BY-SA  | Build an open media SSOT join (speciesPhotos + catalog photo URL shape) with prefer-order documented once: licensed remote thumb → catalog URL → local /media. Require license+attribution columns; drop NC/ND for commercial builds. Hydrate missing common/family photo eligibility so dailyGames verified pool grows. Paths: frontend/src/data/speciesPhotos.json, frontend/src/components/SpeciesPhotoCard.t | Media is orientation only; never imply forage readiness from photo quality. Multi-view gaps must surface missing_evidence, not false certainty. Exclude closed FGVC packs and non-commercial-only DF datasets from product redistribution. |
| encyclopedia | Single open catalog SSOT: accepted scientific names, common names (locale), family, GBIF/IF keys, risk orientation labels, optional ecology/morphology facets—wired to UI list/detail instead of dual FE snapshot vs backend enrichment. | P0 | https://techdocs.gbif.org/en/openapi/v1/species (GBIF Species API; per-dataset CC0/CC-BY/CC-BY-NC); https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 Species Fungorum Plus CC-BY-4.0; https://www.wikidata.org/wiki/Property:P225 taxon name CC0; https://www.wikidata.org/wiki/Property:P1391 Index Fungorum ID CC0; https://www.wikidata.org/wiki/Wikidata:Licensing CC0 structured data; htt | Plan merge of backend GET /species locale/edibility enrichment into the same contract as loadSpeciesCatalog so EncyclopediaPage browse/detail and useSpeciesCatalog share one open-enriched snapshot or live fetch. Keep offline-capable snapshot export from open joins only. Paths: frontend/src/data/speciesCatalog.ts, frontend/src/hooks/useSpeciesCatalog.ts, backend/app/api/routes_species.py, frontend/ | product_unlock=false; encyclopedia is education. Edibility fields are risk chips only—never culinary permission. Preserve abstain when name match or toxicity is missing/conflicting. |
| species-detail | Per-taxon orientation ficha: morphology (P783–P787), ecology (P788), risk (P789), open media, lookalike links, phenology month histogram stubs, attribution—without recipe-as-permission framing. | P0 | https://www.wikidata.org/wiki/Property:P789 edibility CC0; https://www.wikidata.org/wiki/Property:P788 ecological type CC0; https://www.wikidata.org/wiki/Wikidata:Database_reports/List_of_properties/all morphology P783–P787 CC0; https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples; https://techdocs.gbif.org/en/openapi/v1/occurrence; https://commons.wikimedia.org/wiki/Catego | Enrich SpeciesDetailPage from open trait/risk/media joins; keep speciesRecipes collapsed external links only if educational framing + risk chips remain and no forage CTA; prefer linking OA field guides over cooking content. Paths: frontend/src/pages/SpeciesDetailPage.tsx, frontend/src/lib/speciesRecipes.ts, frontend/src/data/speciesRecipes.json. | NEVER treat edible/comestible or recipe links as permission to pick/cook/eat. Expert confirmation required. Deadly taxa over-index warnings. High policy sensitivity on recipes—audit copy holds or remove. |
| lookalikes | Dangerous/safe lookalike pairs with multi-view diagnostic contrast notes (cap/hymenium/stipe/habitat), cost-sensitive poison-vs-edible error framing for education UX, open side-by-side media. | P0 | https://github.com/BohemianVRA/FungiTastic (BSD-3-Clause code; verify dataset terms before any media use); https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7 iNaturalist RG on GBIF; https://www.wikidata.org/ CC0 taxon graph; https://mushroomobserver.org/info/how_to_use multi-image CC; https://github.com/dsgt-arc/fungiclef- | Extend SSOT lookalike graph beyond name-ranked lists: pair diagnostic notes for each classic confusion; feed LookalikeCompare thumbs from license-cleared multi-view media; align lookalikeRisk/diagnosticViews/lookalikeStudio with poisonous catalog. Paths: frontend/src/pages/SpeciesDetailPage.tsx, frontend/src/lib/lookalikeRisk.ts, frontend/src/lib/diagnosticViews.ts, frontend/src/lib/lookalikeStudi | Always list dangerous lookalikes when present. Education on confusions is not identification certificate or forage OK. Prefer false-positive risk over missed deadly twin. Open-set abstain when pair evidence weak. |
| toxicity-labels | Constrained open risk vocabulary (deadly/poisonous/caution/inedible/unknown) with provenance, conflicts, and abstain-when-missing; Iberia-relevant toxic taxa media for chips only. | P0 | https://www.wikidata.org/wiki/Property:P789 edibility CC0 (deadly Q19888591, poisonous Q359511, etc.); https://commons.wikimedia.org/wiki/Category:Poisonous_fungi; https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7; https://github.com/BohemianVRA/FungiTastic cost-sensitive poisonous-vs-edible framing (code/docs; not culinary authority); https://www.wikidata.org/wiki/Wikidata:SPARQL_ | Map P789 + internal poisonous_species.json into UI risk chips shared by encyclopedia, detail, identify, games; backend catalog edibility enrichment becomes same SSOT as FE. Missing/conflicting labels → unknown/abstain. No cooking guidance from 'edible' values. | Labels are field-guide orientation only; never consumption permission. Deadly severity highest. Not a curated medical/toxicity legal authority—expert human validation always required. |
| quiz-pool | Verified taxa with scientific+common+family, eligible open photo URL, optional morphology/ecology facets for distractors; gamified list patterns without forage framing. | P1 | https://github.com/luomus/species-challenge MIT JSON taxa game lists; https://github.com/inaturalist/inaturalist-open-data license-filtered photos; https://www.wikidata.org/wiki/Property:P225; https://www.wikidata.org/wiki/Property:P789; https://www.wikidata.org/wiki/Property:P788; https://techdocs.gbif.org/en/openapi/v1/species | Grow verified pool by fixing photo URL shape + common/family gaps (speciesPhotos coverage); generate quiz decks from open catalog joins. Template admin JSON lists from species-challenge pattern. Paths: frontend/src/lib/dailyGames.ts, frontend/src/data/speciesPhotos.json. | Games are catalog learning only—not forage permission or ID certificate. Poisonous taxa may appear for recognition education with strong disclaimers. Exclude taxa lacking license-cleared media. |
| daily-games | Stable species decks with open thumbs, phenology/habitat optional hints, safety-weighted distractors for toxic confusions; uneven quality until media pool improves. | P1 | https://github.com/luomus/species-challenge MIT; https://github.com/dsgt-arc/fungiclef-2025 MIT poisonous-focus patterns; https://github.com/inaturalist/inaturalist-open-data; https://techdocs.gbif.org/en/openapi/v2/maps educational range tiles; https://www.wikidata.org/wiki/Property:P788 | Gate dailyGames verified pool on photo+metadata completeness; optional map/month hints from GBIF aggregates (orientation). Safety-weighted scoring when deadly lookalike is distractor. Paths: frontend/src/lib/dailyGames.ts, frontend/src/data/speciesPhotos.json. | No reward for 'edibility' guesses as consumption advice. Orientation/education only; open-set wrong answers should reinforce expert review. |
| phenology | Month/year occurrence histograms and seasonal facets for Spain/Iberia (and Europe context) from open occurrences—not harvest calendars. | P1 | https://techdocs.gbif.org/en/openapi/v1/occurrence (kingdom Fungi, country=ES, eventDate/month; prefer downloads+DOI); https://techdocs.gbif.org/en/openapi/ (rate limits, User-Agent); https://www.gbif.org/terms; https://api.inaturalist.org/v1/docs/ (place Spain/Iberia, month, quality_grade=research); https://github.com/BohemianVRA/DanishFungiDataset habitat/substrate/month metadata (research terms | Species-detail and catalog filters: educational month bars / season chips from aggregated open occurrences; games optional 'which month is peak observation' quizzes. Cite download DOI; accuracy disclaimers. | Phenology is observation density education, not permission to forage in season. Biases in citizen-science sampling apply. Never present as harvest guide. |
| offline-pack | Honest, license-cleared offline subset: catalog snapshot, toxicity labels, lookalike stubs, compressed open thumbs, attribution ledger; no closed books/PDFs. | P0 | Wikidata CC0 dumps/SPARQL (https://www.wikidata.org/wiki/Wikidata:Data_access); iNaturalist Open Data commercial-compatible subset only; Commons Fungi of Spain per-file free licenses; Species Fungorum Plus CC-BY-4.0 checklist fields; GBIF Species name keys under dataset licenses | Export offline-pack from open SSOT only; document what is included vs online-only (live classify, maps tiles, full media). Align FE catalog snapshot generation with backend enrichment so offline matches online risk labels. Paths: offline route OfflinePackPage, speciesCatalog snapshot. | Offline honesty: state product_unlock=false, no forage advice, expert still required. NC-licensed media must not ship in commercial offline packs. Preserve abstain when offline model/catalog incomplete. |
| traits-ficha | Machine-readable morphology + lifestyle/guild traits for educational ficha (hymenium, cap, stipe, spore print, mycorrhiza/saprobe/parasite, fruitbody type). | P1 | https://www.wikidata.org/wiki/Property:P783–P787 morphology set CC0; https://www.wikidata.org/wiki/Property:P788; https://github.com/globalbioticinteractions/fungaltraits (recheck source OA terms; repo LICENSE unknown); https://github.com/traitecoevo/fungaltraits MIT funfun living trait DB; https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples | Fill traits-ficha sections on species-detail and dichotomous-key leaves from open trait matrices + Wikidata; genus-level FUNGuild-style guilds for ecological context only. Prefer MIT fungaltraits + CC0 Wikidata over unlicensed repo CSVs until terms verified. | Traits are orientation aids, not identification certificates or edibility proof. Missing traits → show unknown, do not invent. No closed monographs. |
| dichotomous-key | Educational couplet characters from open morphology properties and multi-view photo exemplars; regional checklist backbone for Iberia scope. | P2 | Wikidata mushroom morphology P783–P787 CC0; https://github.com/trias-project/uredinales-belgium-checklist MIT Darwin Core checklist pipeline pattern; https://techdocs.gbif.org/en/openapi/v1/species; https://commons.wikimedia.org/wiki/Category:Fungi_of_Spain; https://mushroomobserver.org/info/how_to_use multi-view | Build key nodes from open trait vectors + license-cleared multi-view exemplars; regional filter via GBIF/checklist patterns (Belgium Uredinales as pipeline template for Iberia fungi checklists—not rust-only content lock-in). Terminal taxa link to species-detail risk+lookalikes. | Key path is educational branching, not guaranteed ID. Prefer abstain / 'needs expert' at ambiguous couplets. No forage terminal advice. |
| identify | Open-set taxonomy validation, multi-view evidence expectations, safety-weighted ranking patterns, stable taxon keys for top-k education—not culinary unlock. | P1 | https://github.com/vuthuyduong/dnabarcoder Apache-2.0 UNITE cutoffs (catalog/open-set abstain patterns; not field forage); https://github.com/dsgt-arc/fungiclef-2025 MIT; https://github.com/BohemianVRA/FungiTastic open-set/few-shot splits (terms verify); https://techdocs.gbif.org/en/openapi/v1/species name match; https://www.wikidata.org/wiki/Property:P1391 IF bridge | Align identify UX with multi-view capture education, missing_evidence prompts, and backend open-set reject; use open catalogs only for label vocab and lookalike panels post-result. DNA cutoffs inform abstain philosophy for sequence lanes—not product foraging. | orientation_only + unsafe_to_consume always. Low confidence / open_set_reason → no single-species certainty. Deadly recall prioritizes caution over accuracy. product_unlock=false. |
| safety-copy | Consistent orientation language for risk chips, recipe adjacency, games, offline, phenology maps; forbidden consumption-permission phrases; open source citations for educational claims. | P0 | https://www.wikidata.org/wiki/Property:P789 constrained values; https://www.gbif.org/terms maps accuracy disclaimers; https://commons.wikimedia.org/wiki/Commons:Licensing attribution norms; docs/SAFETY_POLICY.md and RULES.md (in-repo product policy; not external closed corpus) | Audit all surfaces (especially speciesRecipes near risk chips, encyclopedia edibility, games scoring, offline pack claims) for orientation-only framing and expert-confirmation CTAs; cite open licenses next to media/traits. | NEVER grant permission to consume, forage, pick, cook, or eat. NEVER treat edible labels as culinary OK. Preserve open-set abstain. No closed-copyright scraping or pirate PDFs. |
| encyclopedia-list-scaling | Efficient browse of large open-enriched catalog (photo tiers, family groups) without full DOM walk; media tier metadata from open sources. | P2 | Open catalog joins above (GBIF Species + Wikidata + license-filtered photos); frontend/src/data/photoTiers.ts (in-repo tiering) | Plan virtualization / windowing for EncyclopediaPage group-by-family infinite scroll once catalog grows from open enrichment; keep photo tier honesty when remote fails. Paths: frontend/src/pages/EncyclopediaPage.tsx, frontend/src/data/photoTiers.ts. | Scaling is UX-only; must not drop toxic taxa from filtered views by accident. Offline honesty if partial packs load. |
| catalog-taxonomy-backbone | Deduped nomenclatural graph: IF IDs, GBIF taxonKeys, accepted names vs synonyms, regional checklist pattern for Spain/Europe fungi. | P1 | https://www.wikidata.org/wiki/Property:P1391; https://techdocs.gbif.org/en/openapi/v1/species; https://www.gbif.org/dataset/bf3db7c9-5e5d-4fd0-bd5b-94539eaf9598 CC-BY-4.0; https://github.com/trias-project/uredinales-belgium-checklist MIT DwC pipeline; https://github.com/Mycology-Microbiology-Center/GSMc MIT (pipelines; PlutoF DOI data separate); https://github.com/vuthuyduong/dnabarcoder Apache-2. | Crosswalk FE speciesCatalog keys to GBIF/IF for lookalike links, games decks, phenology queries, and media joins; use DwC checklist pattern for future Iberia open lists. Do not auto-deploy. | Taxonomy backbone is for orientation catalogs only. Conflicting accepted names → show synonymy + abstain on ID certainty. No closed checklist PDFs. |
| range-maps-education | Iberia/Europe occurrence density tiles and disclaimer copy for species-detail and games map hints. | P2 | https://techdocs.gbif.org/en/openapi/v2/maps; https://techdocs.gbif.org/en/openapi/v1/occurrence; https://www.gbif.org/terms | Optional map overlays by taxonKey/country for educational range orientation; cite GBIF; pair with phenology histograms. Not harvest zone guides. | Maps are presence-of-observations education with accuracy/boundary disclaimers—not permission to collect. Online-only unless offline tiles are separately license-cleared (usually not). |

## Phase D — Performance backlog

### PERF-1 [P0] — Encyclopedia grid: default display-quality remote covers + multi-URL cascade per card

- **Paths:** `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/lib/speciesImageService.ts`, `frontend/src/data/photoTiers.ts`
- **Rationale:** SpeciesPhotoCard defaults quality='display' (~500px wiki/iNat), preferLocal:false, maxCandidates:5 so first paint prefers remote HD-ish covers and can peel up to 5 URLs per visible card. ENCYCLOPEDIA_FIRST_PAGE_SIZE=12 multiplies remote weight on first paint.
- **Acceptance:**
  - Encyclopedia grid cards use quality='thumb' (or ≤250px Commons/iNat) for non-priority rows; priority/first-row may use display only for ≤4 cards.
  - preferLocal true for grid stacks OR first successful local /media candidate wins before remote catalog when local pack exists.
  - First encyclopedia paint (page=0): network image transfer ≤ baseline −40% on cold cache (measure transferSize of image requests under /enciclopedia).
  - Per visible card: ≤2 image network requests before terminal SVG on happy path with hydrated photos.
  - data-photo-quality on grid cards is thumb for scroll rows; display only when priority prop is true.
- **Tests:**
  - `vitest run src/lib/speciesMediaStack.test.ts -t 'mediaStackWithTerminal'`
  - `vitest run src/lib/upgradePhotoUrl.test.ts`
  - `npx playwright test e2e/media-smoke.spec.ts -g 'encyclopedia cards'`
  - `npx playwright test e2e/encyclopedia-family-detail.spec.ts`
  - `Manual: DevTools Network filter Img on /enciclopedia — first 12 cards should not request 500px/1280px Commons unless priority.`

### PERF-2 [P0] — Species detail gallery: eliminate buildStaticGallery probe storm on empty API

- **Paths:** `frontend/src/components/SpeciesGallery.tsx`, `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/speciesImageUrl.ts`, `frontend/src/lib/speciesGalleryExtras.ts`, `backend/app/services/species_media.py`
- **Rationale:** When gallery API returns empty, buildStaticGallery probes detail+card and 8 gallery URLs via new Image() (~10 full GETs per ficha), then SpeciesImage hero may cascade more. Double-fetch of /api/media/.../gallery then /media/.../gallery adds latency.
- **Acceptance:**
  - Opening a species detail with empty gallery JSON issues ≤2 media existence checks (or zero probes if hero uses SpeciesImage cascade only).
  - No parallel probe of 8 galleryImageUrl slots on first paint; gallery thumbs load lazily on demand or from list_gallery / extras JSON only.
  - Hero still paints within 1s of ficha open via SpeciesImage cascade (preferCatalog + quality hd) without waiting on probeImage batch.
  - fetchGallery tries one gallery endpoint path when Vite /media prefix is known (avoid mandatory dual try on success path).
  - species-gallery data-loading flips false without ≥10 img GETs for thin packs.
- **Tests:**
  - `npx playwright test e2e/encyclopedia-family-detail.spec.ts -g 'detail'`
  - `npx playwright test e2e/loop-3h-smoke.spec.ts`
  - `Manual: open ficha with no gallery dir; Network count GET /media/species/*/gallery/* ≤1 until thumb strip interaction.`
  - `vitest: unit-test pure gallery planner if extracted from buildStaticGallery (no Image() in unit path).`

### PERF-3 [P1] — Encyclopedia infinite list virtualization (cap DOM + img nodes)

- **Paths:** `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/data/photoTiers.ts`
- **Rationale:** No react-window/virtuoso/FixedSizeList. results = allResults.slice(0,(page+1)*PAGE_SIZE) with IntersectionObserver rootMargin 320px appends full card trees; 523-taxon browse accumulates large DOM + img nodes.
- **Acceptance:**
  - Unfiltered encyclopedia scroll to ~100+ taxa keeps mounted .species-photo-card count ≤ ~2 viewports (e.g. ≤36–48 cards) via windowing OR recycle.
  - Scrolling full catalog does not grow document image node count linearly with 523 taxa (cap + recycle).
  - Family section headers remain accessible; keyboard focus and Link navigation to /especie/:slug still work.
  - First-page size still respects ENCYCLOPEDIA_FIRST_PAGE_SIZE (12) semantics for LCP; virtualization does not block first 12.
  - No regression of encyclopedia-count ≥ SSOT min.
- **Tests:**
  - `npx playwright test e2e/encyclopedia-count.spec.ts`
  - `npx playwright test e2e/encyclopedia-family-detail.spec.ts`
  - `npx playwright test e2e/loop-3h-smoke.spec.ts`
  - `Manual: evaluate document.querySelectorAll('.species-photo-card').length after scrolling mid-catalog — must stay bounded.`

### PERF-4 [P1] — Deduplicate speciesPhotos.json: single hydrate path (no static+dynamic dual load)

- **Paths:** `frontend/src/lib/speciesImageService.ts`, `frontend/src/lib/speciesAttribution.ts`, `frontend/src/main-web.tsx`, `frontend/src/main-app.tsx`, `frontend/src/main.tsx`, `frontend/src/data/speciesPhotos.json`
- **Rationale:** hydrateSpeciesPhotos() code-splits speciesPhotos.json (~159KB) while speciesAttribution static-imports the same JSON — dual bundle path; attribution always pays parse cost when detail/credit loads.
- **Acceptance:**
  - Exactly one module graph path loads speciesPhotos.json (dynamic OR static, not both).
  - attributionFromCatalog works after hydrate (or shared sync store); no empty license flash beyond existing coalesceAttribution behavior.
  - Production bundle analysis: speciesPhotos.json appears once in chunk graph (vite-bundle-visualizer or rollup output).
  - getCatalogPhotoUrl returns data after hydrateSpeciesPhotos resolves; tests inject via existing setter remain green.
- **Tests:**
  - `vitest run src/lib/speciesAttribution.test.ts`
  - `vitest run src/lib/speciesMediaVerify.test.ts`
  - `npm run build && inspect dist for single speciesPhotos chunk`
  - `src/test/setupCatalog.ts already awaits hydrateSpeciesPhotos — keep parity.`

### PERF-5 [P1] — Games verified pool: await photo hydrate before filtering by photoUrl

- **Paths:** `frontend/src/lib/dailyGames.ts`, `frontend/src/pages/GamesHubPage.tsx`, `frontend/src/lib/speciesImageService.ts`, `frontend/src/lib/setadle.ts`, `frontend/src/pages/SetadlePage.tsx`, `frontend/src/pages/QuizGamePage.tsx`
- **Rationale:** buildVerifiedGamesPool requires getCatalogPhotoUrl(taxon); db starts version 'pending'. GamesHub useMemo([catalog,locale]) does not await hydrateSpeciesPhotos — pool can be empty/thin until accidental re-render.
- **Acceptance:**
  - GamesHub (and photo/setadle modes that depend on verified pool) recompute after photos hydrate; pool size stable and ≥ curated intersection with catalog when photos ready.
  - No flash of empty/thin daily cards caused solely by pending photos db.
  - buildVerifiedGamesPool with hydrated fixture includes all CURATED_GAMES_TAXA that pass non-photo checks and have plausible URLs.
  - Educational-only copy and markDailyGameDone behavior unchanged.
- **Tests:**
  - `vitest run src/lib/dailyGames.test.ts`
  - `vitest run src/lib/setadle.test.ts`
  - `npx playwright test e2e/loop-3h-smoke.spec.ts -g 'games'`
  - `Manual: throttle CPU; open /juegos before hydrate — after hydrate, games-daily-photo and mode cards populate without full reload.`

### PERF-6 [P1] — Opacity load fades vs content-visibility: prevent empty/black frames

- **Paths:** `frontend/src/styles/tokens.css`, `frontend/src/styles/campo-nocturno.css`, `frontend/src/styles/marketing.css`, `frontend/src/styles/global.css`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`
- **Rationale:** species-image__img--loading opacity 0.35→1 and card imgs 0.55→1 are intentional; content-visibility was removed from cards (black frames with opacity:0) but remains on .ency-family-section, marketing .species-photo-card__img, and .mushroom-grid .mushroom-card.
- **Acceptance:**
  - No fully transparent (opacity:0) species photo surfaces while awaiting load; min loading opacity ≥0.35 (SpeciesImage) / ≥0.55 (cards) unless prefers-reduced-motion.
  - Cached images that skip onLoad still reach is-loaded / --loaded within one rAF (complete+naturalWidth check already in SpeciesImage — parity for SpeciesPhotoCard).
  - content-visibility:auto on marketing .species-photo-card__img removed or gated so it never pairs with opacity-hide; family sections keep contain-intrinsic-size ≥ card row estimate.
  - No black empty card frames on encyclopedia scroll in campo-nocturno theme.
- **Tests:**
  - `npx playwright test e2e/media-smoke.spec.ts`
  - `npx playwright test e2e/encyclopedia-family-detail.spec.ts`
  - `CSS/visual: screenshot first encyclopedia paint cold+warm cache`
  - `vitest optional: jsdom complete image sets loaded class.`

### PERF-7 [P1] — Thumb-first vs HD: explicit quality ladder for grid, hero, thumbs, lookalikes

- **Paths:** `frontend/src/lib/speciesImageService.ts`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/components/SpeciesGallery.tsx`, `frontend/src/components/SpeciesThumb.tsx`, `frontend/src/pages/LookalikeStudioPage.tsx`, `frontend/src/lib/upgradePhotoUrl.test.ts`
- **Rationale:** qualityForVariant + upgradePhotoUrl map thumb/display/hd (250/500/1280). Grid currently forces display; detail hero uses quality=hd; gallery thumbs correctly upgradePhotoUrl(...,'thumb') but lookalike SpeciesThumb cascade can still hit catalog HD via preferCatalog defaults.
- **Acceptance:**
  - Contract: grid/list=thumb, half-width card=display, detail hero/lightbox=hd only.
  - SpeciesThumb (size≤120) never requests Commons/iNat >250px (thumb).
  - Lookalike studio classic rail (size=44) stays on thumb variants; no 1280px remote on rail paint.
  - upgradePhotoUrl(url,'thumb'|'display'|'hd') unit tests cover wiki + iNat patterns; no non-allowlisted px sizes.
- **Tests:**
  - `vitest run src/lib/upgradePhotoUrl.test.ts`
  - `vitest run src/lib/speciesMediaStack.test.ts`
  - `Manual Network on /lookalikes and /enciclopedia — assert max remote edge length per surface.`

### PERF-8 [P2] — Reduce per-card 404 cascade on missing local WebP stubs

- **Paths:** `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `backend/app/services/species_media.py`
- **Rationale:** buildSpeciesMediaStack ranks detail/card/catalog/gallery/thumb/lqip; FE onError advances sequentially even when backend serve_species_variant already sibling_fallback. Missing locals cause multi-request peel per card.
- **Acceptance:**
  - When local primary missing, FE either uses known-good catalog URL first OR receives sibling_fallback without chaining ≥3 404s.
  - maxCandidates for grid ≤3 non-terminal (or explicit allowlist of proven variants).
  - SpeciesImage advanceFrom on tiny naturalWidth still works; no infinite loop.
  - X-Media-Quality sibling_fallback / stub_fallback paths remain documented and tested in media-smoke.
- **Tests:**
  - `npx playwright test e2e/media-smoke.spec.ts`
  - `vitest run src/lib/speciesMediaStack.test.ts`
  - `vitest run src/lib/speciesMediaVerify.test.ts`

### PERF-9 [P2] — Index Fungorum nomenclature resolve chattiness on search + every ficha

- **Paths:** `frontend/src/lib/indexFungorum.ts`, `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/catalogSearch.ts`
- **Rationale:** Scientific encyclopedia queries debounce 280ms then resolveIndexFungorumName → /nomenclature/resolve; SpeciesDetailPage also resolves on every scientificName open — extra latency and backend chatter for orientation-only names.
- **Acceptance:**
  - Encyclopedia: at most one resolve in flight per debounced query; abort previous (AbortController already — keep).
  - Species detail: cache resolve results in-memory (session Map) keyed by scientificName; repeat open of same taxon = 0 network.
  - Non-scientific encyclopedia queries skip IF resolve entirely (looksLikeScientificQuery gate preserved).
  - Nomenclature remains names-only; never feeds consumption/edibility UI.
- **Tests:**
  - `vitest run src/lib/indexFungorum.test.ts`
  - `vitest run src/lib/competitiveFeatures.test.ts -t 'nomenclature'`
  - `Manual Network: open same ficha twice — second visit no /nomenclature/resolve.`

### PERF-10 [P2] — Games surface media weight + optional games chunk isolation

- **Paths:** `frontend/src/pages/GamesHubPage.tsx`, `frontend/src/lib/dailyGames.ts`, `frontend/src/lib/mushroomQuiz.ts`, `frontend/src/lib/setadle.ts`, `frontend/src/lib/speciesGalleryExtras.ts`, `frontend/src/data/speciesGalleryExtras.json`
- **Rationale:** Games hub renders daily photo + mode card images; pool/photo URLs may be full catalog sizes. speciesGalleryExtras.json (~70KB) and quiz/setadle modules can inflate route cost if eagerly pulled with hub. Educational product only — optimize transfer, not unlock.
- **Acceptance:**
  - Games hub daily photo uses display (≤500px) not hd; mode card thumbs use thumb quality.
  - Route-level code-split: /juegos, /setadle/*, /wordle, /reto do not force-load encyclopedia-only media stacks.
  - buildVerifiedGamesPool photoUrl may store raw catalog URL but render path always upgradePhotoUrl(...,'display'|'thumb').
  - No increase in main-web entry parse cost attributable to games-only JSON.
- **Tests:**
  - `vitest run src/lib/dailyGames.test.ts`
  - `vitest run src/lib/mushroomQuiz.test.ts`
  - `vitest run src/lib/setadle.test.ts`
  - `npx playwright test e2e/loop-3h-smoke.spec.ts -g 'games'`
  - `Bundle: compare games route async chunks before/after.`

### PERF-11 [P1] — Detail hero LCP: prefer single cascade path, defer non-hero gallery work

- **Paths:** `frontend/src/components/SpeciesGallery.tsx`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/lib/speciesImageService.ts`
- **Rationale:** Hero uses SpeciesImage quality=hd preferCatalog while fetchGallery still runs probes/meta/extras in parallel — competes with LCP. Lightbox and thumb strip are secondary.
- **Acceptance:**
  - Largest Contentful Paint candidate on ficha is the hero img; no competing 8-probe gallery batch before hero onLoad.
  - Attribution may show catalog credit immediately (already attributionFromCatalog) without blocking hero.
  - Lightbox open may upgrade to hd if hero was display; default first paint can use display on slow networks (optional Save-Data).
  - Gallery extras merge does not block data-testid=species-gallery leaving loading state.
- **Tests:**
  - `npx playwright test e2e/encyclopedia-family-detail.spec.ts`
  - `npx playwright test e2e/loop-3h-smoke.spec.ts`
  - `Lighthouse/PW metrics on /especie/amanita-phalloides — hero LCP element is gallery hero img.`

### PERF-12 [P2] — Lookalike studio: cap concurrent SpeciesThumb network and keep educational framing

- **Paths:** `frontend/src/pages/LookalikeStudioPage.tsx`, `frontend/src/components/SpeciesThumb.tsx`, `frontend/src/lib/lookalikeStudio.ts`, `frontend/src/lib/lookalikeRisk.ts`
- **Rationale:** Classic confusion rail mounts multiple SpeciesThumb (SpeciesImage cascade) at once; each can trigger local+catalog fallbacks. Studio is education/orientation only — optimize bandwidth without implying edibility.
- **Acceptance:**
  - Classic rail thumbs use variant=thumb and loading=lazy except first 2 visible.
  - Concurrent image requests for lookalike rail ≤6 on first paint.
  - Orientation copy and risk chips unchanged; no culinary permission language introduced by perf work.
- **Tests:**
  - `vitest run src/lib/lookalikeStudio.test.ts`
  - `vitest run src/lib/lookalikeRisk.test.ts`
  - `Manual Network on /lookalikes first paint request cap.`

## Phase E — Adversarial safety review

**Overall: FAIL** (critical S1–S5 must pass)

| ID | Check | Result | Evidence |
|---|---|---|---|
| S1 | No edible-as-permission language in proposed UX/copy | **FAIL** | FAIL conservative: RULES.md R1 absolute ban on language "comestible"/"edible" is inconsistent with product/plan surface split; claim policy-r1-forbidden-edible-language was fully refuted (kept=0). Catalog copy still includes approval-adjacent phrasing e.g. frontend/src/data/additionalSpecies.ts and extendedSpecies.ts keyFeatures/descriptions "Excelente comestible" without inherent non-permission f |
| S2 | product_unlock remains false; no forage/consume permission | **PASS** | PASS: product_unlock forced false across uplift/ops — backend/eval/reports/open_set_thresholds.json product_unlock:false; docs/OPERATOR_UNLOCK_RUNBOOK.md forage_permission=false, consumption_permission=false, never auto-flip; docs/E21_SCALE_PLAN.md + VISION.md fail-closed; OfflinePackPage data-product-unlock="false". Plan/output is orientation education only, no unlock/deploy. |
| S3 | Open-set abstain / low-confidence path preserved in plan | **PASS** | PASS: docs/PHASE_B_HONEST_IDENTIFY.md preserves decision=rejected open-set orthogonal to mode, confidence only real+metrics_acceptable, educational blocked shell, preflight never hard-blocks gate; docs/SAFETY_POLICY.md default abstention when views/context missing; GTM_30_DAY_TRY_PLAN treats open-set as a feature. ResultCard.tsx keeps risk/reject paths without food chrome. |
| S4 | Toxicity / deadly lookalikes elevated over culinary framing | **PASS** | PASS on Identify plan/code: ResultCard forbids FoodQualityChip, auto-opens lookalikes when deadly/high, deadly callouts, risk-only chips (docs/SAFETY_POLICY.md D16; ResultCard.tsx). Residual weakness: lookalike education uneven outside CLASSIC_LOOKALIKE_PAIRS (SpeciesDetailPage + lookalikeRisk/diagnosticViews) and encyclopedia culinary chrome competes with risk, but plan still prioritizes deadly s |
| S5 | Offline pack honesty (no over-claim of offline ID certainty) | **PASS** | PASS: OfflinePackPage.tsx copy states study/reference only, "no identifica setas offline ni autoriza consumo", scope excludes offline ID/forage/consume, multiview honesty panel (offlinePackMultiviewHonesty) and data-product-unlock="false". LOOP/PHASE_D offline pack is Cache API fichas/media, not offline classifier certainty. |
| S6 | All external knowledge sources license-gated open only | **PASS** | PASS: docs/knowledge/OPEN_MYCOLOGY_SOURCES.md license gate CC0/CC-BY/CC-BY-SA/ODbL/MIT/Apache/PD; docs/DATA_SOURCES_OPEN_APIS.md + DATASET_INVENTORY_2026-07.md forbid paid apps/proprietary scrape; GBIF/iNat/IF/Wiki open paths only. Uplift knowledge plan cites open APIs + in-repo catalog paths. |
| S7 | No closed-copyright book/PDF scraping proposed | **PASS** | PASS: OPEN_MYCOLOGY_SOURCES §4 hard no paid field-guide PDFs/closed books; DATA_SOURCES_OPEN_APIS "never scrape paid apps"; MEGA_PLAN/PLAN_MEJORAS propose open harvest (GBIF/iNat) not pirate PDFs. No uplift PR path proposes closed-copyright book download. |
| S8 | Quiz/games educational framing without “eat this” outcomes | **PASS** | PASS: frontend/src/lib/dailyGames.ts header "Educational only · never forage / consumption permission"; mushroomQuiz.ts educational food_class learning with D16 teal not food-safe green, prompts "educación · no consumo", season not harvest calendar; SAFETY_POLICY quiz row educational-only not field ID. No planned quiz outcome grants eat/forage permission. |

### Residual risks

- R1 absolute ban on words comestible/edible conflicts with SAFETY_POLICY D16 educational food_class — constitutional inconsistency (claim policy-r1 failed).
- Species encyclopedia recipes (speciesRecipes.json / SpeciesDetailPage) contradict mycology-safety skill "never present foraging recipes or cooking tips" even with disclaimers.
- Catalog drift: FE loadSpeciesCatalog snapshot vs backend GET /species locale/edibility enrichment not single SSOT.
- Lookalike multi-view diagnostic copy sparse outside CLASSIC_LOOKALIKE_PAIRS — deadly-confusion education uneven.
- Catalog prose "Excelente comestible" in additionalSpecies/extendedSpecies can be misread as culinary approval if disclaimer not always co-visible.
- Games verified pool thinner than full catalog until speciesPhotos coverage improves — educational quality uneven, not a permission issue.

### Claims sampled

- `policy-r1-forbidden-edible-language` @ RULES.md: R1 forbids product language 'safe to eat', 'comestible', 'edible' as consumption approval; every output must be orientation_only + unsafe_to_consume.
- `policy-safety-no-consumption-advice` @ docs/SAFETY_POLICY.md: Safety policy: never give consumption advice; prefer false-unsafe over false-safe; default abstention when views/context missing; require human expert for sensitive decisions.
- `policy-api-always-unsafe` @ docs/SAFETY_POLICY.md: API always returns orientation_only and unsafe_to_consume; classifier never returns safe_to_eat; response includes 'No consumas ninguna seta identificada unicamente mediante una app.'
- `policy-identify-ban-food-chrome` @ docs/SAFETY_POLICY.md: Identify surface forbids FoodQualityChip, food-class badges, 'excelente comestible', and food-safe green on result chrome; risk chips only via RiskChip/riskLabels.
- `policy-encyclopedia-food-allowed-educational` @ docs/SAFETY_POLICY.md: Encyclopedia/Species detail may show food-quality labels as educational documentation with co-located no-consumption disclaimer; never 'safe to eat'.
- `policy-quiz-food-educational-only` @ docs/SAFETY_POLICY.md: Quiz/education games may use documented food_class for learning only with explicit educational framing; not a field ID result.
- `policy-if-never-edible-map` @ docs/SAFETY_POLICY.md: Index Fungorum names must never be mapped to edible/safe labels or forage permission.
- `skill-forbidden-edible-as-approval` @ .grok/skills/mycology-safety/SKILL.md: Mycology-safety skill: forbidden 'edible/comestible (as approval)' and 'you can eat this'; required orientation-only and expert validation.
- `skill-never-foraging-recipes` @ .grok/skills/mycology-safety/SKILL.md: Encyclopedia rules: never present foraging recipes or cooking tips; Spain map is educational distribution only, not harvest guides.
- `skill-deadly-recall-100` @ .grok/skills/mycology-safety/SKILL.md: Deadly recall target 100% (R7): prefer false positives over false negatives; deadly/poisonous highest visual severity.
- `skill-lookalikes-always-dangerous` @ .grok/skills/mycology-safety/SKILL.md: Lookalikes: always list dangerous lookalikes when present; multi-view missing_evidence should prefer abstention over guess.
- `product-unlock-false-state` @ ARCHITECTURE.md: Living architecture/metrics state: product_unlock remains false (E20 soft gates PASS · product_unlock false).

## Phase F — Ranked PR plan (DAG)

- **PR1** P0 media bandwidth: encyclopedia thumbs + gallery probe cap — tickets: T1, T2 — dependsOn: —
- **PR2** speciesPhotos SSOT hydrate path — tickets: T4 — dependsOn: —
- **PR3** Games pool readiness after photo hydrate — tickets: T3, T8 — dependsOn: PR2
- **PR4** Media surface policy matrix + content-visibility cleanup — tickets: T6, T10 — dependsOn: PR1
- **PR5** Encyclopedia windowed list scaling — tickets: T5 — dependsOn: PR1
- **PR6** Lookalike multi-view education depth — tickets: T7 — dependsOn: —
- **PR7** Catalog snapshot parity audit (FE/BE) — tickets: T9 — dependsOn: —

### First 5 ready-to-implement

1. **T1** Encyclopedia grid: default thumb quality + tighter media cascade
1. **T2** SpeciesGallery: eliminate blind multi-URL Image probes
1. **T4** Single SSOT load path for speciesPhotos.json
1. **T7** Expand lookalike multi-view diagnostic education beyond classics
1. **T9** Catalog snapshot parity stamp FE ↔ backend (no auto-wire API list)

## Top tickets (with acceptance criteria)

### T1 [P0] — Encyclopedia grid: default thumb quality + tighter media cascade

- **Area:** media
- **Paths:** `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/lib/speciesMediaStack.test.ts`, `frontend/src/data/photoTiers.ts`
- **Depends on:** —
- **Source cites:**
  - frontend/src/components/SpeciesPhotoCard.tsx
  - frontend/src/lib/speciesMediaStack.ts
  - frontend/src/data/photoTiers.ts
  - docs/knowledge/OPEN_MYCOLOGY_SOURCES.md
  - https://commons.wikimedia.org/ (file-level free licenses)
- **Acceptance criteria:**
  - [ ] SpeciesPhotoCard default quality is 'thumb' (≈250px Commons/iNat) unless caller passes quality='display'|'hd'
  - [ ] EncyclopediaPage first-page cards use quality='thumb'; only priority/first-row may upgrade to display
  - [ ] mediaStackWithTerminal for encyclopedia grid uses maxCandidates<=3 and preferLocal documented in a single comment or shared constant
  - [ ] Vitest asserts default quality thumb and stack length cap; no product_unlock or consumption copy introduced
  - [ ] product_unlock remains false; orientation sticky copy unchanged on encyclopedia route

### T2 [P0] — SpeciesGallery: eliminate blind multi-URL Image probes

- **Area:** media
- **Paths:** `frontend/src/components/SpeciesGallery.tsx`, `frontend/src/lib/speciesGalleryExtras.ts`, `frontend/src/lib/speciesGalleryExtras.test.ts`, `backend/app/api/routes_media.py`, `backend/app/services/species_media.py`
- **Depends on:** —
- **Source cites:**
  - frontend/src/components/SpeciesGallery.tsx
  - backend/app/services/species_media.py
  - media/species/
  - docs/MEDIA_SOURCES_AND_PARTNERS.md
  - https://www.inaturalist.org/pages/developers (iNaturalist Open Data terms)
- **Acceptance criteria:**
  - [ ] buildStaticGallery no longer fires Promise.all of new Image() probes for 8 gallery slots on every ficha open when API/manifest returns items
  - [ ] When /api/media/.../gallery or /media/.../gallery returns items, zero client-side probeImage calls for static fallback
  - [ ] When gallery empty, static fallback uses manifest-listed files or max 2 hero candidates (detail then card) without probing gallery_1..8
  - [ ] Unit test covers: API present → no probe storm; API empty → capped fallback; product_unlock=false and attribution still shown for open-license frames
  - [ ] Species detail still never grants forage/consume permission

### T3 [P1] — Games hub awaits speciesPhotos hydrate before verified pool

- **Area:** games
- **Paths:** `frontend/src/pages/GamesHubPage.tsx`, `frontend/src/lib/dailyGames.ts`, `frontend/src/lib/dailyGames.test.ts`, `frontend/src/lib/speciesImageService.ts`, `frontend/src/main-web.tsx`, `frontend/src/main-app.tsx`
- **Depends on:** T4
- **Source cites:**
  - frontend/src/lib/dailyGames.ts
  - frontend/src/lib/speciesImageService.ts
  - frontend/src/pages/GamesHubPage.tsx
  - docs/SETADLE_MEGA_PLAN.md
  - frontend/src/data/speciesPhotos.json
- **Acceptance criteria:**
  - [ ] GamesHubPage does not call buildVerifiedGamesPool until hydrateSpeciesPhotos() resolves OR photos db.version !== 'pending'
  - [ ] buildVerifiedGamesPool with pending db returns empty (documented) OR callers gate on photosReady; after hydrate, pool size is stable on re-render
  - [ ] Vitest covers pending→hydrated transition: pool length increases only after photos load for taxa with plausible URLs
  - [ ] Daily modes remain educational only (food/lookalike quiz use documented foodQuality labels, never edible permission); product_unlock=false
  - [ ] localStorage key visionsetil_daily_games_v1 schema unchanged unless versioned bump with migration note

### T4 [P1] — Single SSOT load path for speciesPhotos.json

- **Area:** media
- **Paths:** `frontend/src/lib/speciesImageService.ts`, `frontend/src/lib/speciesAttribution.ts`, `frontend/src/lib/speciesAttribution.test.ts`, `frontend/src/main-web.tsx`
- **Depends on:** —
- **Source cites:**
  - frontend/src/lib/speciesImageService.ts
  - frontend/src/lib/speciesAttribution.ts
  - frontend/src/data/speciesPhotos.json
  - docs/knowledge/OPEN_MYCOLOGY_SOURCES.md
  - https://www.wikidata.org/ (CC0)
- **Acceptance criteria:**
  - [ ] speciesAttribution no longer static-imports speciesPhotos.json; uses speciesImageService getters after hydrate (or shared async accessor)
  - [ ] Bundle analysis or grep gate: only one import('../data/speciesPhotos.json') / one module owns the JSON
  - [ ] attributionFromCatalog works after hydrate; before hydrate returns null/soft empty without throwing
  - [ ] Vitest speciesAttribution + speciesImageService pass with setupCatalog hydrate pattern
  - [ ] No closed-source scrape; photos remain open-license catalog rows only

### T5 [P1] — Encyclopedia list windowing / virtualized grid

- **Area:** catalog
- **Paths:** `frontend/src/pages/EncyclopediaPage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/data/photoTiers.ts`, `frontend/package.json`
- **Depends on:** T1
- **Source cites:**
  - frontend/src/pages/EncyclopediaPage.tsx
  - frontend/src/data/photoTiers.ts
  - frontend/src/data/speciesCatalog.ts
  - data/species_catalog/species_catalog_v2.json
  - docs/SAFETY_POLICY.md
- **Acceptance criteria:**
  - [ ] Filtered catalog browse does not keep all loaded page cards in DOM simultaneously beyond a fixed window (react-window, react-virtuoso, or equivalent CSS content-window with measured rows)
  - [ ] Scrolling 100+ results keeps mounted card count bounded (assert via data-testid count or unit of window size constant)
  - [ ] IntersectionObserver load-more or equivalent still works with filters (risk/food/family/trait/genus)
  - [ ] Orientation sticky + RiskChip/FoodQualityChip remain orientation-only (no consume language)
  - [ ] Vitest or Playwright smoke: /enciclopedia renders first window and load-more without product_unlock

### T6 [P1] — Documented media prefer matrix (grid vs detail vs games)

- **Area:** media
- **Paths:** `frontend/src/lib/speciesMediaStack.ts`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`, `frontend/src/hooks/useSpeciesImage.ts`, `frontend/src/lib/speciesMediaStack.test.ts`
- **Depends on:** T1
- **Source cites:**
  - frontend/src/lib/speciesMediaStack.ts
  - frontend/src/components/SpeciesImage.tsx
  - frontend/src/hooks/useSpeciesImage.ts
  - backend/app/services/species_media.py
  - docs/PHASE_C_MEDIA_SEASON_BEAUTY.md
- **Acceptance criteria:**
  - [ ] Exported MEDIA_SURFACE_POLICY (or equivalent) defines preferLocal/preferCatalog/quality/maxCandidates for: encyclopedia_grid, species_detail, games_hub, lookalike_compare
  - [ ] SpeciesPhotoCard, SpeciesImage defaults, and GamesHub SpeciesImage calls consume the policy object (no ad-hoc preferLocal:false without shared constant)
  - [ ] Unit tests lock policy matrix values and assert product_unlock not present in media module exports
  - [ ] Missing local webp still cascades but maxCandidates per surface is enforced
  - [ ] No scraping of paywalled media sources

### T7 [P1] — Expand lookalike multi-view diagnostic education beyond classics

- **Area:** lookalikes
- **Paths:** `frontend/src/lib/diagnosticViews.ts`, `frontend/src/lib/lookalikeRisk.ts`, `frontend/src/lib/lookalikeStudio.ts`, `frontend/src/pages/SpeciesDetailPage.tsx`, `frontend/src/pages/LookalikeStudioPage.tsx`, `frontend/src/data/multiview_diagnostic_map.json`, `data/species_catalog/classic_lookalike_pairs.json`, `frontend/src/lib/diagnosticViews.test.ts`
- **Depends on:** —
- **Source cites:**
  - frontend/src/lib/lookalikeStudio.ts
  - frontend/src/lib/diagnosticViews.ts
  - data/species_catalog/classic_lookalike_pairs.json
  - data/species_catalog/multiview_diagnostic_map.json
  - http://www.indexfungorum.org/ (public taxonomic names)
  - docs/SAFETY_POLICY.md
- **Acceptance criteria:**
  - [ ] Every CLASSIC_LOOKALIKE_PAIRS id resolves a LookalikePairDiagnostic with critical_views non-empty via diagnosticForLookalikeMate
  - [ ] Species Detail lookalikes tab shows multi-view coach (critical views + why) for ranked mates when map has pair; otherwise explicit educational fallback (study tips, never consume)
  - [ ] Lookalike Studio study badge path never mentions edible permission; deadly pairs use highest severity copy
  - [ ] Vitest: classic pairs coverage; policy string matches orientation_only; product_unlock=false
  - [ ] Open knowledge only: pairs/map from repo JSON + Index Fungorum names for display, not closed field guides

### T8 [P1] — Widen verified games pool from open photo coverage

- **Area:** games
- **Paths:** `frontend/src/lib/dailyGames.ts`, `frontend/src/lib/dailyGames.test.ts`, `frontend/src/lib/speciesMediaVerify.ts`, `frontend/src/data/speciesPhotos.json`, `frontend/src/lib/mushroomQuiz.ts`
- **Depends on:** T3
- **Source cites:**
  - frontend/src/lib/dailyGames.ts
  - frontend/src/data/speciesPhotos.json
  - frontend/src/lib/speciesMediaVerify.ts
  - https://github.com/luomus/species-challenge (MIT)
  - docs/knowledge/OPEN_MYCOLOGY_SOURCES.md
- **Acceptance criteria:**
  - [ ] buildVerifiedGamesPool after hydrate includes all CURATED_GAMES_TAXA that have catalog row + common + family + plausible open photo URL; report/test asserts min pool size >= baseline documented in test (e.g. >=40)
  - [ ] Taxa excluded solely because photos were pending no longer fail after T3/T4 fix
  - [ ] Quiz food/lookalike modes continue to use documented foodQuality only; deadly taxa never get culinary-positive framing
  - [ ] speciesMediaVerify or dailyGames test fails if product_unlock true or consume-permission strings appear in daily game UI libs
  - [ ] No pirate PDFs; photo URLs remain Wiki/iNat/open catalog entries

### T9 [P1] — Catalog snapshot parity stamp FE ↔ backend (no auto-wire API list)

- **Area:** catalog
- **Paths:** `frontend/src/data/speciesCatalog.ts`, `frontend/src/data/generated/species_catalog_snapshot.json`, `frontend/src/hooks/useSpeciesCatalog.ts`, `backend/app/services/unified_catalog.py`, `backend/app/api/routes_species.py`, `data/species_catalog/`
- **Depends on:** —
- **Source cites:**
  - frontend/src/data/speciesCatalog.ts
  - frontend/src/data/generated/species_catalog_snapshot.json
  - data/species_catalog/species_catalog_v2.json
  - backend/app/api/routes_species.py
  - https://www.gbif.org/ (open occurrence datasets, filter by license)
  - docs/INDEX_FUNGORUM.md
- **Acceptance criteria:**
  - [ ] Client snapshot exposes version/hash/count fields; unit test asserts loadSpeciesCatalog count matches snapshot metadata
  - [ ] Script or test compares FE snapshot taxon count/hash to data/species_catalog SSOT (or backend unified_catalog export) and fails on drift beyond allowed delta
  - [ ] FE encyclopedia remains on embedded snapshot (no forced GET /species list rewrite in this ticket); parity is verifiable not auto-deploy
  - [ ] Edibility/risk fields on FE remain risk/education labels only; never culinary unlock; product_unlock=false
  - [ ] Open sources only for any enrichment references (GBIF/IF/Wikidata paths documented)

### T10 [P2] — content-visibility residual cleanup vs media opacity fades

- **Area:** media
- **Paths:** `frontend/src/styles/campo-nocturno.css`, `frontend/src/styles/marketing.css`, `frontend/src/styles/global.css`, `frontend/src/styles/tokens.css`, `frontend/src/components/SpeciesImage.tsx`, `frontend/src/components/SpeciesPhotoCard.tsx`
- **Depends on:** T1
- **Source cites:**
  - frontend/src/styles/campo-nocturno.css
  - frontend/src/styles/marketing.css
  - frontend/src/components/SpeciesImage.tsx
  - frontend/src/components/SpeciesPhotoCard.tsx
  - docs/PHASE_C_MEDIA_SEASON_BEAUTY.md
- **Acceptance criteria:**
  - [ ] content-visibility:auto is not applied on elements that start at opacity < 1 for media images (species-photo-card__img, species-image__img--loading)
  - [ ] Family sections may keep content-visibility only if child images are not opacity-hidden before load OR opacity fade is removed for those surfaces
  - [ ] Manual/Playwright screenshot or CSS unit grep test: no black empty card frames regression comment residual without paired rule
  - [ ] Encyclopedia + marketing grids first paint shows placeholder or progressive opacity without stuck black frame
  - [ ] Orientation-only; no product_unlock change

## Verification commands (local only)

- `cd frontend && npm test -- --run src/lib/speciesMediaStack.test.ts src/data/photoTiers.test.ts src/lib/speciesImageUrl.test.ts`
- `cd frontend && npm test -- --run src/lib/speciesGalleryExtras.test.ts src/lib/speciesAttribution.test.ts src/lib/speciesMediaVerify.test.ts`
- `cd frontend && npm test -- --run src/lib/dailyGames.test.ts src/lib/mushroomQuiz.test.ts src/lib/setadle.test.ts src/lib/mushroomWordle.test.ts`
- `cd frontend && npm test -- --run src/lib/diagnosticViews.test.ts src/lib/lookalikeStudio.test.ts src/lib/lookalikeRisk.test.ts src/lib/speciesRecipes.test.ts`
- `cd frontend && npm test -- --run src/lib/competitiveFeatures.test.ts src/lib/safetyCopy.test.ts src/lib/educationCopy.test.ts`
- `cd frontend && npm test`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run test:e2e -- --grep "encicl|lookalike|games|gallery|species"`
- `curl -sS http://127.0.0.1:8000/health`
- `curl -sS "http://127.0.0.1:8000/api/species?limit=5"`
- `curl -sS "http://127.0.0.1:8000/api/media/species/amanita-phalloides/gallery" || curl -sS "http://127.0.0.1:8000/media/species/amanita-phalloides/gallery"`
- `cd backend && python -m pytest app/tests -q -k "species or media or nomenclature" --tb=line`

## Self-check vs hard constraints

| Check | Result | Detail |
|---|---|---|
| product_unlock=false preserved in report | **PASS** | found product_unlock false |
| No edible-as-permission endorsement language | **FAIL** | flagged endorsement phrases |
| All accepted sources have open license + URL | **PASS** | 33 accepted |
| Tickets do not cite license-rejected URLs | **PASS** | clean |
| Safety checklist present | **PASS** | 8 items |
| Top tickets include acceptance criteria | **PASS** | 10/10 with acceptance |
| No auto-deploy actions | **FAIL** | deploy-like command found |
| Report cites repo paths and/or open URLs | **PASS** | citations present |

---

_End of report. No deploy performed. product_unlock=false. Open knowledge only._
