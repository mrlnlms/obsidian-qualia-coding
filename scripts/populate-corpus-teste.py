#!/usr/bin/env python3
"""
Populate data.json with 8 codes and 33 markers for the corpus-teste-ia folder.
Preserves all existing data. Creates a timestamped backup before writing.

Run only when Obsidian is CLOSED (otherwise in-memory state overwrites changes).
"""

import json
import shutil
import time
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent
DATA_JSON = PLUGIN_DIR / 'data.json'
VAULT_ROOT = PLUGIN_DIR.parents[2]  # .../obsidian-plugins-workbench
CORPUS_DIR = VAULT_ROOT / 'obsidian-qualia-coding' / 'corpus-teste-ia'

# Code definitions to add (name → color hex)
CODES = [
    ('resistencia', '#e63946'),
    ('adocao', '#06a77d'),
    ('produtividade', '#4361ee'),
    ('aprendizado', '#9d4edd'),
    ('frustacao', '#f4a261'),
    ('colaboracao', '#00b4d8'),
    ('criatividade', '#ff006e'),
    ('etica', '#ffba08'),
]

# Per-file section → code mapping (section index = 0-based, matches order of ## headings)
CODING_MAP = {
    'P01.md': ['resistencia', 'frustacao', 'aprendizado', 'etica'],
    'P02.md': ['resistencia', 'frustacao', 'produtividade'],
    'P03.md': ['resistencia', 'colaboracao', 'frustacao'],
    'P04.md': ['resistencia', 'etica', 'criatividade'],
    'P05.md': ['frustacao', 'aprendizado', 'resistencia'],
    'P06.md': ['adocao', 'criatividade', 'aprendizado', 'etica'],
    'P07.md': ['adocao', 'produtividade', 'colaboracao'],
    'P08.md': ['adocao', 'produtividade', 'colaboracao', 'etica'],
    'P09.md': ['adocao', 'criatividade', 'produtividade'],
    'P10.md': ['aprendizado', 'adocao', 'produtividade'],
}


def next_code_id(existing_defs):
    """Return a fresh 'c_NN' id not in use."""
    used = set()
    for k in existing_defs.keys():
        if k.startswith('c_'):
            try:
                used.add(int(k[2:]))
            except ValueError:
                pass
    n = max(used, default=0) + 1
    return f'c_{n:02d}', n


def next_marker_id(existing_markers_all):
    used = set()
    for markers in existing_markers_all.values():
        for m in markers:
            mid = m.get('id', '')
            if mid.startswith('m_'):
                try:
                    used.add(int(mid[2:]))
                except ValueError:
                    pass
    return max(used, default=0) + 1


def find_section_paragraphs(md_path):
    """Parse markdown and return list of (line_idx, text) for each '## Section' paragraph."""
    text = md_path.read_text(encoding='utf-8')
    lines = text.split('\n')
    sections = []
    for i, line in enumerate(lines):
        if line.startswith('## '):
            # Paragraph is the next non-empty line
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            if j < len(lines):
                sections.append((j, lines[j]))
    return sections


def main():
    if not DATA_JSON.exists():
        print(f'ERROR: {DATA_JSON} not found')
        return 1

    # Backup
    ts = time.strftime('%Y%m%d-%H%M%S')
    backup = DATA_JSON.with_suffix(f'.json.backup-{ts}')
    shutil.copy2(DATA_JSON, backup)
    print(f'✓ backup: {backup.name}')

    with DATA_JSON.open('r', encoding='utf-8') as f:
        data = json.load(f)

    registry = data.setdefault('registry', {})
    defs = registry.setdefault('definitions', {})
    root_order = registry.setdefault('rootOrder', [])
    next_palette = registry.get('nextPaletteIndex', 0)

    markdown = data.setdefault('markdown', {})
    markers_by_file = markdown.setdefault('markers', {})

    # ── 1. Add codes ─────────────────────────────────────────────────────
    code_name_to_id = {}
    for name, color in CODES:
        # Skip if a code with this name already exists
        existing = next((cid for cid, d in defs.items() if d.get('name') == name), None)
        if existing:
            code_name_to_id[name] = existing
            print(f'  code "{name}" already exists as {existing} — reusing')
            continue
        cid, _num = next_code_id(defs)
        now = int(time.time() * 1000)
        defs[cid] = {
            'id': cid,
            'name': name,
            'color': color,
            'paletteIndex': next_palette,
            'createdAt': now,
            'updatedAt': now,
            'childrenOrder': [],
        }
        next_palette += 1
        root_order.append(cid)
        code_name_to_id[name] = cid
        print(f'  ✓ code "{name}" → {cid} ({color})')

    registry['nextPaletteIndex'] = next_palette

    # ── 2. Add markers ───────────────────────────────────────────────────
    next_mid = next_marker_id(markers_by_file)
    added_markers = 0
    skipped_files = []

    for fname, section_codes in CODING_MAP.items():
        md_path = CORPUS_DIR / fname
        if not md_path.exists():
            skipped_files.append(fname)
            continue

        file_id = f'obsidian-qualia-coding/corpus-teste-ia/{fname}'
        sections = find_section_paragraphs(md_path)
        if len(sections) < len(section_codes):
            print(f'  ⚠ {fname}: expected {len(section_codes)} sections, found {len(sections)} — skipping')
            continue

        file_markers = markers_by_file.setdefault(file_id, [])
        now = int(time.time() * 1000)

        for idx, code_name in enumerate(section_codes):
            line_idx, paragraph = sections[idx]
            code_id = code_name_to_id[code_name]
            marker = {
                'markerType': 'markdown',
                'id': f'm_{next_mid:03d}',
                'fileId': file_id,
                'range': {
                    'from': {'line': line_idx, 'ch': 0},
                    'to': {'line': line_idx, 'ch': len(paragraph)},
                },
                'color': defs[code_id]['color'],
                'codes': [{'codeId': code_id}],
                'text': paragraph[:120],
                'createdAt': now,
                'updatedAt': now,
            }
            file_markers.append(marker)
            next_mid += 1
            added_markers += 1

        print(f'  ✓ {fname}: {len(section_codes)} markers')

    if skipped_files:
        print(f'  ⚠ skipped (not found): {skipped_files}')

    # ── 3. Write ─────────────────────────────────────────────────────────
    with DATA_JSON.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent='\t', ensure_ascii=False)

    print()
    print(f'✅ Done — {added_markers} markers added across {len(CODING_MAP) - len(skipped_files)} files')
    print(f'   Restore: cp "{backup}" "{DATA_JSON}"')
    return 0


if __name__ == '__main__':
    exit(main())
