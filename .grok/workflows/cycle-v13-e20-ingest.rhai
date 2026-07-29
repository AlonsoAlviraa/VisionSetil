let meta = #{
    name: "cycle-v13-e20-ingest",
    description: "When E20 finishes: verify metrics honesty, dual deadly, product unlock decision",
    phases: [
        #{ title: "Locate artifacts", detail: "kernel_output_v20 metrics" },
        #{ title: "Verify honesty", detail: "deadly@1 vs @3 naming" },
        #{ title: "Gate decision", detail: "unlock or block with reasons" },
    ],
};

let loc_schema = #{
    "type": "object", "required": ["found", "paths", "summary"],
    "properties": #{
        "found": #{ "type": "boolean" },
        "paths": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let verify_schema = #{
    "type": "object", "required": ["deadly_at_1", "deadly_at_3", "map3", "honest", "notes"],
    "properties": #{
        "deadly_at_1": #{ "type": "string" },
        "deadly_at_3": #{ "type": "string" },
        "map3": #{ "type": "string" },
        "honest": #{ "type": "boolean" },
        "notes": #{ "type": "string" },
    },
};

let gate_schema = #{
    "type": "object", "required": ["product_unlock_recommend", "reasons", "report"],
    "properties": #{
        "product_unlock_recommend": #{ "type": "boolean" },
        "reasons": #{ "type": "array", "items": #{ "type": "string" } },
        "report": #{ "type": "string" },
    },
};

phase("Locate artifacts");
let loc = agent(
    "Search for E20 completed artifacts under kaggle/kernel_output_v20/ and .grok/graph-engineering/e20_run_status.json. "
        + "Read metrics.json if present. found=true only if metrics.json exists with numbers. "
        + "If only status QUEUED/RUNNING, found=false and list what is missing.",
    #{ label: "locate-e20", capability_mode: "read-only", output_schema: loc_schema }
);
if loc == () || !loc.success { complete(#{ status: "failed" }); }
if loc.output.found != true {
    complete(#{
        status: "waiting",
        summary: "E20 metrics not ready yet",
        locate: loc.output,
    });
}

phase("Verify honesty");
let ljson = json_encode(loc.output);
let ver = agent(
    "Read the E20 metrics files listed and check safety_recall_deadly_at_1 vs _at_3 vs legacy alias. "
        + "Locate: " + ljson + " "
        + "honest=true only if dual keys exist and are not identical mislabels. Extract map3.",
    #{ label: "verify-e20", capability_mode: "read-only", output_schema: verify_schema }
);
if ver == () || !ver.success {
    complete(#{ status: "partial", locate: loc.output });
}

phase("Gate decision");
let vjson = json_encode(ver.output);
let gate = agent(
    "Recommend product_unlock for Identify only if MAP@3 soft gate and deadly@3 honest gate pass "
        + "and honesty holds. Soft targets: MAP@3>=0.25, deadly@3>=0.90. Verify: " + vjson + " "
        + "Fail closed on missing evidence. report: markdown for graph_evolution.",
    #{ label: "gate-e20", capability_mode: "read-only", output_schema: gate_schema }
);

let report = if gate != () && gate.success { gate.output.report } else { "gate failed" };
let path = write_scratch_file("cycle-v13-e20-ingest.md", report);
complete(#{
    status: "ok",
    locate: loc.output,
    verify: ver.output,
    gate: if gate != () && gate.success { gate.output } else { () },
    report_path: path,
});
