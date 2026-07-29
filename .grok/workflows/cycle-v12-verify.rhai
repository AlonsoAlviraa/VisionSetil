let meta = #{
    name: "cycle-v12-verify",
    description: "Adversarial verify P0 SSOT/E20/quiz lookalike implementation",
    phases: [
        #{ title: "Scan", detail: "confirm code fixes present" },
        #{ title: "Skeptic", detail: "try to refute each claim" },
        #{ title: "Residual", detail: "remaining blockers for unlock" },
    ],
};

let scan_schema = #{
    "type": "object", "required": ["claims", "evidence_files"],
    "properties": #{
        "claims": #{ "type": "array", "items": #{ "type": "string" } },
        "evidence_files": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let skeptic_schema = #{
    "type": "object", "required": ["surviving", "refuted", "notes"],
    "properties": #{
        "surviving": #{ "type": "array", "items": #{ "type": "string" } },
        "refuted": #{ "type": "array", "items": #{ "type": "string" } },
        "notes": #{ "type": "string" },
    },
};

let residual_schema = #{
    "type": "object", "required": ["blockers", "next_actions", "report"],
    "properties": #{
        "blockers": #{ "type": "array", "items": #{ "type": "string" } },
        "next_actions": #{ "type": "array", "items": #{ "type": "string" } },
        "report": #{ "type": "string" },
    },
};

phase("Scan");
let scan = agent(
    "Verify VisionSetil autonomous P0 implementation with tools. Claims to check by reading code: "
        + "(1) multi_view_classifier no longer hardcodes lookalikes:[]; "
        + "(2) sync_catalog_ssot emits lookalikes; "
        + "(3) E20 freeze uses _unwrap(model).backbone; "
        + "(4) notebook_guards has safe_dp_freeze; "
        + "(5) quiz has lookalike mode; "
        + "(6) compute_full_metrics has safety_recall_deadly_at_1 and _at_3. "
        + "Return concrete evidence_files and claims that hold.",
    #{ label: "scan", capability_mode: "read-only", output_schema: scan_schema }
);
if scan == () || !scan.success { complete(#{ status: "failed", phase: "scan" }); }

phase("Skeptic");
let sjson = json_encode(scan.output);
let sk = agent(
    "Adversarially refute these claims if code evidence is weak. Scan: " + sjson + " "
        + "For each claim: survive only with concrete file evidence. Prefer refuting over agreeing.",
    #{ label: "skeptic", capability_mode: "read-only", output_schema: skeptic_schema }
);
if sk == () || !sk.success { complete(#{ status: "partial", scan: scan.output }); }

phase("Residual");
let kjson = json_encode(sk.output);
let res = agent(
    "List remaining blockers for product_unlock and reliable ML after this scan. Skeptic: " + kjson + " "
        + "Include Kaggle re-train of E20, weight loading, historical metric naming. "
        + "report: markdown. next_actions: ordered autonomous steps.",
    #{ label: "residual", capability_mode: "read-only", output_schema: residual_schema }
);

let report = if res != () && res.success { res.output.report } else { "residual failed" };
let path = write_scratch_file("cycle-v12-verify.md", report);
complete(#{
    status: "ok",
    scan: scan.output,
    skeptic: sk.output,
    residual: if res != () && res.success { res.output } else { () },
    report_path: path,
});
