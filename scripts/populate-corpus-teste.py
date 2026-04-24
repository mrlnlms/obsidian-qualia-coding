#!/usr/bin/env python3
"""
Populate data.json with a rich synthetic codebook + markers for the corpus-teste-ia folder.

Creates (preserving any existing data):
  - 2 parent codes + 8 leaf codes (hierarchy)
  - 1 code with magnitude config (ordinal)
  - 2 code-level relations (parent-of, opposite-of)
  - ~33 markdown markers in P01.md..P10.md
  - Memos on ~6 markers
  - 1 segment-level relation
  - Case variables on all 10 files (cargo, experiencia_anos, area)

Creates a timestamped backup before writing.

Run only when Obsidian is CLOSED on this vault (otherwise in-memory state overwrites changes).
"""

import json
import random
import shutil
import time
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent
DATA_JSON = PLUGIN_DIR / 'data.json'
VAULT_ROOT = PLUGIN_DIR.parents[2]  # .../obsidian-plugins-workbench
CORPUS_DIR = VAULT_ROOT / 'corpus-teste-ia'

# Parent (group) codes
PARENT_CODES = [
    ('Experiencias', '#6c757d'),
    ('Impactos', '#495057'),
]

# Leaf codes: (name, color, parent_name)
LEAF_CODES = [
    ('resistencia',   '#e63946', 'Experiencias'),
    ('adocao',        '#06a77d', 'Experiencias'),
    ('frustacao',     '#f4a261', 'Experiencias'),
    ('produtividade', '#4361ee', 'Impactos'),
    ('aprendizado',   '#9d4edd', 'Impactos'),
    ('colaboracao',   '#00b4d8', 'Impactos'),
    ('criatividade',  '#ff006e', 'Impactos'),
    ('etica',         '#ffba08', 'Impactos'),
]

# Code that gets a magnitude config
MAGNITUDE_CODE = 'resistencia'
MAGNITUDE_CONFIG = {
    'type': 'ordinal',
    'values': ['baixa', 'media', 'alta'],
}

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

# Magnitude values applied to specific (file, section index) when the code is `resistencia`
MAGNITUDE_APPLICATIONS = {
    ('P01.md', 0): 'alta',
    ('P02.md', 0): 'alta',
    ('P03.md', 0): 'media',
    ('P04.md', 0): 'baixa',
    ('P05.md', 2): 'media',
}

# Memos to sprinkle on (file, section_index)
MEMOS = {
    ('P01.md', 0): 'Participante muito enfática sobre bloqueios iniciais.',
    ('P02.md', 1): 'Vincula frustração com deadline apertado do sprint.',
    ('P05.md', 0): 'Menciona sensação de burnout ao final da sprint.',
    ('P06.md', 2): 'Exemplo concreto de insight a partir de ferramenta nova.',
    ('P08.md', 3): 'Traz preocupação ética sobre uso de LLMs em dados sensíveis.',
    ('P10.md', 0): 'Ponto de virada: aprendizado viabilizou adoção.',
}

# Application-level relation: ('P01.md' marker at section 0) → similar-to → ('P05.md' marker at section 2)
APP_RELATION = {
    'origin_file': 'P01.md',
    'origin_section_idx': 0,
    'target_file': 'P05.md',
    'target_section_idx': 2,
    'label': 'similar-to',
    'directed': False,
}

# Case variables — applied to each P0N.md file
CASE_VARIABLES = {
    # (varName, type)
    'types': {
        'cargo': 'text',
        'experiencia_anos': 'number',
        'area': 'text',
    },
    # Per-file values
    'values': {
        'P01.md': {'cargo': 'Engenheira',      'experiencia_anos': 8,  'area': 'Backend'},
        'P02.md': {'cargo': 'Designer',        'experiencia_anos': 3,  'area': 'Product'},
        'P03.md': {'cargo': 'PM',              'experiencia_anos': 5,  'area': 'Growth'},
        'P04.md': {'cargo': 'Pesquisadora',    'experiencia_anos': 12, 'area': 'UX'},
        'P05.md': {'cargo': 'Engenheiro',      'experiencia_anos': 2,  'area': 'Backend'},
        'P06.md': {'cargo': 'Designer',        'experiencia_anos': 7,  'area': 'Design'},
        'P07.md': {'cargo': 'Tech Lead',       'experiencia_anos': 10, 'area': 'Backend'},
        'P08.md': {'cargo': 'PM',              'experiencia_anos': 4,  'area': 'Platform'},
        'P09.md': {'cargo': 'Designer',        'experiencia_anos': 6,  'area': 'Design'},
        'P10.md': {'cargo': 'Analista',        'experiencia_anos': 1,  'area': 'Data'},
    },
}


