---
version: 13
date: 2024-10-16
type: docs-only
description: "HTML span experiment: coded-text class test"
---

# v13 — HTML span experiment: coded-text class test

## O que e

Teste de conceito HTML — validacao do approach `coded-text` usando `<span>` com classe e `data-code` attribute. Sem codigo novo de plugin, apenas uma nota de vault testando se spans HTML inline funcionam no Obsidian.

## Como verificar

1. Abrir `_historico/coded-span-html-test.md` no modo reading view
2. Verificar que o span HTML aparece renderizado (sem tags visiveis)
3. Inspecionar elemento no DevTools — deve ter classe `coded-text` e atributo `data-code="ma"`

## Conteudo do teste

```html
<span class="coded-text ma" data-code="ma">TESTESTESTE</span>
```

Approach que seria expandido nas versoes seguintes para highlight de trechos codificados.
