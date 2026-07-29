let meta = #{
    name: "lookalike-ssot-wire",
    description: "Audit lookalike SSOT gaps FE/BE and produce a wiring plan (multi-view, API, catalog)",
    when_to_use: "dangerous_lookalikes empty, multi-view hardcodes lookalikes, catalog schema drift",
    phases: [
        #{ title: "Map SSOT", detail: "catalog schema + runtime enrichment" },
        #{ title: "Find gaps", detail: "hardcoded empty lists and type mismatches" },
        #{ title: "Wire plan", detail: "normalize schema and call sites" },
    ],
};

let map_schema = #{
    "type": "object", "required": ["ssot_files", "runtime_files", "schema_shape", "summary"],
    "properties": #{
        "ssot_files": #{ "type": "array", "items": #{ "type": "string" } },
        "runtime_files": #{ "type": "array", "items": #{ "type": "string" } },
        "schema_shape": #{ "type": "string" },
        "summary": #{ "type": "string" },
    },
};

let gap_schema = #{
    "type": "object", "required": ["gaps", "severity"],
    "properties": #{
        "gaps": #{ "type": "array", "items": #{
            "type": "object",
            "required": ["file", "issue", "severity"],
            "properties": #{
                "file": #{ "type": "string" },
                "issue": #{ "type": "string" },
                "severity": #{ "type": "string" },
            },
        }},
        "severity": #{ "type": "string" },
    },
};

let wire_schema = #{
    "type": "object", "required": ["steps", "target_schema", "tests", "report"],
    "properties": #{
        "steps": #{ "type": "array", "items": #{ "type": "string" } },
        "target_schema": #{ "type": "string" },
        "tests": #{ "type": "array", "items": #{ "type": "string" } },
        "report": #{ "type": "string" },
    },
};

phase("Map SSOT");
let mapped = agent(
    "Map VisionSetil lookalike single source of truth. Read with tools (do not invent): "
        + "data/species_catalog/schema/species_catalog.schema.json, "
        + "data/species_catalog/species_catalog_v2.json (sample a few taxa with lookalikes), "
        + "backend/app/services/poisonous_lookalikes.py, "
        + "backend/app/services/classifier.py, "
        + "backend/app/services/multi_view_classifier.py, "
        + "backend/app/services/open_set_rejection.py, "
        + "backend/app/services/species_catalog.py, "
        + "frontend/src/lib/lookalikeRisk.ts, "
        + "frontend/src/lib/lookalikeStudio.ts, "
        + "frontend/src/components/ResultCard.tsx. "
        + "Describe schema_shape: objects {scientific_name, note_key} vs list[str]. "
        + "Return real file paths only.",
    #{
        label: "map-ssot",
        capability_mode: "read-only",
        output_schema: map_schema,
    }
);

if mapped == () || !mapped.success {
    complete(#{ summary: "Map SSOT failed", status: "failed" });
}

phase("Find gaps");
let map_json = json_encode(mapped.output);
let gaps = agent(
    "Find concrete wiring gaps for lookalikes. SSOT map: " + map_json + " "
        + "Grep/read for: lookalikes: [], dangerous_lookalikes, .split(, note_key, "
        + "species_catalog_expanded, promote, multi_view. "
        + "Each gap needs file + issue + severity (critical|high|medium|low). "
        + "Focus on: hardcoded empty lookalikes, object vs string mismatches, "
        + "expanded catalog missing keys, FE Studio not hydrated from SSOT. "
        + "severity = overall product impact for Identify + Lookalike Studio.",
    #{
        label: "find-gaps",
        capability_mode: "read-only",
        output_schema: gap_schema,
    }
);

if gaps == () || !gaps.success {
    complete(#{
        summary: "Gap scan failed",
        map: mapped.output,
        status: "partial",
    });
}

phase("Wire plan");
let gaps_json = json_encode(gaps.output);
let wire = agent(
    "Write a wiring plan to close lookalike SSOT gaps without inventing lookalikes from embeddings. "
        + "Gaps: " + gaps_json + " "
        + "Safety rules: never invent lookalikes; catalog is source of truth; Identify remains orientation_only. "
        + "target_schema: pick one normalized shape (prefer catalog objects + API adapter to string names). "
        + "steps: ordered implementation steps. tests: pytest/vitest to add. "
        + "report: markdown summary for the team.",
    #{
        label: "wire-plan",
        capability_mode: "read-only",
        output_schema: wire_schema,
    }
);

if wire == () || !wire.success {
    complete(#{
        summary: "Wire plan failed",
        map: mapped.output,
        gaps: gaps.output,
        status: "partial",
    });
}

let report_text = wire.output.report;
if report_text == () { report_text = "No report"; }
let path = write_scratch_file("lookalike-ssot-wire-report.md", report_text);

complete(#{
    summary: "Lookalike SSOT audit + wiring plan ready",
    status: "ok",
    map: mapped.output,
    gaps: gaps.output,
    plan: wire.output,
    report_path: path,
});
