# Performance Benchmark — Analytics Engine (2026-03-17)

Benchmark das 15 funções de cálculo do analytics com dados sintéticos em 4 escalas. Rodado via Vitest em jsdom (sem rendering, só cálculo puro). Arquivo de teste: `tests/analytics/performanceBenchmark.test.ts`.

## Escalas testadas

| Escala | Markers | Códigos | Arquivos |
|--------|---------|---------|----------|
| Small  | 100     | 10      | 10       |
| Medium | 500     | 20      | 30       |
| Large  | 1.000   | 30      | 50       |
| XL     | 5.000   | 50      | 100      |

## Resultados

### Small (100 markers)

| Função | Tempo |
|--------|-------|
| frequency | 0.3ms |
| cooccurrence | 7.4ms |
| docMatrix | 0.4ms |
| evolution | 0.4ms |
| temporal | 0.3ms |
| textStats | 0.6ms |
| lagSequential | 0.5ms |
| polarCoords | 0.7ms |
| chiSquare | 0.4ms |
| sourceComparison | 0.3ms |
| overlap | 0.6ms |
| MCA | 5.2ms |
| MDS | 0.8ms |
| decisionTree | 0.9ms |
| cluster | 0.3ms |

### Medium (500 markers) — cenário realista de uso

| Função | Tempo |
|--------|-------|
| frequency | 0.4ms |
| cooccurrence | 1.7ms |
| docMatrix | 0.3ms |
| evolution | 0.5ms |
| temporal | 0.2ms |
| textStats | 1.7ms |
| lagSequential | 0.5ms |
| polarCoords | 2.2ms |
| chiSquare | 0.6ms |
| sourceComparison | 0.2ms |
| overlap | 0.6ms |
| **MCA** | **35.9ms** |
| MDS | 1.2ms |
| decisionTree | 2.5ms |
| cluster | 0.2ms |

### Large (1.000 markers)

| Função | Tempo |
|--------|-------|
| frequency | 0.6ms |
| cooccurrence | 0.7ms |
| docMatrix | 0.6ms |
| evolution | 0.9ms |
| temporal | 0.4ms |
| textStats | 3.8ms |
| lagSequential | 0.3ms |
| polarCoords | 1.1ms |
| chiSquare | 1.5ms |
| sourceComparison | 0.4ms |
| overlap | 1.2ms |
| **MCA** | **11.8ms** |
| MDS | 1.3ms |
| decisionTree | 2.6ms |
| cluster | 0.3ms |

### XL (5.000 markers)

| Função | Tempo | Flag |
|--------|-------|------|
| frequency | 2.9ms | |
| cooccurrence | 0.9ms | |
| docMatrix | 2.9ms | |
| evolution | 4.4ms | |
| temporal | 1.7ms | |
| textStats | 13.8ms | |
| lagSequential | 1.3ms | |
| polarCoords | 5.2ms | |
| chiSquare | 4.1ms | |
| sourceComparison | 2.5ms | |
| overlap | 10.2ms | |
| **MCA** | **165.9ms** | ⚠️ único hotspot |
| MDS | 9.2ms | |
| decisionTree | 29.6ms | |
| cluster | 1.7ms | |

## Análise

### Tudo OK até 5.000 markers

- 14 de 15 funções ficam abaixo de 30ms mesmo com 5.000 markers
- A maioria escala linearmente — sem surpresas

### Único hotspot: MCA (Multiple Correspondence Analysis)

- 500 markers: 36ms (imperceptível)
- 5.000 markers: 166ms (perceptível mas aceitável)
- Causa: decomposição SVD (Singular Value Decomposition) — algoritmicamente O(n²) a O(n³) dependendo da matriz
- Localizado em `src/analytics/data/mcaEngine.ts`
- **Ação futura se necessário**: limitar o número de markers passados ao MCA (sampling) ou cachear o resultado por filtro

### textStats e decisionTree em escala XL

- textStats: 14ms com 5.000 — escala linear, sem preocupação
- decisionTree: 30ms com 5.000 — CHAID com 50 códigos preditores, aceitável

## Como reproduzir

```bash
npx vitest run tests/analytics/performanceBenchmark.test.ts --reporter=verbose
```

Os tempos variam por máquina. Os valores acima foram medidos em Apple Silicon (M-series). Em máquinas mais lentas os números serão maiores, mas as proporções relativas se mantêm.

## Nota sobre o benchmark como teste

O benchmark atual usa threshold generoso (2s) e loga resultados — serve como **observabilidade**, não como proteção dura contra regressão. Se uma mudança dobrar o tempo de uma função, o teste ainda passa. Quando o plugin tiver uso real com vaults grandes, calibrar os asserts para orçamentos mais apertados (ex: <50ms para 500 markers) e transformar em proteção de regressão efetiva.

## Conclusão

O analytics engine está pronto para vaults com centenas a milhares de markers. O único ponto de atenção é o MCA, que deve ser monitorado se o vault crescer além de 5.000 markers codificados. O próximo passo não é otimizar — é instrumentar uso real e só atacar o MCA se aparecer como gargalo no fluxo de usuários.
