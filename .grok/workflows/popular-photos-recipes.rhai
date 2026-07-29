let meta = #{
    name: "popular-photos-recipes",
    description: "Improve multi-angle photos for popular culinary taxa + educational recipe links (never forage permission)",
    when_to_use: "When encyclopedia heroes need more photos or culinary taxa need cultural recipe links with safety disclaimers",
    phases: [
        #{ title: "Select popular taxa", detail: "documented culinary + most searched T0/T1" },
        #{ title: "Research media + recipes", detail: "open-license photos multi-angle + external recipe URLs" },
        #{ title: "Implement", detail: "photos SSOT multi-gallery + recipes block on detail" },
        #{ title: "Verify", detail: "foodQuality safety + photo tests + no edible permission chrome" },
    ],
};

let select_schema = #{
    "type": "object",
    "required": ["taxa", "summary"],
    "properties": #{
        "taxa": #{
            "type": "array",
            "maxItems": 24,
            "items": #{
                "type": "object",
                "required": ["taxon", "slug", "food_class", "reason"],
                "properties": #{
                    "taxon": #{ "type": "string" },
                    "slug": #{ "type": "string" },
                    "food_class": #{ "type": "string" },
                    "reason": #{ "type": "string" },
                    "photo_gaps": #{ "type": "string" },
                },
            },
        },
        "summary": #{ "type": "string" },
        "excluded_deadly": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let research_schema = #{
    "type": "object",
    "required": ["taxon", "photos", "recipes", "notes"],
    "properties": #{
        "taxon": #{ "type": "string" },
        "photos": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["url", "license", "role", "source"],
                "properties": #{
                    "url": #{ "type": "string" },
                    "license": #{ "type": "string" },
                    "role": #{ "type": "string" },
                    "source": #{ "type": "string" },
                    "attribution": #{ "type": "string" },
                    "creator": #{ "type": "string" },
                },
            },
        },
        "recipes": #{
            "type": "array",
            "maxItems": 5,
            "items": #{
                "type": "object",
                "required": ["title", "url", "lang"],
                "properties": #{
                    "title": #{ "type": "string" },
                    "url": #{ "type": "string" },
                    "lang": #{ "type": "string" },
                    "disclaimer": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["status", "changed_files", "taxa_updated", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "changed_files": #{ "type": "array", "items": #{ "type": "string" } },
        "taxa_updated": #{ "type": "integer" },
        "photos_added": #{ "type": "integer" },
        "recipes_linked": #{ "type": "integer" },
        "summary": #{ "type": "string" },
    },
};

let verify_schema = #{
    "type": "object",
    "required": ["status", "report"],
    "properties": #{
        "status": #{ "type": "string" },
        "report": #{ "type": "string" },
        "tests_passed": #{ "type": "boolean" },
        "safety_ok": #{ "type": "boolean" },
    },
};

// args.limit: max taxa to research (default 12). args.mode: "core" | "full"
let mode = if args == () { "core" } else if args.mode == () { "core" } else { args.mode };
let limit = if args == () { 12 } else if args.limit == () { 12 } else { args.limit };
if limit < 4 { limit = 4; }
if limit > 20 { limit = 20; }

phase("Select popular taxa");
let sel_prompt = "Select the most popular / most-searched culinary mushrooms for VisionSetil photo+recipe work. ";
sel_prompt += "Use read_file/grep only. Read: frontend/src/data/photoTiers.ts (T0/T1), ";
sel_prompt += "frontend/src/lib/foodQuality.ts + foodQualityStats usage, mushroomDatabase.ts, ";
sel_prompt += "speciesPhotos.json structure, SpeciesGallery.tsx, SpeciesDetailPage.tsx. ";
sel_prompt += "ONLY include taxa with documented food_class comestible / excellent culinary notes in curated registry. ";
sel_prompt += "EXCLUDE deadly/toxic as recipe targets (they may keep education photos but NO recipes). ";
sel_prompt += "Prefer Iberian classics: Boletus edulis, Cantharellus cibarius, Lactarius deliciosus, ";
sel_prompt += "Amanita caesarea, Macrolepiota procera, Pleurotus ostreatus, Agaricus campestris, ";
sel_prompt += "Morchella esculenta, Craterellus cornucopioides, Hydnum repandum, Coprinus comatus, etc. ";
sel_prompt += "Cap list to about " + limit.to_string() + " taxa (mode=" + mode + "). ";
sel_prompt += "For each: taxon, slug, food_class, reason, photo_gaps. excluded_deadly list. ";
sel_prompt += "Policy: orientation only — culinary documentation is NOT permission to forage or eat wild finds.";
let select = agent(
    sel_prompt,
    #{ label: "select-popular-taxa", capability_mode: "read-only", output_schema: select_schema }
);
if select == () || !select.success {
    complete(#{ status: "failed", phase: "select" });
}

let taxa = select.output.taxa;
if taxa == () || taxa.len() == 0 {
    complete(#{ status: "failed", phase: "select", reason: "empty taxa list" });
}

// Cap fan-out
let max_n = limit;
if taxa.len() < max_n { max_n = taxa.len(); }

phase("Research media + recipes");
let jobs = [];
let ti = 0;
while ti < max_n {
    let t = taxa[ti];
    let rp = "Research open-license photos and educational recipe links for mushroom taxon: ";
    rp += t.taxon + " (slug " + t.slug + ", food_class " + t.food_class + "). ";
    rp += "Use web_search and web_fetch. ";
    rp += "PHOTOS: find 4-8 DIFFERENT open-license images (Wikimedia Commons / iNaturalist open data preferred). ";
    rp += "Prefer multi-angle: cap top, underside/gills-or-pores, profile/stem, habitat if available. ";
    rp += "Each photo: url (https direct image or commons file page), license (CC-BY etc), role ";
    rp += "(hero|gills|front|habitat|detail|gallery), source, attribution/creator. ";
    rp += "RECIPES: only if food_class indicates documented culinary interest — up to 5 EXTERNAL recipe links ";
    rp += "(reputable culinary sites ES/EN). Each recipe needs title, url, lang, disclaimer string that says ";
    rp += "use only correctly identified mushrooms from trusted sources; wild ID by app alone is never enough. ";
    rp += "NEVER invent recipes for deadly/toxic taxa — return recipes=[] if toxic. ";
    rp += "NEVER claim the app authorizes consumption. notes: coverage limits.";
    jobs.push(#{
        prompt: rp,
        label: "research:" + t.slug,
        capability_mode: "read-only",
        output_schema: research_schema,
    });
    ti += 1;
}
let research_results = parallel(jobs);

let research_ok = [];
let ri = 0;
for r in research_results {
    if r != () && r.success && r.output != () {
        research_ok.push(r.output);
    }
    ri += 1;
}
log("research ok " + research_ok.len().to_string() + "/" + max_n.to_string());
if research_ok.len() == 0 {
    complete(#{
        status: "failed",
        phase: "research",
        select: select.output,
    });
}

