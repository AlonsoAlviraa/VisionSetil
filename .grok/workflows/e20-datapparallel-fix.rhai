let meta = #{
    name: "e20-datapparallel-fix",
    description: "Find and fix the E20 DataParallel.backbone crash; propose honest deadly@3 metrics",
    when_to_use: "E20 source-holdout failed or product_unlock blocked by unreliable metrics",
    phases: [
        #{ title: "Locate", detail: "find DataParallel / backbone access in E20 training code" },
        #{ title: "Diagnose", detail: "confirm root cause from logs and code" },
        #{ title: "Patch plan", detail: "minimal fix + re-run checklist + deadly@3 naming" },
    ],
};

let locate_schema = #{
    "type": "object", "required": ["files", "suspect_lines", "summary"],
    "properties": #{
        "files": #{ "type": "array", "items": #{ "type": "string" } },
        "suspect_lines": #{ "type": "array", "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let diagnose_schema = #{
    "type": "object", "required": ["root_cause", "evidence", "fix_kind"],
    "properties": #{
        "root_cause": #{ "type": "string" },
        "evidence": #{ "type": "string" },
        "fix_kind": #{ "type": "string" },
        "related_metric_bugs": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let plan_schema = #{
    "type": "object", "required": ["patch_steps", "verify_commands", "deadly_metric_fix", "report"],
    "properties": #{
        "patch_steps": #{ "type": "array", "items": #{ "type": "string" } },
        "verify_commands": #{ "type": "array", "items": #{ "type": "string" } },
        "deadly_metric_fix": #{ "type": "string" },
        "report": #{ "type": "string" },
    },
};

phase("Locate");
let locate = agent(
    "You are investigating VisionSetil E20 training failure. "
        + "AttributeError: DataParallel has no attribute 'backbone' during warmup freeze. "
        + "Search the repo with grep/read_file for: DataParallel, .backbone, warmup, freeze, "
        + "build_exp_v20, industrial training wrappers, nn.DataParallel. "
        + "Key paths to check first: kaggle/, docs/KAGGLE_FIX_PROMPT.md, "
        + "kaggle/kernel_output_v20/, eval/reports/ml_experiments/e20_source_holdout_plan.md. "
        + "Return concrete files and suspect call sites. Do not invent paths — only report what you read.",
    #{
        label: "locate-e20",
        capability_mode: "read-only",
        output_schema: locate_schema,
    }
);

if locate == () || !locate.success {
    complete(#{ summary: "Locate agent failed", status: "failed" });
}

phase("Diagnose");
let locate_json = json_encode(locate.output);
let diagnose = agent(
    "Diagnose the E20 DataParallel.backbone crash from this locate result and by re-reading the cited files. "
        + "Locate JSON: " + locate_json + " "
        + "Also check whether safety_recall_deadly is mislabeled top-1 vs @3 in metrics writers "
        + "(eval/reports/ml_experiments/professional_tester_latest.json, e19_leak_audit.md). "
        + "fix_kind should be one of: wrapper_access, missing_module_attr, freeze_path, other. "
        + "Evidence must quote real code or log lines you inspected.",
    #{
        label: "diagnose-e20",
        capability_mode: "read-only",
        output_schema: diagnose_schema,
    }
);

if diagnose == () || !diagnose.success {
    complete(#{
        summary: "Diagnose failed after locate",
        locate: locate.output,
        status: "partial",
    });
}

phase("Patch plan");
let diag_json = json_encode(diagnose.output);
let plan = agent(
    "Produce a minimal, actionable patch plan for VisionSetil based on this diagnosis. "
        + "Diagnosis: " + diag_json + " "
        + "Include: (1) exact code change pattern for DataParallel (module.backbone vs .module.backbone), "
        + "(2) how to re-run E20 source-holdout safely, (3) how to fix deadly@3 naming so product gates are honest, "
        + "(4) a short markdown report in field report. "
        + "Prefer smallest safe fix. Do not claim you applied the patch unless you used write tools — this agent is planning only.",
    #{
        label: "plan-e20",
        capability_mode: "read-only",
        output_schema: plan_schema,
    }
);

if plan == () || !plan.success {
    complete(#{
        summary: "Plan failed",
        locate: locate.output,
        diagnose: diagnose.output,
        status: "partial",
    });
}

let report_text = plan.output.report;
if report_text == () { report_text = "No report field"; }
let path = write_scratch_file("e20-datapparallel-fix-report.md", report_text);

complete(#{
    summary: "E20 DataParallel diagnosis + patch plan ready",
    status: "ok",
    locate: locate.output,
    diagnose: diagnose.output,
    plan: plan.output,
    report_path: path,
});