def next_code_id(existing_defs):
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
    text = md_path.read_text(encoding='utf-8')
    lines = text.split('\n')
    sections = []
    for i, line in enumerate(lines):
        if line.startswith('## '):
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            if j < len(lines):
                sections.append((j, lines[j]))
    return sections


def ensure_code(defs, root_order, name, color, parent_id, next_palette, log):
    """Create code if not present (by name); return (id, next_palette)."""
    existing = next((cid for cid, d in defs.items() if d.get('name') == name), None)
    if existing:
        log.append(f'  code "{name}" already exists as {existing} — reusing')
        # Ensure parent is set if provided and missing
        if parent_id and not defs[existing].get('parentId'):
            defs[existing]['parentId'] = parent_id
            # Remove from root_order (it lives under parent now)
            if existing in root_order:
                root_order.remove(existing)
            # Register in parent's childrenOrder
            if parent_id in defs and existing not in defs[parent_id].setdefault('childrenOrder', []):
                defs[parent_id]['childrenOrder'].append(existing)
        return existing, next_palette

    cid, _ = next_code_id(defs)
    now = int(time.time() * 1000)
    entry = {
        'id': cid,
        'name': name,
        'color': color,
        'paletteIndex': next_palette,
        'createdAt': now,
        'updatedAt': now,
        'childrenOrder': [],
    }
    if parent_id:
        entry['parentId'] = parent_id
    defs[cid] = entry
    if parent_id and parent_id in defs:
        defs[parent_id].setdefault('childrenOrder', []).append(cid)
    else:
        root_order.append(cid)
    log.append(f'  ✓ code "{name}" → {cid} ({color})' + (f' [parent={parent_id}]' if parent_id else ''))
    return cid, next_palette + 1


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

    case_vars_section = data.setdefault('caseVariables', {'values': {}, 'types': {}})
    case_vars_section.setdefault('values', {})
    case_vars_section.setdefault('types', {})

    log = []

    # ── 1. Parent codes ─────────────────────────────────────────────────
    parent_ids = {}
    for name, color in PARENT_CODES:
        cid, next_palette = ensure_code(defs, root_order, name, color, None, next_palette, log)
        parent_ids[name] = cid

    # ── 2. Leaf codes ───────────────────────────────────────────────────
    code_name_to_id = {}
    for name, color, parent_name in LEAF_CODES:
        parent_id = parent_ids[parent_name]
        cid, next_palette = ensure_code(defs, root_order, name, color, parent_id, next_palette, log)
        code_name_to_id[name] = cid

    registry['nextPaletteIndex'] = next_palette

    # ── 3. Magnitude config on one code ─────────────────────────────────
    if MAGNITUDE_CODE in code_name_to_id:
        defs[code_name_to_id[MAGNITUDE_CODE]]['magnitude'] = MAGNITUDE_CONFIG
        log.append(f'  ✓ magnitude config on "{MAGNITUDE_CODE}": {MAGNITUDE_CONFIG["type"]}')

    # ── 4. Code-level relations ─────────────────────────────────────────
    # resistencia → opposite-of → adocao; frustacao → similar-to → resistencia
    if 'resistencia' in code_name_to_id and 'adocao' in code_name_to_id:
        d = defs[code_name_to_id['resistencia']]
        rels = d.setdefault('relations', [])
        if not any(r.get('label') == 'opposite-of' and r.get('target') == code_name_to_id['adocao'] for r in rels):
            rels.append({
                'label': 'opposite-of',
                'target': code_name_to_id['adocao'],
                'directed': False,
            })
            log.append('  ✓ code relation: resistencia ↔ adocao (opposite-of)')

    if 'frustacao' in code_name_to_id and 'resistencia' in code_name_to_id:
        d = defs[code_name_to_id['frustacao']]
        rels = d.setdefault('relations', [])
        if not any(r.get('label') == 'similar-to' and r.get('target') == code_name_to_id['resistencia'] for r in rels):
            rels.append({
                'label': 'similar-to',
                'target': code_name_to_id['resistencia'],
                'directed': False,
            })
            log.append('  ✓ code relation: frustacao ↔ resistencia (similar-to)')

    # ── 5. Markers ──────────────────────────────────────────────────────
    next_mid = next_marker_id(markers_by_file)
    added_markers = 0
    skipped_files = []
    marker_ref_by_slot = {}  # (fname, section_idx) → marker_id (for later app-relation wiring)

    for fname, section_codes in CODING_MAP.items():
        md_path = CORPUS_DIR / fname
        if not md_path.exists():
            skipped_files.append(fname)
            continue

        file_id = f'corpus-teste-ia/{fname}'
        sections = find_section_paragraphs(md_path)
        if len(sections) < len(section_codes):
            log.append(f'  ⚠ {fname}: expected {len(section_codes)} sections, found {len(sections)} — skipping')
            continue

        # Reset file markers (idempotency)
        markers_by_file[file_id] = []
        file_markers = markers_by_file[file_id]
        now = int(time.time() * 1000)

        for idx, code_name in enumerate(section_codes):
            line_idx, paragraph = sections[idx]
            code_id = code_name_to_id[code_name]

            # codes[] entry
            code_app = {'codeId': code_id}
            if code_name == MAGNITUDE_CODE and (fname, idx) in MAGNITUDE_APPLICATIONS:
                code_app['magnitude'] = MAGNITUDE_APPLICATIONS[(fname, idx)]

            marker = {
                'markerType': 'markdown',
                'id': f'm_{next_mid:03d}',
                'fileId': file_id,
                'range': {
                    'from': {'line': line_idx, 'ch': 0},
                    'to': {'line': line_idx, 'ch': len(paragraph)},
                },
                'color': defs[code_id]['color'],
                'codes': [code_app],
                'text': paragraph[:120],
                'createdAt': now,
                'updatedAt': now,
            }
            # Optional memo
            if (fname, idx) in MEMOS:
                marker['memo'] = MEMOS[(fname, idx)]

            file_markers.append(marker)
            marker_ref_by_slot[(fname, idx)] = marker['id']
            next_mid += 1
            added_markers += 1

        log.append(f'  ✓ {fname}: {len(section_codes)} markers')

    if skipped_files:
        log.append(f'  ⚠ skipped (not found): {skipped_files}')

    # ── 6. Application-level relation ───────────────────────────────────
    origin_key = (APP_RELATION['origin_file'], APP_RELATION['origin_section_idx'])
    target_key = (APP_RELATION['target_file'], APP_RELATION['target_section_idx'])
    origin_mid = marker_ref_by_slot.get(origin_key)
    target_mid = marker_ref_by_slot.get(target_key)
    if origin_mid and target_mid:
        # Attach to the origin marker's first code application
        origin_file_id = f'corpus-teste-ia/{APP_RELATION["origin_file"]}'
        for m in markers_by_file.get(origin_file_id, []):
            if m['id'] == origin_mid and m.get('codes'):
                app = m['codes'][0]
                rels = app.setdefault('relations', [])
                # Target is the code applied on the target marker (cross-code relation)
                target_file_id = f'corpus-teste-ia/{APP_RELATION["target_file"]}'
                target_code_id = None
                for tm in markers_by_file.get(target_file_id, []):
                    if tm['id'] == target_mid and tm.get('codes'):
                        target_code_id = tm['codes'][0]['codeId']
                        break
                if target_code_id:
                    rels.append({
                        'label': APP_RELATION['label'],
                        'target': target_code_id,
                        'directed': APP_RELATION['directed'],
                    })
                    log.append(f'  ✓ app relation on {origin_mid}: {APP_RELATION["label"]} → {target_code_id}')
                break

    # ── 7. Case variables ───────────────────────────────────────────────
    case_vars_section['types'].update(CASE_VARIABLES['types'])
    for fname, vars_dict in CASE_VARIABLES['values'].items():
        file_id = f'corpus-teste-ia/{fname}'
        case_vars_section['values'][file_id] = dict(vars_dict)
    log.append(f'  ✓ case variables on {len(CASE_VARIABLES["values"])} files '
               f'({", ".join(CASE_VARIABLES["types"].keys())})')

    # ── 8. Write ────────────────────────────────────────────────────────
    with DATA_JSON.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent='\t', ensure_ascii=False)

    # Print log
    print()
    for line in log:
        print(line)
    print()
    print(f'✅ Done')
    print(f'  Codes:   {len(defs)} total ({len(PARENT_CODES)} parents + {len(LEAF_CODES)} leafs)')
    print(f'  Markers: {added_markers} markdown (added this run)')
    print(f'  Case vars: {len(case_vars_section["values"])} files × {len(case_vars_section["types"])} vars')
    print(f'  Restore: cp "{backup}" "{DATA_JSON}"')
    return 0


if __name__ == '__main__':
    exit(main())
