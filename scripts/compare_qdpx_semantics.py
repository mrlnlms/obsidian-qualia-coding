#!/usr/bin/env python3
"""Compare two QDPX packages by QDA semantics rather than ZIP/XML ordering."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].rsplit(":", 1)[-1]


def children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element if local_name(child.tag) == name]


def descendants(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element.iter() if local_name(child.tag) == name]


def normalized_text(value: str) -> str:
    return " ".join(value.split())


def internal_member(path: str | None) -> str | None:
    if not path or not path.startswith("internal://"):
        return None
    member = path[len("internal://") :]
    return member if member.startswith("sources/") else f"sources/{member}"


def counter_rows(counter: Counter[tuple[Any, ...]]) -> list[dict[str, Any]]:
    return [
        {"value": list(value), "count": count}
        for value, count in sorted(counter.items(), key=lambda item: repr(item[0]))
        if count
    ]


@dataclass
class Package:
    path: Path
    root: ET.Element
    members: dict[str, bytes]

    @classmethod
    def read(cls, path: Path) -> "Package":
        if not path.is_file():
            raise ValueError(f"QDPX file not found: {path}")
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            qde_names = [name for name in names if name.lower().endswith(".qde")]
            if len(qde_names) != 1:
                raise ValueError(f"{path}: expected exactly one .qde, found {len(qde_names)}")
            members = {name: archive.read(name) for name in names}
        try:
            root = ET.fromstring(members[qde_names[0]])
        except ET.ParseError as error:
            raise ValueError(f"{path}: invalid project XML: {error}") from error
        return cls(path=path, root=root, members=members)


def note_texts(package: Package) -> dict[str, str]:
    result: dict[str, str] = {}
    for note in descendants(package.root, "Note"):
        guid = note.get("guid")
        if not guid:
            continue
        content = next(iter(descendants(note, "PlainTextContent")), None)
        result[guid] = normalized_text("".join(content.itertext())) if content is not None else ""
    return result


def users(package: Package) -> tuple[dict[str, str], Counter[tuple[Any, ...]]]:
    names = {
        user.get("guid", ""): user.get("name", "")
        for user in descendants(package.root, "User")
        if user.get("guid")
    }
    referenced = Counter()
    for coding in descendants(package.root, "Coding"):
        guid = coding.get("creatingUser")
        if guid:
            referenced[(names.get(guid, f"<missing:{guid}>"),)] += 1
    participants = Counter({key: 1 for key in referenced})
    return names, participants


def codebook(package: Package) -> tuple[dict[str, str], Counter[tuple[Any, ...]]]:
    code_paths: dict[str, str] = {}
    rows: Counter[tuple[Any, ...]] = Counter()

    def visit(code: ET.Element, parents: tuple[str, ...]) -> None:
        name = code.get("name", "")
        path = " / ".join((*parents, name))
        guid = code.get("guid")
        if guid:
            code_paths[guid] = path
        rows[(path, code.get("color", ""))] += 1
        for child_container in children(code, "Codes"):
            for child in children(child_container, "Code"):
                visit(child, (*parents, name))

    for codebook_element in descendants(package.root, "CodeBook"):
        for container in children(codebook_element, "Codes"):
            for code in children(container, "Code"):
                visit(code, ())
    return code_paths, rows


def source_binary_hash(package: Package, source: ET.Element) -> str | None:
    member = internal_member(source.get("path"))
    if not member:
        return None
    payload = package.members.get(member)
    return hashlib.sha256(payload).hexdigest() if payload is not None else f"<missing:{member}>"


def representation_text(package: Package, representation: ET.Element) -> str:
    member = internal_member(representation.get("plainTextPath"))
    if not member:
        return ""
    payload = package.members.get(member)
    return payload.decode("utf-8") if payload is not None else ""


def selection_note(selection: ET.Element, notes: dict[str, str]) -> str:
    values = [
        notes.get(ref.get("targetGUID", ""), "")
        for ref in children(selection, "NoteRef")
    ]
    return " | ".join(value for value in values if value and not value.startswith("[Magnitude:"))


def coding_magnitude(coding: ET.Element, notes: dict[str, str]) -> str:
    for ref in children(coding, "NoteRef"):
        value = notes.get(ref.get("targetGUID", ""), "")
        match = re.fullmatch(r"\[Magnitude:\s*(.+?)\]", value)
        if match:
            return match.group(1)
    return ""


def canonicalize(package: Package) -> dict[str, Any]:
    user_names, participant_rows = users(package)
    code_paths, code_rows = codebook(package)
    notes = note_texts(package)
    links = descendants(package.root, "Link")

    source_rows: Counter[tuple[Any, ...]] = Counter()
    logical_rows: Counter[tuple[Any, ...]] = Counter()
    fragment_rows: Counter[tuple[Any, ...]] = Counter()
    coding_rows: Counter[tuple[Any, ...]] = Counter()
    relation_rows: Counter[tuple[Any, ...]] = Counter()
    bbox_by_logical: dict[str, list[list[float]]] = {}
    selection_semantics: dict[str, tuple[Any, ...]] = {}

    sources_parent = next(iter(descendants(package.root, "Sources")), None)
    source_elements = list(sources_parent) if sources_parent is not None else []
    for source in source_elements:
        source_type = local_name(source.tag)
        source_name = source.get("name", "")
        source_rows[(source_type, source_name, source_binary_hash(package, source))] += 1
        if source_type != "PDFSource":
            continue

        representations = children(source, "Representation")
        representation = representations[0] if representations else None
        text = representation_text(package, representation) if representation is not None else ""
        plain_selections = children(representation, "PlainTextSelection") if representation is not None else []
        plain_by_guid = {selection.get("guid", ""): selection for selection in plain_selections if selection.get("guid")}
        pdf_selections = children(source, "PDFSelection")
        pdf_by_guid = {selection.get("guid", ""): selection for selection in pdf_selections if selection.get("guid")}
        groups_by_key: dict[tuple[Any, ...], list[ET.Element]] = {}
        for selection in pdf_selections:
            coding_signature = tuple(sorted(
                (
                    coding.get("creatingUser", ""),
                    next(iter(children(coding, "CodeRef")), ET.Element("missing")).get("targetGUID", ""),
                )
                for coding in children(selection, "Coding")
            ))
            key = (
                normalized_text(selection.get("name", "")).casefold(),
                selection.get("creationDateTime", ""),
                coding_signature,
            )
            if key[0] and key[1] and selection.get("page") is not None:
                groups_by_key.setdefault(key, []).append(selection)

        multipage_by_anchor: dict[str, list[str]] = {}
        for candidates in groups_by_key.values():
            ordered = sorted(candidates, key=lambda selection: int(selection.get("page", "0")))
            run: list[ET.Element] = []
            for selection in ordered:
                if run and int(selection.get("page", "0")) != int(run[-1].get("page", "0")) + 1:
                    run = []
                run.append(selection)
                if len(run) < 2:
                    continue
                anchors = [fragment for fragment in run if fragment.get("guid", "") in plain_by_guid]
                if len(anchors) == 1:
                    anchor_guid = anchors[0].get("guid", "")
                    multipage_by_anchor[anchor_guid] = [fragment.get("guid", "") for fragment in run]

        for fragment in pdf_selections:
            fragment_rows[(
                source_name,
                normalized_text(fragment.get("name", "")),
                int(fragment.get("page", "0")),
            )] += 1

        for plain in plain_selections:
            guid = plain.get("guid", "")
            start = int(plain.get("startPosition", "0"))
            end = int(plain.get("endPosition", "0"))
            selected = normalized_text(text[start:end])
            fragment_guids = multipage_by_anchor.get(guid, [guid] if guid in pdf_by_guid else [])
            pages = tuple(int(pdf_by_guid[item].get("page", "0")) for item in fragment_guids)
            logical = (source_name, selected, pages, selection_note(plain, notes))
            logical_rows[logical] += 1
            selection_semantics[guid] = logical
            bbox_key = json.dumps(logical, ensure_ascii=False, sort_keys=True)
            bbox_by_logical.setdefault(bbox_key, [])

            for fragment_guid in fragment_guids:
                fragment = pdf_by_guid[fragment_guid]
                selection_semantics[fragment_guid] = logical
                bbox = [
                    float(fragment.get("firstX", "0")),
                    float(fragment.get("firstY", "0")),
                    float(fragment.get("secondX", "0")),
                    float(fragment.get("secondY", "0")),
                ]
                bbox_by_logical[bbox_key].append(bbox)
            for coding in children(plain, "Coding"):
                code_ref = next(iter(children(coding, "CodeRef")), None)
                code = code_paths.get(code_ref.get("targetGUID", ""), "<missing-code>") if code_ref is not None else "<missing-code>"
                author_guid = coding.get("creatingUser")
                author = user_names.get(author_guid, f"<missing:{author_guid}>") if author_guid else "<unattributed>"
                coding_rows[(*logical, author, code, coding_magnitude(coding, notes))] += 1

    for link in links:
        origin_guid = link.get("originGUID", "")
        target_guid = link.get("targetGUID", "")
        origin: Any = selection_semantics.get(origin_guid, code_paths.get(origin_guid, f"<missing:{origin_guid}>"))
        target: Any = selection_semantics.get(target_guid, code_paths.get(target_guid, f"<missing:{target_guid}>"))
        memo = next(iter(children(link, "MemoText")), None)
        relation_rows[(
            link.get("name", ""),
            link.get("direction", ""),
            json.dumps(origin, ensure_ascii=False),
            json.dumps(target, ensure_ascii=False),
            normalized_text("".join(memo.itertext())) if memo is not None else "",
        )] += 1

    return {
        "sources": source_rows,
        "codes": code_rows,
        "participants": participant_rows,
        "logical_selections": logical_rows,
        "pdf_fragments": fragment_rows,
        "semantic_codings": coding_rows,
        "relations": relation_rows,
        "bbox_diagnostics": bbox_by_logical,
    }


def compare(original: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    sections = [
        "sources",
        "codes",
        "participants",
        "logical_selections",
        "pdf_fragments",
        "semantic_codings",
        "relations",
    ]
    differences: dict[str, Any] = {}
    counts: dict[str, Any] = {}
    for section in sections:
        expected: Counter[tuple[Any, ...]] = original[section]
        actual: Counter[tuple[Any, ...]] = candidate[section]
        counts[section] = {"original": sum(expected.values()), "candidate": sum(actual.values())}
        missing = expected - actual
        extra = actual - expected
        if missing or extra:
            differences[section] = {
                "missing": counter_rows(missing),
                "extra": counter_rows(extra),
            }

    bbox_differences = []
    for logical in sorted(set(original["bbox_diagnostics"]) | set(candidate["bbox_diagnostics"])):
        expected = original["bbox_diagnostics"].get(logical, [])
        actual = candidate["bbox_diagnostics"].get(logical, [])
        if expected != actual:
            bbox_differences.append({"logical": json.loads(logical), "original": expected, "candidate": actual})

    return {
        "equal": not differences,
        "counts": counts,
        "differences": differences,
        "bbox_diagnostics": {
            "equal": not bbox_differences,
            "differences": bbox_differences,
            "note": "Bounding boxes are diagnostic; semantic equality is decided by the other sections.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        report = compare(canonicalize(Package.read(args.original)), canonicalize(Package.read(args.candidate)))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Invalid QDPX input: {error}", file=sys.stderr)
        return 2

    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.write_text(rendered + chr(10), encoding="utf-8")
    return 0 if report["equal"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
