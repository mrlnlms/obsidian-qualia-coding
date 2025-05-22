# CodeMarker: Plugin de Codificação Qualitativa para Obsidian

## 📋 Descrição Geral do Projeto

O **CodeMarker** é um plugin open-source para Obsidian que permite realizar **codificação qualitativa de texto** diretamente no editor, oferecendo uma alternativa gratuita e integrada a softwares proprietários como MAXQDA, Atlas.ti e NVivo.

### Características Principais

- **🎯 Marcação visual não-invasiva**: Decorações que não alteram o documento original
- **🔧 Handles redimensionáveis**: Alças interativas para ajustar precisamente as marcações
- **📱 Interface responsiva**: Adaptação automática a mudanças de fonte e zoom
- **💾 Armazenamento separado**: Metadados das marcações salvos independentemente do texto
- **🔍 Análise flexível**: Suporte a códigos sobrepostos, hierárquicos e interseccionais

### Objetivos do Projeto

1. **Democratizar a pesquisa qualitativa** <span class="coded-text kila" data-code="kila">oferecendo ferramenta</span> gratuita e poderosa
2. **Integrar análise ao workflow** aproveitando o ecossistema Obsidian existente
3. **Manter simplicidade** <span class="coded-text teste" data-code="teste">sem comprometer</span> funcionalidade avançada
4. **Preservar dados** garantindo que marcações não corrompam documentos originais

---

## 🎨 Desafios de Design

### Usabilidade e Descoberta

**Desafio**: Como tornar as marcações visualmente distintas sem poluir a interface?

**Solução**: 
- Marcações com opacity controlável (padrão 40%)
- Sistema de handles que aparecem apenas no hover (configurável)
- Feedback visual instantâneo durante interações
- Cores personalizáveis para diferentes códigos

### Responsividade Visual

**Desafio**: Manter proporções consistentes em diferentes tamanhos de fonte (12px-30px+).

**Solução**:
- Cálculos proporcionais baseados no `fontSize` atual
- Função `calculatePaddingRatio()` que ajusta dinamicamente
- Handles SVG com dimensões escaláveis
- Detecção automática de mudanças de fonte

### Gestão de Sobreposições

**Desafio**: Visualizar códigos sobrepostos sem criar confusão visual.

**Abordagem**:
- Sistema de camadas para códigos hierárquicos
- Transparência inteligente para múltiplas sobreposições
- Indicadores visuais para intersecções complexas
- Menu contextual para navegação entre códigos sobrepostos

---

## ⚙️ Desafios Técnicos

### Integração com CodeMirror 6

**Desafio**: Trabalhar com a arquitetura imutável e transacional do CM6.

**Complexidades**:
- Estado imutável requer recriação completa de decorações
- Sistema de transações para mudanças atômicas
- Mapeamento de posições através de edições de texto
- Performance em documentos grandes

### Precisão de Posicionamento

**Desafio**: Converter coordenadas de mouse em posições precisas no texto.

**Soluções**:
- `view.posAtCoords()` para mapeamento pixel→offset
- `posToOffset()` e `offsetToPos()` para conversões
- Tratamento de edge cases (fora do viewport, fim do documento)
- Validação de limites para evitar posições inválidas

### Persistência de Dados

**Desafio**: Salvar marcações sem corromper documentos originais.

**Arquitetura**:
- Armazenamento separado por arquivo (`Map<fileId, Marker[]>`)
- Serialização JSON via API do Obsidian
- Sincronização automática entre modelo e visualização
- Recovery de posições após edições de texto

---

## 🔧 Abordagem para Soluções Técnicas

### CodeMirror 6: Decorações e Estado

**Por que CodeMirror 6?**
- Arquitetura moderna e performática
- Sistema de extensões flexível
- Suporte nativo a decorações visuais
- Integração profunda com Obsidian

**Implementação**:
```typescript
// StateField para gerenciar decorações
const markerStateField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(decorations, tr) {
    // Mapear através de mudanças + aplicar efeitos
    decorations = decorations.map(tr.changes);
    // Processar StateEffects para atualizações
  }
});
```

### Sistema de Handles Interativos

**Desafio**: Criar elementos arrastáveis precisos sem interferir no texto.

**Solução - WidgetType customizado**:
```typescript
class HandleWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    // SVG responsivo com dimensões calculadas
    // Zero-width container para não afetar layout
    // Eventos de mouse para interatividade
  }
  
  ignoreEvent(event: Event): boolean {
    // Permitir eventos apenas em elementos SVG específicos
  }
}
```

**Características**:
- **Widgets SVG** para precisão visual
- **Zero-width containers** para não deslocar texto
- **Cálculos proporcionais** baseados na fonte atual
- **Event delegation** para captura precisa de interações

### Detecção Dinâmica de Mudanças de Fonte

**Problema**: Font pode mudar por Settings, zoom, CSS customizado, etc.

**Solução - Event-Driven Detection**:
```typescript
private setupFontChangeDetection(view: EditorView) {
  // 1. Zoom detection (Ctrl+scroll)
  const handleZoom = (e: WheelEvent) => {
    if (e.ctrlKey) requestAnimationFrame(() => this.checkFontChange(view));
  };
  
  // 2. Settings changes (MutationObserver)
  const mutationObserver = new MutationObserver(() => this.checkFontChange(view));
  
  // 3. Layout changes (ResizeObserver)
  const resizeObserver = new ResizeObserver(() => this.checkFontChange(view));
}
```

