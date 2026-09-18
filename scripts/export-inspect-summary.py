#!/usr/bin/env python3
"""
Inspect AI Eval Log Header Summary Exporter for Scourgify.

Reads .eval or log files using inspect_ai.log.read_eval_log(..., header_only=True)
and outputs bounded aggregate JSON suitable for Scourgify experiment import.
Does not extract arbitrary sample/patient prompts, responses, or execution data.
"""

import argparse
import json
import re
import sys

ALLOWED_CONFIG_KEYS = {
    "epochs",
    "batch_size",
    "temperature",
    "top_p",
    "max_tokens",
    "limit",
    "seed",
}

SENSITIVE_PATTERNS = [
    re.compile(r"api[_-]?key", re.I),
    re.compile(r"secret", re.I),
    re.compile(r"token", re.I),
    re.compile(r"password", re.I),
    re.compile(r"auth", re.I),
]


def is_sensitive(key: str) -> bool:
    return any(p.search(key) for p in SENSITIVE_PATTERNS)


def extract_summary(log_path: str) -> dict:
    try:
        from inspect_ai.log import read_eval_log
    except ImportError:
        raise RuntimeError(
            "inspect_ai is not installed in the Python environment. "
            "Install inspect_ai or convert logs using the inspect CLI before import."
        )

    log = read_eval_log(log_path, header_only=True)

    eval_spec = getattr(log, "eval", None)
    plan = getattr(log, "plan", None)
    results = getattr(log, "results", None)
    status_str = str(getattr(log, "status", "completed")).lower()

    run_id = getattr(eval_spec, "run_id", "unknown-run") if eval_spec else "unknown-run"
    task = getattr(eval_spec, "task", "unknown-task") if eval_spec else "unknown-task"
    model = getattr(eval_spec, "model", "unknown-model") if eval_spec else "unknown-model"

    # Bounded aggregate metrics
    aggregate_metrics: dict[str, float] = {}
    if results and hasattr(results, "scores"):
        for score in results.scores:
            name = getattr(score, "name", "metric")
            val = getattr(score, "metrics", {})
            if isinstance(val, dict):
                for m_k, m_v in val.items():
                    val_num = getattr(m_v, "value", m_v)
                    if isinstance(val_num, (int, float)):
                        aggregate_metrics[f"{name}.{m_k}"] = float(val_num)

    # Bounded aggregate config
    aggregate_config: dict[str, str | int | float | bool] = {}
    raw_config = getattr(plan, "config", {}) if plan else {}
    if isinstance(raw_config, dict):
        for k, v in raw_config.items():
            if not is_sensitive(k) and isinstance(v, (str, int, float, bool)):
                aggregate_config[k] = v

    record = {
        "format": "scourgify-experiment-v1",
        "runId": str(run_id),
        "title": f"{task} - {model}",
        "status": "completed" if status_str == "success" else "failed",
        "task": str(task),
        "model": str(model),
        "codeCommit": None,
        "aggregateConfig": aggregate_config,
        "aggregateMetrics": aggregate_metrics,
        "failureCategories": [],
        "startedAt": None,
        "completedAt": None,
    }

    return record


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract bounded header-only aggregate summary from Inspect AI eval log."
    )
    parser.add_argument("log_path", help="Path to .eval or eval log file")
    parser.add_argument(
        "--output", "-o", help="Optional output JSON file (defaults to stdout)"
    )

    args = parser.parse_args()

    try:
        summary = extract_summary(args.log_path)
    except Exception as err:
        sys.stderr.write(f"Error: {err}\n")
        return 1

    out_json = json.dumps(summary, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out_json + "\n")
    else:
        sys.stdout.write(out_json + "\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
