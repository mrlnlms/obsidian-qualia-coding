# Plano: statsEngine.ts split (951 LOC → 6 modulos)

## Context

Fases 1-3 concluidas (57 testes novos, 1157 total). Fase 4: split mecanico do statsEngine.ts em 6 modulos por tipo de computacao. Zero breaking changes — barrel re-export no statsEngine.ts original.

## Split

| Novo arquivo | Funcoes | Shared helpers |
|-------------|---------|----------------|
| `frequency.ts` | calculateFrequency, calculateSourceComparison, calculateDocumentCodeMatrix | applyFilters |
| `cooccurrence.ts` | calculateCooccurrence, calculateOverlap | applyFilters, markerHasPosition, markerToRange, rangesOverlap |
| `evolution.ts` | calculateEvolution, calculateTemporal | applyFilters |
| `sequential.ts` | calculateLagSequential, calculatePolarCoordinates | applyFilters, getMarkerPosition |
| `inferential.ts` | calculateChiSquare | applyFilters, normalCDF, chiSquareSurvival |
| `textAnalysis.ts` | calculateTextStats | nenhum (independente) |

`applyFilters` vai para um `statsHelpers.ts` compartilhado. Cada modulo importa de la.

## statsEngine.ts vira barrel

```typescript
export { calculateFrequency, calculateSourceComparison, calculateDocumentCodeMatrix } from './frequency';
export { calculateCooccurrence, calculateOverlap } from './cooccurrence';
export { calculateEvolution, calculateTemporal } from './evolution';
export { calculateLagSequential, calculatePolarCoordinates } from './sequential';
export { calculateChiSquare } from './inferential';
export { calculateTextStats } from './textAnalysis';
```

Consumers (modes, testes, analyticsView) nao precisam mudar nada.

## Verificacao

1. `npm run build` — zero erros tsc
2. `npm run test` — 1157 testes passam
3. Nenhum import direto quebrado (barrel preserva)
