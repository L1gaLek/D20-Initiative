#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "spells_srd_db.json"
REPORT_PATH = ROOT / "spells_srd_db_coverage_report.md"

SCHOOL_RE = r"Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation"
HEADER_RE = re.compile(rf"([A-Z][A-Za-z’'\-/ ]{{2,60}}?)\s+({SCHOOL_RE})\s+(cantrip|[1-9](?:st|nd|rd|th)-level)")


def main() -> None:
    data = json.loads(DB_PATH.read_text(encoding="utf-8"))
    spells = data["spells"]
    db_names = {item["name_en"] for item in spells}

    embedded_headers: list[str] = []
    for item in spells:
        text = item.get("description_ru", "") or item.get("description_en", "")
        for match in HEADER_RE.finditer(text):
            name = " ".join(match.group(1).split())
            if name != item["name_en"]:
                embedded_headers.append(name)

    unique_embedded = list(dict.fromkeys(embedded_headers))
    missing = [name for name in unique_embedded if name not in db_names]

    lines: list[str] = [
        "# spells_srd_db.json coverage check",
        "",
        f"- Total records in `spells_srd_db.json`: **{len(spells)}**",
        f"- Records with level 0 (cantrips): **{sum(1 for s in spells if s.get('level') == 0)}**",
        f"- Embedded spell headers found in descriptions: **{len(unique_embedded)}**",
        f"- Missing as standalone records: **{len(missing)}**",
        "",
    ]
    if missing:
        lines.append("## Missing spells/cantrips")
        lines.extend(f"- {name}" for name in missing)

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