let research_json = json_encode(research_ok);
let select_json = json_encode(select.output);

phase("Implement");
let impl = "";
impl += "Implement multi-photo upgrades + educational recipe links for popular culinary mushrooms. ";
impl += "Selected taxa: " + select_json + " ";
impl += "Research bundle: " + research_json + " ";
impl += "HARD SAFETY RULES: ";
impl += "(1) Recipes ONLY for documented culinary taxa — never deadly/toxic. ";
impl += "(2) Every recipe block must show permanent disclaimer: orientation/cultural only; ";
impl += "never eat wild mushrooms identified only by app; expert verification required. ";
impl += "(3) No green safe-to-eat chrome on Identify results. ";
impl += "(4) FoodQualityChip remains educational; recipes must not appear on Identify ResultCard. ";
impl += "IMPLEMENT: ";
impl += "A) Create frontend/src/data/speciesRecipes.json (or .ts) mapping slug/taxon -> {recipes[], disclaimer}. ";
impl += "B) Enrich multi-photo data: prefer updating speciesPhotos.json multi urls OR new ";
impl += "frontend/src/data/speciesGalleryExtras.json with role-tagged open-license URLs + attribution. ";
impl += "C) Wire SpeciesGallery / species media path to show MANY different photos (not single hero). ";
impl += "D) SpeciesDetailPage: section 'Recetas (enlaces externos)' only when recipes exist + disclaimer banner. ";
impl += "E) i18n es/en keys for recipes section. ";
impl += "F) Tests: foodQuality still bans invented comestible; new recipes test asserts no deadly taxa; ";
impl += "identify chrome has no recipe CTA; photo extras parse. ";
impl += "Return status pass|partial, changed_files, taxa_updated, photos_added, recipes_linked, summary.";
let implement = agent(
    impl,
    #{ label: "implement-photos-recipes", capability_mode: "all", output_schema: implement_schema }
);
if implement == () || !implement.success {
    log("implement failed — run verify on tree");
}

phase("Verify");
let verify = agent(
    "Verify popular photos+recipes work safely. From VisionSetil repo: "
        + "cd frontend; npm.cmd run test -- --run src/lib/foodQuality.test.ts "
        + "src/lib/safetyCopy.test.ts src/lib/identifyChromeSafety.test.ts "
        + "src/data/photoTiers.test.ts ; "
        + "Also run any new recipes/gallery tests if present. "
        + "Grep that recipe UI is NOT on IdentifyPage/ResultCard. "
        + "Grep speciesRecipes excludes deadly taxa (phalloides, virosa, galerina, etc). "
        + "status pass if tests pass and safety_ok true. report markdown. "
        + "Never product_unlock. Never consumption permission.",
    #{ label: "verify-photos-recipes", capability_mode: "all", output_schema: verify_schema }
);

let status = "partial";
if verify != () && verify.success && verify.output.status == "pass"
    && verify.output.safety_ok == true {
    status = "pass";
}
if implement != () && implement.success && implement.output.status == "pass"
    && verify != () && verify.success && verify.output.tests_passed == true
    && verify.output.safety_ok == true {
    status = "pass";
}

let report = "# Popular mushrooms — photos + recipes\n\n";
report += "## Select\n" + select.output.summary + "\n\n";
report += "Taxa researched: " + research_ok.len().to_string() + "\n\n";
report += "## Implement\n";
if implement != () && implement.success {
    report += implement.output.summary + "\n";
    report += "taxa_updated: " + implement.output.taxa_updated.to_string() + "\n";
} else {
    report += "implement failed\n";
}
report += "\n## Verify\n";
if verify != () && verify.success {
    report += verify.output.report + "\n";
} else {
    report += "verify failed\n";
}
report += "\n**Safety:** recipes are external cultural links only; never forage/consume permission from VisionSetil.\n";

let path = write_scratch_file("popular-photos-recipes-report.md", report);
complete(#{
    status: status,
    mode: mode,
    limit: limit,
    select: select.output,
    research_count: research_ok.len(),
    implement: if implement != () && implement.success { implement.output } else { () },
    verify: if verify != () && verify.success { verify.output } else { () },
    report_path: path,
});
