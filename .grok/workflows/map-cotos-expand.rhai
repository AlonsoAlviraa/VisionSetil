let meta = #{
    name: "map-cotos-expand",
    description: "Expand Spain mycological map: scrape more official cotos/ayuntamientos + improve map UX",
    when_to_use: "When cotos coverage is thin, permit links stale, or SpainMapPage needs UX polish",
    phases: [
        #{ title: "Audit map", detail: "inventory zones, permits, SpainMapPage gaps" },
        #{ title: "Scrape sources", detail: "official CyL, Aragón, ayuntamientos, parques" },
        #{ title: "Implement", detail: "new cotos data + map UX + permit links" },
        #{ title: "Verify", detail: "regulatedZones + mapInteraction + zoneAlerts tests" },
    ],
};

let audit_schema = #{
    "type": "object",
    "required": ["zone_count", "gaps", "files", "summary"],
    "properties": #{
        "zone_count": #{ "type": "integer" },
        "regulated_count": #{ "type": "integer" },
        "with_permit_links": #{ "type": "integer" },
        "gaps": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "files": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 20 },
        "summary": #{ "type": "string" },
    },
};

let scrape_item_schema = #{
    "type": "object",
    "required": ["region", "sources", "candidates", "notes"],
    "properties": #{
        "region": #{ "type": "string" },
        "sources": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "candidates": #{
            "type": "array",
            "maxItems": 25,
            "items": #{
                "type": "object",
                "required": ["name", "region", "permit_url", "lat", "lng", "source"],
                "properties": #{
                    "name": #{ "type": "string" },
                    "region": #{ "type": "string" },
                    "permit_url": #{ "type": "string" },
                    "lat": #{ "type": "number" },
                    "lng": #{ "type": "number" },
                    "source": #{ "type": "string" },
                    "code": #{ "type": "string" },
                    "notes": #{ "type": "string" },
                },
            },
        },
        "notes": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["status", "changed_files", "zones_added", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "changed_files": #{ "type": "array", "items": #{ "type": "string" } },
        "zones_added": #{ "type": "integer" },
        "map_ux_changes": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let verify_schema = #{
    "type": "object",
    "required": ["status", "report"],
    "properties": #{
        "status": #{ "type": "string" },
        "report": #{ "type": "string" },
        "zone_count_after": #{ "type": "integer" },
        "tests_passed": #{ "type": "boolean" },
    },
};

// args.mode: "full" (default, 8 CCAA scrape slots) | "core" (3 slots: cyl, aragon, galicia)
let mode = if args == () { "full" } else if args.mode == () { "full" } else { args.mode };
let region_list = if mode == "core" {
    ["cyl", "aragon", "galicia"]
} else {
    ["cyl", "aragon", "catalunya", "galicia", "navarra", "euskadi", "madrid", "andalucia"]
};

phase("Audit map");
let audit = agent(
    "Audit VisionSetil Spain mycological MAP and cotos inventory. Use read_file/grep/list_dir only. "
        + "Read: frontend/src/pages/SpainMapPage.tsx, frontend/src/lib/regulatedZones.ts, "
        + "frontend/src/lib/mapInteraction.ts, frontend/src/lib/zoneAlerts.ts, "
        + "frontend/src/data/mushroomZones.ts, cylCotosZones.ts, mycologicalParksZones.ts, "
        + "additionalZones.ts, moreZones.ts, zonePermitLinks.ts. "
        + "Count total mushroom zones and regulated cotos/parks. Count how many have permit links. "
        + "List gaps: missing CCAA, missing ayuntamiento cotos, stale permit URLs, map UX issues "
        + "(search, region filter, clustering, deep links, a11y, mobile, empty states). "
        + "Policy: educational/orientation only — never forage permission or consumption. "
        + "Return zone_count, regulated_count, with_permit_links, gaps, files, summary.",
    #{ label: "audit-map", capability_mode: "read-only", output_schema: audit_schema }
);
if audit == () || !audit.success {
    complete(#{ status: "failed", phase: "audit" });
}

phase("Scrape sources");
let scrape_jobs = [];
for reg in region_list {
    let p = "Research official mycological cotos / acotados / parques for Spain region key: " + reg + ". ";
    p += "Use web_search and web_fetch/open_page. Prefer official sources only: ";
    p += "MicologíaCyL (permisos.micologiacyl.es, micocyl.es), MicoAragón, Juntas/Diputaciones, ";
    p += "ayuntamientos with published mushroom permits, parc natural boards. ";
    p += "For each candidate return name, region (CCAA/provincia human readable), permit_url (official HTTPS), ";
    p += "approx lat/lng (municipality center if needed), source URL, optional code, notes. ";
    p += "Do NOT invent coords outside Spain. Do NOT claim free forage rights. Max 25 candidates. ";
    p += "Set region field on the output object to the region key or human name.";
    scrape_jobs.push(#{
        prompt: p,
        label: "scrape:" + reg,
        capability_mode: "read-only",
        output_schema: scrape_item_schema,
    });
}
let scrape_results = parallel(scrape_jobs);

