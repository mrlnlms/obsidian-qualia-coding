#!/usr/bin/env python3
"""Generate a one-off Markdown audit of QDPX PDF selections vs Qualia markers."""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET


DEFAULT_QDPX = Path("../../../QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA.qdpx")
DEFAULT_DATA = Path("data.json")
DEFAULT_COVERAGE = Path("../../../imports/_qualia-pdf-marker-coverage-audit.json")
DEFAULT_OUTPUT = Path("QDPX-ATLAS-FINAL-AUDIT.md")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def direct_children(el: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in list(el) if local_name(child.tag) == name]


def descendants(el: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in el.iter() if local_name(child.tag) == name]


def attr(el: ET.Element | None, name: str) -> str | None:
    if el is None:
        return None
    return el.attrib.get(name)


def norm_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value.replace("\u2026", "...")).strip()


def md_cell(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\n", " ").replace("|", "\\|")
    return text


def clip(value: str, limit: int = 180) -> str:
    value = norm_text(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "..."


@dataclass
class Coding:
    user_guid: str
    code_guid: str


@dataclass
class SelectionPair:
    source_name: str
    source_guid: str
    guid: str
    pdf_page: int | None
    pdf_name: str
    text_name: str
    start_position: int | None
    end_position: int | None
    codings: list[Coding] = field(default_factory=list)


def int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def collect_codings(selection: ET.Element | None) -> list[Coding]:
    if selection is None:
        return []
    out: list[Coding] = []
    for coding_el in direct_children(selection, "Coding"):
        user_guid = attr(coding_el, "creatingUser") or ""
        code_ref = next(iter(direct_children(coding_el, "CodeRef")), None)
        code_guid = attr(code_ref, "targetGUID") or ""
        if code_guid:
            out.append(Coding(user_guid=user_guid, code_guid=code_guid))
    return out


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def unique_codings(codings: Iterable[Coding]) -> list[Coding]:
    seen: set[tuple[str, str]] = set()
    out: list[Coding] = []
    for coding in codings:
        key = (coding.user_guid, coding.code_guid)
        if key in seen:
            continue
        seen.add(key)
        out.append(coding)
    return out


def parse_qdpx(qdpx_path: Path) -> tuple[list[SelectionPair], dict[str, str], dict[str, str]]:
    with zipfile.ZipFile(qdpx_path) as zf:
        qde_name = next(name for name in zf.namelist() if name.endswith(".qde"))
        root = ET.fromstring(zf.read(qde_name))

    users = {
        attr(user, "guid") or "": attr(user, "name") or attr(user, "guid") or ""
        for user in descendants(root, "User")
    }
    codes = {
        attr(code, "guid") or "": attr(code, "name") or attr(code, "guid") or ""
        for code in descendants(root, "Code")
    }

    selections: list[SelectionPair] = []
    for source in descendants(root, "PDFSource"):
        source_name = attr(source, "name") or "unknown PDF"
        source_guid = attr(source, "guid") or ""
        by_guid: dict[str, dict[str, ET.Element]] = {}

        for pdf_sel in direct_children(source, "PDFSelection"):
            guid = attr(pdf_sel, "guid")
            if guid:
                by_guid.setdefault(guid, {})["pdf"] = pdf_sel

        for repr_el in direct_children(source, "Representation"):
            for text_sel in direct_children(repr_el, "PlainTextSelection"):
                guid = attr(text_sel, "guid")
                if guid:
                    by_guid.setdefault(guid, {})["text"] = text_sel

        for guid, pair in by_guid.items():
            pdf_sel = pair.get("pdf")
            text_sel = pair.get("text")
            codings = unique_codings(collect_codings(pdf_sel) + collect_codings(text_sel))
            if not codings:
                continue
            selections.append(
                SelectionPair(
                    source_name=source_name,
                    source_guid=source_guid,
                    guid=guid,
                    pdf_page=int_or_none(attr(pdf_sel, "page")),
                    pdf_name=norm_text(attr(pdf_sel, "name")),
                    text_name=norm_text(attr(text_sel, "name")),
                    start_position=int_or_none(attr(text_sel, "startPosition")),
                    end_position=int_or_none(attr(text_sel, "endPosition")),
                    codings=codings,
                )
            )

    return selections, users, codes


def load_qualia_markers(data_path: Path) -> dict[str, dict]:
    data = json.loads(data_path.read_text(encoding="utf-8"))
    return {
        marker["id"]: marker
        for marker in data.get("pdf", {}).get("markers", [])
        if marker.get("id")
    }


def marker_status(marker: dict | None) -> str:
    if marker is None:
        return "missing"
    pending = (
        marker.get("beginIndex") == 0
        and marker.get("beginOffset") == 0
        and marker.get("endIndex") == 0
        and marker.get("endOffset") == 0
    )
    return "pending" if pending else "resolved"


def marker_range(marker: dict | None) -> str:
    if marker is None:
        return ""
    return f"{marker.get('beginIndex')}:{marker.get('beginOffset')}-{marker.get('endIndex')}:{marker.get('endOffset')}"


def qdpx_text(sel: SelectionPair, marker: dict | None) -> str:
    candidates = [sel.pdf_name, sel.text_name, norm_text(marker.get("text") if marker else "")]
    return max(candidates, key=len)


def load_coverage_rows(coverage_path: Path | None) -> dict[str, dict]:
    if coverage_path is None or not coverage_path.exists():
        return {}
    data = json.loads(coverage_path.read_text(encoding="utf-8"))
    return {
        row["markerId"]: row
        for row in data.get("rows", [])
        if row.get("markerId")
    }


def generate_report(qdpx_path: Path, data_path: Path, coverage_path: Path | None, output_path: Path, text_limit: int | None) -> None:
    selections, users, codes = parse_qdpx(qdpx_path)
    markers = load_qualia_markers(data_path)
    coverage = load_coverage_rows(coverage_path)

    rows = []
    for sel in selections:
        marker = markers.get(f"import_{sel.guid}")
        coverage_row = coverage.get(f"import_{sel.guid}")
        coder_names = unique_preserve_order(users.get(c.user_guid, c.user_guid or "unknown") for c in sel.codings)
        code_names = unique_preserve_order(codes.get(c.code_guid, c.code_guid) for c in sel.codings)
        q_page = sel.pdf_page
        final_page = marker.get("page") if marker else None
        page_shift = "" if q_page is None or final_page is None or q_page == final_page else f"{q_page}->{final_page}"
        rows.append(
            {
                "pdf": sel.source_name,
                "guid": sel.guid,
                "qdpx_page": q_page,
                "qualia_page": final_page,
                "page_shift": page_shift,
                "status": marker_status(marker),
                "range": marker_range(marker),
                "coder_count": len(coder_names),
                "coders": ", ".join(coder_names),
                "code_count": len(code_names),
                "codes": ", ".join(code_names),
                "qdpx_name": sel.pdf_name or sel.text_name,
                "expected_text": norm_text(marker.get("text") if marker else qdpx_text(sel, marker)),
                "marker_text": norm_text(marker.get("text") if marker else ""),
                "coverage_match": "" if coverage_row is None else ("yes" if coverage_row.get("matches") else "NO"),
                "coverage_class": coverage_row.get("coverageClass", "") if coverage_row else "",
                "coverage_ratio": coverage_row.get("coverageRatio", "") if coverage_row else "",
                "covered_text": norm_text(coverage_row.get("coveredPreview") if coverage_row else ""),
                "continued_by": "yes" if marker and marker.get("importedQdpxContinuedBy") else "",
            }
        )

    rows.sort(key=lambda r: (r["pdf"], r["qdpx_page"] or 0, r["qualia_page"] or 0, r["range"], r["expected_text"]))

    total = len(rows)
    resolved = sum(1 for r in rows if r["status"] == "resolved")
    pending = sum(1 for r in rows if r["status"] == "pending")
    missing = sum(1 for r in rows if r["status"] == "missing")
    shifts = sum(1 for r in rows if r["page_shift"])
    continued = sum(1 for r in rows if r["continued_by"])

    lines: list[str] = []
    lines.append("# Auditoria final QDPX Atlas.ti vs Qualia PDF import")
    lines.append("")
    lines.append(f"- QDPX: `{qdpx_path}`")
    lines.append(f"- Qualia data: `{data_path}`")
    if coverage:
        coverage_matches = sum(1 for row in coverage.values() if row.get("matches"))
        coverage_classes: dict[str, int] = {}
        for row in coverage.values():
            coverage_class = row.get("coverageClass") or ("match" if row.get("matches") else "unclassified")
            coverage_classes[coverage_class] = coverage_classes.get(coverage_class, 0) + 1
        lines.append(f"- Coverage audit: `{coverage_path}`")
        lines.append(f"- Coverage matches: `{coverage_matches}/{len(coverage)}`")
        lines.append(f"- Coverage mismatches: `{len(coverage) - coverage_matches}`")
        lines.append("- Coverage classes: " + ", ".join(f"`{name}={count}`" for name, count in sorted(coverage_classes.items())))
    elif coverage_path is not None:
        lines.append(f"- Coverage audit: nao encontrado em `{coverage_path}`")
    lines.append(f"- Selections PDF codificadas no QDPX: `{total}`")
    lines.append(f"- Markers resolvidos no Qualia: `{resolved}`")
    lines.append(f"- Markers pendentes no Qualia: `{pending}`")
    lines.append(f"- Selections QDPX sem marker Qualia: `{missing}`")
    lines.append(f"- Page shifts QDPX -> Qualia: `{shifts}`")
    lines.append(f"- Markers com `continued by`: `{continued}`")
    lines.append("")
    lines.append("## Como ler")
    lines.append("")
    lines.append("- `QDPX page`: pagina original declarada pelo `PDFSelection` do Atlas.ti.")
    lines.append("- `Qualia page`: pagina final onde o marker foi ancorado no PDF.js/Obsidian.")
    lines.append("- `Coders`: usuarios/codificadores encontrados nos elementos `Coding` do QDPX.")
    lines.append("- `Codes`: codigos aplicados no QDPX para a selection.")
    lines.append("- `QDPX name`: texto declarado em `PDFSelection.name`/`PlainTextSelection.name`; em exports Atlas.ti, frequentemente vem abreviado com `...`.")
    lines.append("- `Trecho esperado no Qualia`: texto efetivo do `PdfMarker.text`; este e o trecho que deve aparecer marcado visualmente.")
    lines.append("- `Coverage`: comparacao runtime entre `Trecho esperado no Qualia` e texto coberto por `begin/end` na text layer do Obsidian.")
    lines.append("- `Coverage class`: classificacao objetiva do resultado (`match`, `covered-prefix`, `wrong-range-or-page`, etc.).")
    if text_limit is not None:
        lines.append(f"- Trechos truncados em `{text_limit}` caracteres para leitura; use `--full-text` para gerar sem truncamento.")
    lines.append("")

    for pdf in unique_preserve_order(r["pdf"] for r in rows):
        pdf_rows = [r for r in rows if r["pdf"] == pdf]
        pdf_resolved = sum(1 for r in pdf_rows if r["status"] == "resolved")
        pdf_shifts = sum(1 for r in pdf_rows if r["page_shift"])
        lines.append(f"## {pdf}")
        lines.append("")
        lines.append(f"- Markers: `{len(pdf_rows)}`")
        lines.append(f"- Resolvidos: `{pdf_resolved}`")
        lines.append(f"- Page shifts: `{pdf_shifts}`")
        lines.append("")
        lines.append("| # | QDPX page | Qualia page | Shift | Status | Coverage | Coverage class | Ratio | Range | Coders N | Coders | Codes N | Codes | continued by | QDPX name | Trecho esperado no Qualia | Texto coberto pela text layer |")
        lines.append("|---:|---:|---:|---|---|---|---|---:|---|---:|---|---:|---|---|---|---|---|")
        for idx, r in enumerate(pdf_rows, 1):
            lines.append(
                "| "
                + " | ".join(
                    md_cell(v)
                    for v in [
                        idx,
                        r["qdpx_page"] if r["qdpx_page"] is not None else "",
                        r["qualia_page"] if r["qualia_page"] is not None else "",
                        r["page_shift"],
                        r["status"],
                        r["coverage_match"],
                        r["coverage_class"],
                        r["coverage_ratio"],
                        r["range"],
                        r["coder_count"],
                        r["coders"],
                        r["code_count"],
                        r["codes"],
                        r["continued_by"],
                        r["qdpx_name"] if text_limit is None else clip(r["qdpx_name"], 120),
                        r["expected_text"] if text_limit is None else clip(r["expected_text"], text_limit),
                        r["covered_text"] if text_limit is None else clip(r["covered_text"], text_limit),
                    ]
                )
                + " |"
            )
        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {output_path} ({total} rows)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qdpx", type=Path, default=DEFAULT_QDPX)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--coverage", type=Path, default=DEFAULT_COVERAGE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--text-limit", type=int, default=240)
    parser.add_argument("--full-text", action="store_true")
    args = parser.parse_args()
    generate_report(args.qdpx, args.data, args.coverage, args.output, None if args.full_text else args.text_limit)


if __name__ == "__main__":
    main()
