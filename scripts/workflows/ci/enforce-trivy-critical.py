#!/usr/bin/env python3
import json
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: enforce-trivy-critical.py <report.json> <label>")

report_path = Path(sys.argv[1])
label = sys.argv[2]
report = json.loads(report_path.read_text(encoding="utf-8"))
vulnerabilities = []

for result in report.get("Results") or []:
    target = result.get("Target", "")
    for vuln in result.get("Vulnerabilities") or []:
        vulnerabilities.append(
            (
                target,
                vuln.get("VulnerabilityID", ""),
                vuln.get("PkgName", ""),
                vuln.get("InstalledVersion", ""),
                vuln.get("FixedVersion", ""),
            )
        )

if not vulnerabilities:
    print(f"No CRITICAL vulnerabilities found in {label}.")
    raise SystemExit(0)

print(f"CRITICAL vulnerabilities in {label}:")
for target, vuln_id, package, installed, fixed in vulnerabilities:
    fixed_display = fixed or "<none>"
    print(f"{vuln_id} | {package} | installed={installed} | fixed={fixed_display} | target={target}")
    print(f"::error title={vuln_id}::{package} installed={installed} fixed={fixed_display} target={target}")

raise SystemExit(1)