let all_candidates = [];
let scrape_summaries = [];
let si = 0;
for r in scrape_results {
    if r != () && r.success && r.output != () {
        let n = 0;
        if r.output.candidates != () {
            n = r.output.candidates.len();
            for c in r.output.candidates {
                all_candidates.push(c);
            }
        }
        scrape_summaries.push(r.output.region + ": " + n.to_string() + " candidates");
    } else {
        scrape_summaries.push("slot " + si.to_string() + " failed");
    }
    si += 1;
}
log("scrape candidates total " + all_candidates.len().to_string());
let cand_json = json_encode(all_candidates);
let audit_json = json_encode(audit.output);

phase("Implement");
let impl_prompt = "Implement map + cotos expansion for VisionSetil. ";
impl_prompt += "Audit JSON: " + audit_json + " ";
impl_prompt += "New coto candidates JSON (dedupe by name/region; validate Spain bbox lat 36-44 lng -10-5): ";
impl_prompt += cand_json + " ";
impl_prompt += "Tasks: (1) Add high-quality new zones into frontend data — prefer new file "
    + "frontend/src/data/scrapedCotosZones.ts OR extend additionalZones.ts / cylCotosZones.ts / "
    + "mycologicalParksZones.ts matching MushroomZone type from mushroomZones.ts. ";
impl_prompt += "Each zone: id stable slug, name, region, lat, lng, description educational, "
    + "optional radiusKm — never permiso de consumo. ";
impl_prompt += "(2) Wire arrays into mushroomZones aggregation and regulatedZones if applicable. ";
impl_prompt += "(3) Extend zonePermitLinks.ts with official permit/info URLs. ";
impl_prompt += "(4) Improve SpainMapPage UX: region filter chips, clearer regulated labels, "
    + "permit CTA, better empty/search states, a11y for markers if missing. ";
impl_prompt += "(5) Update tests regulatedZones.test.ts mapInteraction.test.ts zoneAlerts.test.ts. ";
impl_prompt += "Policy: orientation only; link official managers; do NOT sell permits. ";
impl_prompt += "Return status pass|partial, changed_files, zones_added, map_ux_changes, summary.";
let implement = agent(
    impl_prompt,
    #{ label: "implement-map-cotos", capability_mode: "all", output_schema: implement_schema }
);
if implement == () || !implement.success {
    log("implement failed — verify current tree");
}

phase("Verify");
let verify = agent(
    "Verify map/cotos after expansion. From VisionSetil repo root: "
        + "cd frontend; npm.cmd run test -- --run src/lib/regulatedZones.test.ts "
        + "src/lib/mapInteraction.test.ts src/lib/zoneAlerts.test.ts ; "
        + "fix trivial failures you introduced. Count zones after. "
        + "status pass if those tests pass; tests_passed boolean; zone_count_after; report markdown. "
        + "Never product_unlock. Orientation only.",
    #{ label: "verify-map", capability_mode: "all", output_schema: verify_schema }
);

let status = "partial";
if verify != () && verify.success && verify.output.status == "pass" {
    status = "pass";
}
if implement != () && implement.success && implement.output.status == "pass"
    && verify != () && verify.success && verify.output.tests_passed == true {
    status = "pass";
}

let report = "# Map + cotos expand\n\n";
report += "## Audit\n" + audit.output.summary + "\n\n";
report += "## Scrape\n";
for line in scrape_summaries {
    report += "- " + line + "\n";
}
report += "\nCandidates: " + all_candidates.len().to_string() + "\n\n";
report += "## Implement\n";
if implement != () && implement.success {
    report += implement.output.summary + "\n";
    report += "zones_added: " + implement.output.zones_added.to_string() + "\n";
} else {
    report += "implement failed\n";
}
report += "\n## Verify\n";
if verify != () && verify.success {
    report += verify.output.report + "\n";
} else {
    report += "verify failed\n";
}
report += "\n**Policy:** orientation only · official permit links · never consumption.\n";

let path = write_scratch_file("map-cotos-expand-report.md", report);
complete(#{
    status: status,
    mode: mode,
    audit: audit.output,
    scrape_summaries: scrape_summaries,
    candidates_count: all_candidates.len(),
    implement: if implement != () && implement.success { implement.output } else { () },
    verify: if verify != () && verify.success { verify.output } else { () },
    report_path: path,
});
