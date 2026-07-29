let meta = #{
    name: "multiview-benchmark-catalog",
    description: "Prove 4-photo multi-view via benchmark + expand ML-40 catalog + graph update",
    phases: [
        #{ title: "Expand catalog", detail: "ML-40 stubs + lookalikes + diagnostic map + SSOT sync" },
        #{ title: "Four-photo benchmark", detail: "proxy 1/2/4 + torch smoke E20" },
        #{ title: "Graph + gates", detail: "STATE evolution + tester smoke" },
    ],
};

let expand_schema = #{
    "type": "object", "required": ["status", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "catalog_total": #{ "type": "integer" },
        "ml40_in_catalog": #{ "type": "integer" },
        "lookalike_coverage": #{ "type": "number" },
    },
};

let bench_schema = #{
    "type": "object", "required": ["status", "summary", "map3_1", "map3_2", "map3_4"],
    "properties": #{
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "map3_1": #{ "type": "number" },
        "map3_2": #{ "type": "number" },
        "map3_4": #{ "type": "number" },
        "torch_ok": #{ "type": "boolean" },
    },
};

let graph_schema = #{
    "type": "object", "required": ["status", "summary"],
    "properties": #{
        "status": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "version": #{ "type": "string" },
    },
};

phase("Expand catalog");
let expand = agent(
    "Run from repo root VisionSetil: "
        + "python scripts/expand_catalog_ml40_multiview.py --sync "
        + "Read eval/reports/ml_experiments/catalog_ml40_multiview.json after. "
        + "status pass if ml40_in_catalog==40 and missing empty. "
        + "summary: short. Include catalog_total, ml40_in_catalog, lookalike_coverage. "
        + "Policy orientation_only never consumption.",
    #{ label: "expand-ml40-catalog", capability_mode: "all", output_schema: expand_schema }
);
if expand == () || !expand.success {
    log("expand agent failed — continue to benchmark");
}

phase("Four-photo benchmark");
let bench = agent(
    "Run: python eval/scripts/multiview_four_photo_benchmark.py "
        + "OR python scripts/run_multiview_catalog_cycle.py if expand already done. "
        + "Read eval/reports/ml_experiments/multiview_four_photo_benchmark.json. "
        + "status pass if overall PASS. Extract map3_1, map3_2, map3_4, torch_ok. "
        + "summary: prove 1→2→4 photo signal improves MAP@3. Never unlock product_unlock.",
    #{ label: "four-photo-bench", capability_mode: "all", output_schema: bench_schema }
);
if bench == () || !bench.success {
    complete(#{ status: "failed", phase: "benchmark", expand: if expand != () && expand.success { expand.output } else { () } });
}

phase("Graph + gates");
let bjson = json_encode(bench.output);
let ejson = if expand != () && expand.success { json_encode(expand.output) } else { "{}" };
let graph = agent(
    "Update graph engineering after multi-view cycle. "
        + "Benchmark: " + bjson + " Catalog: " + ejson + " "
        + "1) Append section v1.4.0-multiview-four-photo to .grok/graph-engineering/graph_evolution.md "
        + "2) Update .grok/graph-engineering/STATE.md: multi-view benchmark row, catalog count, residual next steps "
        + "3) Smoke: python scripts/run_professional_tester.py --fast (or note if skip). "
        + "product_unlock must remain false. status pass|partial. version v1.4.0-multiview-four-photo.",
    #{ label: "graph-update", capability_mode: "all", output_schema: graph_schema }
);

let report = "# Multi-view benchmark + catalog cycle\n\n"
    + "## Benchmark\n" + (if bench != () && bench.success { bench.output.summary } else { "failed" }) + "\n\n"
    + "## Catalog\n" + (if expand != () && expand.success { expand.output.summary } else { "skipped/failed" }) + "\n\n"
    + "## Graph\n" + (if graph != () && graph.success { graph.output.summary } else { "partial" }) + "\n";
let path = write_scratch_file("multiview-benchmark-catalog-report.md", report);
complete(#{
    status: if bench != () && bench.success && bench.output.status == "pass" { "pass" } else { "partial" },
    expand: if expand != () && expand.success { expand.output } else { () },
    bench: if bench != () && bench.success { bench.output } else { () },
    graph: if graph != () && graph.success { graph.output } else { () },
    report_path: path,
});
