---
version: 12
plugin: management-codes
date: 2024-07-16
---

# v12 — Code management: CSV view + file operations

## What's new
- Complete rewrite: plugin renomeado de Editor Playground para Management Codes
- CSV sidebar view (ItemView) que lista itens de items.csv na right leaf
- Ribbon icon (file-plus) abre InputModal para adicionar itens
- File operations com Node.js fs/promises (readFile, writeFile, appendFile)
- Auto-open da CSV view na sidebar ao carregar plugin

## How to verify
1. Console: `[Management Codes] v12 loaded -- Code management: CSV view + file operations`
2. Ribbon icon "Add Item" (file-plus) deve aparecer na sidebar esquerda
3. CSV Items view deve abrir automaticamente na sidebar direita
4. Clicar no ribbon icon abre modal para adicionar item ao CSV

## Demo content
- `_demo-notes/items.csv` — arquivo CSV de exemplo para a view
