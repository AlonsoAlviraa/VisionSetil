let meta = #{
    name: "competitive-apps-research",
    description: "Research similar mushroom ID apps and extract best UX/features for VisionSetil",
    phases: [
        #{ title: "Scan competitors", detail: "Picture Mushroom, Seek, iNat, Shroomify features" },
        #{ title: "Gap map", detail: "what VisionSetil already has vs best-in-class" },
        #{ title: "Adopt plan", detail: "prioritized safe improvements" },
    ],
};

let scan_schema = #{
    "type": "object", "required": ["apps", "summary"],
    "properties": #{
        "apps": #{ "type": "array", "items": #{
            "type": "object",
            "required": ["name", "strengths", "weaknesses"],
            "properties": #{
                "name": #{ "type": "string" },
                "strengths": #{ "type": "array", "items": #{ "type": "string" } },
                "weaknesses": #{ "type": "array", "items": #{ "type": "string" } },
            },
        }},
        "summary": #{ "type": "string" },
    },
};

let gap_schema = #{
    "type": "object", "required": ["already_have", "gaps", "must_keep_safety"],
    "properties": #{
        "already_have": #{ "type": "array", "items": #{ "type": "string" } },
        "gaps": #{ "type": "array", "items": #{ "type": "string" } },
        "must_keep_safety": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let plan_schema = #{
    "type": "object", "required": ["priorities", "report"],
    "properties": #{
        "priorities": #{ "type": "array", "items": #{ "type": "string" } },
        "report": #{ "type": "string" },
    },
};

phase("Scan competitors");
let scan = agent(
    "Research competitor mushroom ID apps (Picture Mushroom, Seek by iNaturalist, iNaturalist, Shroomify, Mushroom Identify). "
        + "Use web_search/web_fetch if available. For each app list strengths and weaknesses. "
        + "Focus on: multi-photo capture, confidence honesty, encyclopedia, lookalikes, community, offline, gamification, safety language. "
        + "Never recommend consuming based on apps.",
    #{ label: "scan-apps", capability_mode: "read-only", output_schema: scan_schema }
);
if scan == () || !scan.success { complete(#{ status: "failed" }); }

phase("Gap map");
let sjson = json_encode(scan.output);
let gaps = agent(
    "Map VisionSetil repo (frontend Identify multi-view, open-set, encyclopedia, lookalike studio, setadle/quiz, offline pack, safety policy) "
        + "against competitor strengths. Competitors JSON: " + sjson + " "
        + "Read key files if needed: frontend IdentifyPage, MultiViewWizard, ResultCard, lookalikeStudio, SAFETY_POLICY docs. "
        + "List already_have, gaps (adoptable without breaking safety), must_keep_safety (VisionSetil differentiators).",
    #{ label: "gap-map", capability_mode: "read-only", output_schema: gap_schema }
);
if gaps == () || !gaps.success {
    complete(#{ status: "partial", scan: scan.output });
}

phase("Adopt plan");
let gjson = json_encode(gaps.output);
let plan = agent(
    "Produce ordered priorities to improve VisionSetil from competitor best practices WITHOUT consumption permission, "
        + "WITHOUT green edible badges, WITH open-set honesty. Gaps: " + gjson + " "
        + "report: markdown actionable for engineers. priorities: short checklist.",
    #{ label: "adopt-plan", capability_mode: "read-only", output_schema: plan_schema }
);

let report = if plan != () && plan.success { plan.output.report } else { "plan failed" };
let path = write_scratch_file("competitive-apps-report.md", report);
complete(#{
    status: "ok",
    scan: scan.output,
    gaps: gaps.output,
    plan: if plan != () && plan.success { plan.output } else { () },
    report_path: path,
});
