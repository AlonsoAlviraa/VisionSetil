let meta = #{
    name: "culinary-hero-photos",
    description: "Upgrade field-realistic multi-angle photos for top culinary / Google-searched mushrooms (Boletus etc.)",
    when_to_use: "When hero/gallery photos look wrong, washed-out, or unrepresentative (e.g. Boletus not looking like real porcini)",
    phases: [
        #{ title: "Pick priority taxa", detail: "culinary + high-search Iberian icons" },
        #{ title: "Curate field photos", detail: "open-license multi-angle realistic stills" },
        #{ title: "Implement media", detail: "speciesPhotos heroes + gallery extras + gallery wiring" },
        #{ title: "Verify", detail: "gallery extras tests + no consumption chrome" },
    ],
};

let pick_schema = #{
    "type": "object",
    "required": ["taxa", "summary"],
    "properties": #{
        "taxa": #{
            "type": "array",
            "maxItems": 16,
            "items": #{
                "type": "object",
                "required": ["taxon", "slug", "why", "photo_problems"],
                "properties": #{
                    "taxon": #{ "type": "string" },
                    "slug": #{ "type": "string" },
                    "why": #{ "type": "string" },
                    "photo_problems": #{ "type": "string" },
                    "priority": #{ "type": "integer" },
                },
            },
        },
        "summary": #{ "type": "string" },
    },
};

let curate_schema = #{
    "type": "object",
    "required": ["taxon", "slug", "hero", "photos", "quality_notes"],
    "properties": #{
        "taxon": #{ "type": "string" },
        "slug": #{ "type": "string" },
        "hero": #{
            "type": "object",
            "required": ["url", "license", "source"],
            "properties": #{
                "url": #{ "type": "string" },
                "license": #{ "type": "string" },
                "source": #{ "type": "string" },
                "creator": #{ "type": "string" },
                "source_url": #{ "type": "string" },
                "attribution_text": #{ "type": "string" },
            },
        },
        "photos": #{
            "type": "array",
            "maxItems": 10,
            "items": #{
                "type": "object",
                "required": ["url", "license", "role", "source"],
                "properties": #{
                    "url": #{ "type": "string" },
                    "license": #{ "type": "string" },
                    "role": #{ "type": "string" },
                    "source": #{ "type": "string" },
                    "creator": #{ "type": "string" },
                    "source_url": #{ "type": "string" },
                    "attribution_text": #{ "type": "string" },
                    "why_realistic": #{ "type": "string" },
                },
            },
        },
        "quality_notes": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["status", "changed_files", "taxa_updated", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "changed_files": #{ "type": "array", "items": #{ "type": "string" } },
        "taxa_updated": #{ "type": "integer" },
        "heroes_replaced": #{ "type": "integer" },
        "gallery_photos": #{ "type": "integer" },
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
        "boletus_hero_ok": #{ "type": "boolean" },
    },
};

let mode = if args == () { "core" } else if args.mode == () { "core" } else { args.mode };
let limit = if args == () { 10 } else if args.limit == () { 10 } else { args.limit };
if limit < 4 { limit = 4; }
if limit > 14 { limit = 14; }