**Vantagens**:
- ⚡ **Reação instantânea** (0ms delay)
- 🔋 **Zero overhead** quando não há mudanças
- 🎯 **Cobertura de 99.9%** dos cenários reais
- 🧹 **Cleanup automático** dos observers

### Arquitetura de Estado

**Padrão utilizado**: Separação clara entre modelo e visualização

```typescript
// Modelo: Lógica de negócio e persistência
class CodeMarkerModel {
  private markers: Map<string, Marker[]>;
  createMarker(), updateMarker(), removeMarker()
}

// Visualização: Decorações e interações
StateField + ViewPlugin
```

---

## 🔬 Desafios de Pesquisa e Análise

### Categorização Super Flexível

**Visão**: Sistema que suporte múltiplas metodologias de análise qualitativa.

#### Códigos Hierárquicos
```
Categoria Principal
├── Subcategoria A
│   ├── Código específico 1
│   └── Código específico 2
└── Subcategoria B
    └── Código específico 3
```

#### Códigos Sobrepostos/Interseccionais
- **Código sobre código**: Camadas de análise (ex: "Emoção" + "Gênero")
- **Intersecções**: Áreas onde múltiplos códigos se sobrepõem
- **Códigos temporais**: Evolução de categorias ao longo do texto

### Estruturas de Dados para Análise

#### Modelo de Marcação Extensível
```typescript
interface Marker {
  id: string;
  fileId: string;
  range: { from: Position; to: Position };
  codes: string[]; // ✨ Múltiplos códigos por marcação
  hierarchy: string; // ✨ Caminho hierárquico (ex: "main.sub.specific")
  properties: Record<string, any>; // ✨ Metadados customizados
  relationships: string[]; // ✨ IDs de marcações relacionadas
  confidence: number; // ✨ Nível de certeza na codificação
  created: timestamp;
  updated: timestamp;
}
```

### Capacidades Analíticas Planejadas

#### 1. Multidimensional Scaling (MDS)
**Objetivo**: Visualizar proximidade semântica entre códigos.

**Dados necessários**:
- Matriz de coocorrência entre códigos
- Frequência de cada código
- Distância semântica (baseada em sobreposições)

#### 2. Tabelas de Contingência
**Objetivo**: Análise quantitativa de relações entre categorias.

```typescript
interface ContingencyData {
  codes: string[];
  frequencies: number[][];
  chisquare: number;
  pvalue: number;
}
```

#### 3. Análise de Coocorrência
**Objetivo**: Identificar padrões de códigos que aparecem juntos.

**Métricas**:
- **Proximidade**: Códigos dentro de N caracteres
- **Sobreposição**: Códigos aplicados ao mesmo texto
- **Sequência**: Ordem temporal de aplicação dos códigos

#### 4. Network Analysis
**Objetivo**: Visualizar relações complexas entre códigos como grafo.

```typescript
interface CodeNetwork {
  nodes: Array<{
    id: string;
    label: string;
    frequency: number;
    centrality: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    type: 'cooccurrence' | 'hierarchy' | 'similarity';
  }>;
}
```

### Exportação e Interoperabilidade

#### Formatos de Saída
- **RQDA/R**: Para análise estatística
- **SPSS/CSV**: Para análise quantitativa  
- **Gephi/GraphML**: Para análise de redes
- **JSON**: Para processamento customizado
- **Atlas.ti**: Para migração entre ferramentas

#### Pipeline de Análise
```typescript
class AnalysisEngine {
  generateCooccurrenceMatrix(): number[][];
  calculateCodeFrequencies(): Map<string, number>;
  buildSemanticNetwork(): CodeNetwork;
  exportForMDS(): MDSData;
  generateContingencyTables(): ContingencyData[];
}
```

### Metodologias Suportadas

- **📖 Análise Temática**: Códigos hierárquicos e emergentes
- **🏗️ Grounded Theory**: Codificação aberta, axial e seletiva  
- **📊 Content Analysis**: Categorização sistemática e quantificação
- **🎭 Discourse Analysis**: Análise de poder, identidade e ideologia
- **📚 Phenomenography**: Categorias de descrição e espaço de resultado
- **🔍 Case Study**: Análise multi-caso com comparação cruzada

---

## 🚀 Próximos Passos

### Funcionalidades Imediatas
1. **Menu contextual** para gestão de códigos
2. **Painel de códigos** com hierarquia visual
3. **Sistema de cores** inteligente
4. **Busca e filtros** de marcações

### Funcionalidades Avançadas
1. **Dashboard analítico** com métricas em tempo real
2. **Exportação** para ferramentas estatísticas
3. **Colaboração** multi-usuário
4. **IA assistida** para sugestão de códigos

### Pesquisa e Desenvolvimento
1. **Validação empírica** com pesquisadores qualitativos
2. **Benchmarking** contra ferramentas comerciais
3. **Estudos de usabilidade** em diferentes metodologias
4. **Desenvolvimento de APIs** para extensibilidade

---

*Este documento representa o estado atual do projeto CodeMarker e serve como guia para desenvolvimento futuro e colaboração com a comunidade de pesquisa qualitativa.*