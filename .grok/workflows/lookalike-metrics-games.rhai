let meta = #{
    name: "lookalike-metrics-games",
    description: "Design lookalike-pair safety metrics and quiz/game improvements without unsafe ML coupling",
    when_to_use: "need pair metrics, confusion cost, or educational game upgrades",
    phases: [
        #{ title: "Metrics audit", detail: "what safety/confusion metrics exist today" },
        #{ title: "Games audit", detail: "quiz pool and safety framing" },
        #{ title: "Improve plan", detail: "pair metrics + educational game upgrades" },
    ],
};

let metrics_schema = #{
    "type": "object", "required": ["existing_metrics", "missing_metrics", "summary"],
    "properties": #{
        "existing_metrics": #{ "type": "array", "items": #{ "type": "string" } },
        "missing_metrics": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let games_schema = #{
    "type": "object", "required": ["modes", "ml_coupled", "safety_notes", "summary"],
    "properties": #{
        "modes": #{ "type": "array", "items": #{ "type": "string" } },
        "ml_coupled": #{ "type": "boolean" },
        "safety_notes": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let improve_schema = #{
    "type": "object", "required": ["pair_metric_spec", "game_upgrades", "priority_order", "report"],
    "properties": #{
        "pair_metric_spec": #{ "type": "array", "items": #{ "type": "string" } },
        "game_upgrades": #{ "type": "array", "items": #{ "type": "string" } },
        "priority_order": #{ "type": "array", "items": #{ "type": "string" } },
        "report": #{ "type": "string" },
    },
};

phase("Metrics audit");
let metrics = agent(
    "Audit VisionSetil safety and confusion metrics. Read with tools: "
        + "eval/scripts/compute_full_metrics.py, eval/scripts/run_eval.py, "
        + "docs/evaluation_strategy.md, docs/PLAN_30D_MODELO_INDUSTRIAL.md, "
        + "eval/reports/ml_experiments/professional_tester_latest.json (or .md), "
        + "kaggle/anti_leak_splitter.py (lookalike groups). "
        + "List existing_metrics (names as in code) and missing_metrics for lookalike pairs, "
        + "confusion cost, false-safe, deadly@3 honesty. Use tools; do not invent metric names.",
    #{
        label: "metrics-audit",
        capability_mode: "read-only",
        output_schema: metrics_schema,
    }
);

if metrics == () || !metrics.success {
    complete(#{ summary: "Metrics audit failed", status: "failed" });
}

phase("Games audit");
let games = agent(
    "Audit VisionSetil quiz/games. Read: "
        + "frontend/src/lib/mushroomQuiz.ts, frontend/src/pages/QuizGamePage.tsx, "
        + "docs/SAFETY_POLICY.md, docs/PHASE_D_30D_FEATURES_AND_BEAUTY.md, "
        + "frontend/src/lib/lookalikeStudio.ts, frontend/src/pages/LookalikeStudioPage.tsx if present. "
        + "Report modes, whether ml_coupled is true/false (boolean), safety_notes from policy, summary. "
        + "Confirm if quiz invents lookalikes or uses only documented food_quality/catalog.",
    #{
        label: "games-audit",
        capability_mode: "read-only",
        output_schema: games_schema,
    }
);

if games == () || !games.success {
    complete(#{
        summary: "Games audit failed",
        metrics: metrics.output,
        status: "partial",
    });
}

phase("Improve plan");
let m_json = json_encode(metrics.output);
let g_json = json_encode(games.output);
let improve = agent(
    "Design improvements for lookalike pair metrics and educational games. "
        + "Metrics audit: " + m_json + " Games audit: " + g_json + " "
        + "Rules: (1) do NOT couple quiz to live classifier until product_unlock; "
        + "(2) never invent lookalikes from embeddings; "
        + "(3) pair metrics must be computable from eval harness + catalog pairs; "
        + "(4) games stay educational / orientation_only framing. "
        + "pair_metric_spec: concrete metric definitions to implement. "
        + "game_upgrades: UX/content upgrades (e.g. classic lookalike pairs mode with diagnostic 'why'). "
        + "priority_order: ordered next actions. report: markdown for the team.",
    #{
        label: "improve-plan",
        capability_mode: "read-only",
        output_schema: improve_schema,
    }
);

if improve == () || !improve.success {
    complete(#{
        summary: "Improve plan failed",
        metrics: metrics.output,
        games: games.output,
        status: "partial",
    });
}

let report_text = improve.output.report;
if report_text == () { report_text = "No report"; }
let path = write_scratch_file("lookalike-metrics-games-report.md", report_text);

complete(#{
    summary: "Lookalike metrics + games improvement plan ready",
    status: "ok",
    metrics: metrics.output,
    games: games.output,
    plan: improve.output,
    report_path: path,
});