phase("Pick priority taxa");
let pick_p = "Select priority mushrooms for FIELD-REALISTIC photo upgrade in VisionSetil. ";
pick_p += "User complaint: Boletus etc. photos do not look like real mushrooms people search on Google. ";
pick_p += "Use read_file/grep. Read: frontend/src/data/photoTiers.ts, foodQuality.ts, ";
pick_p += "speciesPhotos.json (hero URLs), speciesGalleryExtras.json, speciesGalleryExtras.ts, SpeciesGallery.tsx. ";
pick_p += "Prioritize: (1) documented culinary/popular Iberian taxa T0/T1, ";
pick_p += "(2) high Google-search classics: Boletus edulis, Boletus aereus, Cantharellus cibarius, ";
pick_p += "Lactarius deliciosus, Amanita caesarea, Macrolepiota procera, Pleurotus ostreatus, ";
pick_p += "Agaricus campestris, Morchella esculenta, Craterellus cornucopioides, Hydnum repandum, ";
pick_p += "Imleria badia, Leccinum scabrum, Suillus luteus. ";
pick_p += "For each: taxon, slug, why (culinary/search demand), photo_problems (washed out, wrong angle, ";
pick_p += "not field-typical, missing pores/reticulum for boletes, etc.), priority 1-10. ";
pick_p += "Cap to " + limit.to_string() + " (mode=" + mode + "). ";
pick_p += "Policy: orientation only — never consumption permission; better photos educate, not authorize eating.";
let pick = agent(
    pick_p,
    #{ label: "pick-culinary-photos", capability_mode: "read-only", output_schema: pick_schema }
);
if pick == () || !pick.success {
    complete(#{ status: "failed", phase: "pick" });
}
let taxa = pick.output.taxa;
if taxa == () || taxa.len() == 0 {
    complete(#{ status: "failed", phase: "pick", reason: "empty taxa" });
}

let max_n = limit;
if taxa.len() < max_n { max_n = taxa.len(); }

phase("Curate field photos");
let jobs = [];
let i = 0;
while i < max_n {
    let t = taxa[i];
    let cp = "Curate FIELD-REALISTIC open-license photos for: " + t.taxon + " (slug " + t.slug + "). ";
    cp += "Problems to fix: " + t.photo_problems + ". ";
    cp += "Use web_search and web_fetch. Prefer Wikimedia Commons File: pages and iNaturalist open data. ";
    cp += "QUALITY BAR (strict): ";
    cp += "(1) Looks like a REAL field mushroom people would recognize from Google (sharp, natural color, typical morph). ";
    cp += "(2) For Boletus/boletes: show PORES (not gills), preferably reticulate stem, brown/white/cream typical palette — reject weird green/overprocessed shots. ";
    cp += "(3) Multi-angle pack: hero (iconic whole fruitbody), pores/underside role=gills or pores, front/profile with stem, habitat in situ, detail (stem net / cut flesh if licensed). ";
    cp += "(4) Prefer well-lit outdoor photos; avoid pure white studio if field available. ";
    cp += "(5) URLs must be stable HTTPS: prefer commons Special:FilePath/Name.jpg or upload.wikimedia.org full path. ";
    cp += "(6) Always license + creator + source_url for attribution. ";
    cp += "Return hero (best single recognition shot for speciesPhotos.json) + photos[] up to 10 with role and why_realistic. ";
    cp += "quality_notes: what was wrong with old media and why these fix it. ";
    cp += "NEVER claim edible safety. Orientation only.";
    jobs.push(#{
        prompt: cp,
        label: "curate:" + t.slug,
        capability_mode: "read-only",
        output_schema: curate_schema,
    });
    i += 1;
}
let curated = parallel(jobs);
let packs = [];
let ci = 0;
for r in curated {
    if r != () && r.success && r.output != () {
        packs.push(r.output);
    }
    ci += 1;
}
log("curated packs " + packs.len().to_string() + "/" + max_n.to_string());
if packs.len() == 0 {
    complete(#{ status: "failed", phase: "curate", pick: pick.output });
}

let packs_json = json_encode(packs);
let pick_json = json_encode(pick.output);

phase("Implement media");
let impl_p = "Implement field-realistic photo upgrades for popular culinary/search mushrooms. ";
impl_p += "Priority list: " + pick_json + " ";
impl_p += "Curated packs: " + packs_json + " ";
impl_p += "TASKS: ";
impl_p += "(1) Update frontend/src/data/speciesPhotos.json hero url for each taxon (provider/license/slug keep schema). ";
impl_p += "Prefer high-quality commons/iNat open license URLs that look like real field boletes/chanterelles/etc. ";
impl_p += "(2) Merge/replace frontend/src/data/speciesGalleryExtras.json photos for each slug — multi-role pack ";
impl_p += "(hero, gills/pores, front, habitat, detail, gallery). Keep policy attribution fields. ";
impl_p += "(3) Ensure speciesGalleryExtras.ts + SpeciesGallery merge extras so encyclopedia detail shows many photos. ";
impl_p += "(4) For Boletus edulis / aereus specifically: hero MUST show classic porcini look (cap, pores, stocky stem). ";
impl_p += "(5) Optionally bump photoTiers if a taxon is T2 but highly searched. ";
impl_p += "(6) Tests: speciesGalleryExtras parse; foodQuality unchanged; no recipe/edible chrome on Identify. ";
impl_p += "Policy: orientation only — never consumption permission. ";
impl_p += "Return status pass|partial, changed_files, taxa_updated, heroes_replaced, gallery_photos, summary.";
let implement = agent(
    impl_p,
    #{ label: "implement-hero-photos", capability_mode: "all", output_schema: implement_schema }
);
if implement == () || !implement.success {
    log("implement failed");
}

phase("Verify");
let verify = agent(
    "Verify culinary hero photo upgrades. From VisionSetil repo: "
        + "cd frontend; npm.cmd run test -- --run src/lib/speciesGalleryExtras.test.ts "
        + "src/lib/speciesImageUrl.test.ts src/data/photoTiers.test.ts src/lib/foodQuality.test.ts ; "
        + "Read speciesPhotos.json entry for boletus edulis — confirm URL is https and not empty. "
        + "Read speciesGalleryExtras boletus-edulis photos length >= 4. "
        + "boletus_hero_ok true if hero looks upgraded (commons/iNat, not broken). "
        + "status pass if tests pass and boletus_hero_ok. report markdown. "
        + "Never product_unlock. Never consumption permission.",
    #{ label: "verify-hero-photos", capability_mode: "all", output_schema: verify_schema }
);

let status = "partial";
if verify != () && verify.success && verify.output.status == "pass"
    && verify.output.boletus_hero_ok == true {
    status = "pass";
}
if implement != () && implement.success && implement.output.status == "pass"
    && verify != () && verify.success && verify.output.tests_passed == true {
    status = "pass";
}

let report = "# Culinary / high-search hero photos\n\n";
report += "## Pick\n" + pick.output.summary + "\n\n";
report += "Packs curated: " + packs.len().to_string() + "\n\n";
report += "## Implement\n";
if implement != () && implement.success {
    report += implement.output.summary + "\n";
} else {
    report += "implement failed\n";
}
report += "\n## Verify\n";
if verify != () && verify.success {
    report += verify.output.report + "\n";
} else {
    report += "verify failed\n";
}
report += "\n**Policy:** better field photos for recognition education only — never forage/consume permission.\n";

let path = write_scratch_file("culinary-hero-photos-report.md", report);
complete(#{
    status: status,
    mode: mode,
    limit: limit,
    pick: pick.output,
    packs_count: packs.len(),
    implement: if implement != () && implement.success { implement.output } else { () },
    verify: if verify != () && verify.success { verify.output } else { () },
    report_path: path,
});
