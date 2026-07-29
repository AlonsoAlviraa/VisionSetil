let meta = #{
    name: "competitive-adopt-harden",
    description: "Adopt competitor best practices safely, then harden with professional + FE testers",
    phases: [
        #{ title: "Scan gaps", detail: "competitive doc + code vs Picture Mushroom / Seek / iNat" },
        #{ title: "Adopt + harden", detail: "implement safe gaps and fix regressions" },
        #{ title: "Testers", detail: "vitest + professional ML + accenture audit" },
    ],
};

let gap_schema = #{
    "type": "object", "required": ["priorities", "must_not"],
    "properties": #{
        "priorities": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
        "must_not": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
        "notes": #{ "type": "string" },
    },
};

let adopt_schema = #{
    "type": "object", "required": ["changed_files", "summary"],
    "properties": #{
        "changed_files": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
        "residual_gaps": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let test_schema = #{
    "type": "object", "required": ["status", "report"],
    "properties": #{
        "status": #{ "type": "string" },
        "report": #{ "type": "string" },
        "failed_suites": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

phase("Scan gaps");
let gaps = agent(
    "Read docs/COMPETITIVE_APPS.md, frontend/src/lib/competitiveFeatures.test.ts, "
        + "frontend/src/lib/phenology.ts, frontend/src/lib/studyBadges.ts, "
        + "frontend/src/pages/HomePage.tsx, SpeciesDetailPage.tsx, QuizGamePage.tsx. "
        + "List remaining safe competitive priorities still missing (if any) and must_not safety rules. "
        + "Use read_file/grep only. Orientation only — never consumption permission.",
    #{ label: "scan-competitive-gaps", capability_mode: "read-only", output_schema: gap_schema }
);
if gaps == () || !gaps.success {
    complete(#{ status: "failed", phase: "scan" });
}

phase("Adopt + harden");
let gjson = json_encode(gaps.output);
let adopt = agent(
    "Implement remaining safe competitive priorities from this plan JSON if any still missing: "
        + gjson + " "
        + "Focus on: phenology bar, Seek-style study badges (games only), privacy strip, multi-view, lookalike CTAs. "
        + "NEVER add edible green lights or consumption permission. "
        + "Update competitiveFeatures tests. Write only under frontend/ and docs/. "
        + "Return changed_files and summary.",
    #{ label: "adopt-competitive", capability_mode: "read-write", output_schema: adopt_schema }
);
if adopt == () || !adopt.success {
    log("adopt agent failed or empty — continue to testers on current tree");
}

phase("Testers");
let tests = agent(
    "Harden VisionSetil so competitive features do not fail. Run from repo root: "
        + "(1) frontend: npm.cmd run test -- --run src/lib/competitiveFeatures.test.ts src/lib/phenology.test.ts src/lib/studyBadges.test.ts "
        + "and if green, npm.cmd run test -- --run (or at least competitive + safety suites). "
        + "(2) python scripts/run_professional_tester.py --fast "
        + "(3) python scripts/run_accenture_audit.py "
        + "Fix any failures you introduce. status must be pass|fail|partial. report: concise markdown of results.",
    #{ label: "run-testers-fix", capability_mode: "all", output_schema: test_schema }
);

let report = if tests != () && tests.success { tests.output.report } else { "testers agent failed" };
let path = write_scratch_file("competitive-adopt-harden-report.md", report);
complete(#{
    status: if tests != () && tests.success { tests.output.status } else { "partial" },
    gaps: gaps.output,
    adopt: if adopt != () && adopt.success { adopt.output } else { () },
    tests: if tests != () && tests.success { tests.output } else { () },
    report_path: path,
});
