import Graph from 'graphology';
import Sigma from 'sigma';
import { POS, RelationType, TypeToHierarchy, HierarchyNode } from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';
import { replaceUnderscores } from '../../../util/wordnet';

type NodeKind = 'root' | 'synset' | 'word';

type SigmaNodeAttributes = {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string | null;
  forceLabel: boolean;
  kind: NodeKind;
  relation?: RelationType;
  depth: number;
  zIndex: number;
};

type SigmaEdgeAttributes = {
  color: string;
  size: number;
  zIndex: number;
};

type SceneNode = {
  id: string;
  label: string;
  kind: NodeKind;
  relation?: RelationType;
  depth: number;
  primaryParentId?: string;
};

type SceneEdge = {
  id: string;
  source: string;
  target: string;
  relation?: RelationType;
};

type SceneData = {
  rootId: string;
  nodes: Map<string, SceneNode>;
  edges: SceneEdge[];
  childMap: Map<string, string[]>;
};

export type LexicalGraphHandle = {
  center: (duration?: number) => void;
  reformat: () => void;
  resize: () => void;
  destroy: () => void;
};

type DrawOptions = {
  containerElement: HTMLDivElement;
  data: SceneData;
};

const ROOT_COLOR = '#6ef7b1';
const DEFAULT_NODE_COLOR = '#68a6c7';
const ANTONYM_COLOR = '#ff6b7a';
const EDGE_COLOR = 'rgba(134, 166, 183, 0.34)';

function relationColor(relation?: RelationType): string {
  if (relation === 'antonym') {
    return ANTONYM_COLOR;
  }
  if (relation === 'synonym') {
    return ROOT_COLOR;
  }
  if (relation) {
    return WordnetAPI.colors[relation] ?? DEFAULT_NODE_COLOR;
  }
  return DEFAULT_NODE_COLOR;
}

function getLinkColor(relation?: RelationType): string {
  if (relation === 'antonym') {
    return 'rgba(255, 107, 122, 0.52)';
  }
  if (relation === 'synonym') {
    return 'rgba(110, 247, 177, 0.42)';
  }
  return EDGE_COLOR;
}

function getRootLabel(lemma: string): string {
  const pos = lemma.substring(0, 1) as POS;
  return `${replaceUnderscores(lemma.substring(2))} (${WordnetAPI.posMap[pos]})`;
}

function ensureChild(childMap: Map<string, string[]>, parentId: string, childId: string): void {
  const nextChildren = childMap.get(parentId) ?? [];
  if (!nextChildren.includes(childId)) {
    childMap.set(parentId, [...nextChildren, childId]);
  }
}

function buildSceneNode(
  id: string,
  label: string,
  kind: NodeKind,
  relation?: RelationType,
  depth = 0,
  primaryParentId?: string,
): SceneNode {
  return {
    id,
    label,
    kind,
    relation,
    depth,
    primaryParentId,
  };
}

function flattenBranch(
  branch: HierarchyNode,
  parentId: string,
  relation: RelationType,
  nodes: Map<string, SceneNode>,
  childMap: Map<string, string[]>,
  edges: SceneEdge[],
  edgeIds: Set<string>,
  counters: { synset: number; word: number },
  depth: number,
): void {
  if (branch.label === '_SYNSET') {
    const synsetId = `synset-${counters.synset}`;
    counters.synset += 1;
    nodes.set(synsetId, buildSceneNode(synsetId, '', 'synset', relation, depth, parentId));
    ensureChild(childMap, parentId, synsetId);

    const edgeId = `${parentId}->${synsetId}:${relation}`;
    if (!edgeIds.has(edgeId)) {
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source: parentId,
        target: synsetId,
        relation,
      });
    }

    branch.children?.forEach((child) => {
      flattenBranch(child, synsetId, relation, nodes, childMap, edges, edgeIds, counters, depth + 1);
    });
    return;
  }

  const label = replaceUnderscores(branch.label);
  const wordKey = `word:${label.toLocaleLowerCase()}`;
  const existingNode = nodes.get(wordKey);
  let nodeId = wordKey;

  if (!existingNode) {
    nodeId = wordKey;
    nodes.set(nodeId, buildSceneNode(nodeId, label, 'word', relation, depth, parentId));
    ensureChild(childMap, parentId, nodeId);
    counters.word += 1;
  }

  const edgeId = `${parentId}->${nodeId}:${relation}`;
  if (!edgeIds.has(edgeId)) {
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      source: parentId,
      target: nodeId,
      relation,
    });
  }

  branch.children?.forEach((child) => {
    flattenBranch(child, nodeId, relation, nodes, childMap, edges, edgeIds, counters, depth + 1);
  });
}

export function buildLexicalGraph(data: TypeToHierarchy, lemma: string): SceneData {
  const rootId = 'root';
  const nodes = new Map<string, SceneNode>([
    [rootId, buildSceneNode(rootId, getRootLabel(lemma), 'root')],
  ]);
  const childMap = new Map<string, string[]>();
  const edges: SceneEdge[] = [];
  const edgeIds = new Set<string>();
  const counters = { synset: 0, word: 0 };

  Object.entries(data).forEach(([relationName, tree]) => {
    const relation = relationName as RelationType;
    tree.children?.forEach((child) => {
      flattenBranch(child, rootId, relation, nodes, childMap, edges, edgeIds, counters, 1);
    });
  });

  return {
    rootId,
    nodes,
    edges,
    childMap,
  };
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function collectDescendants(rootId: string, childMap: Map<string, string[]>): string[] {
  const descendants = new Set<string>();
  const queue = [...(childMap.get(rootId) ?? [])];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || descendants.has(nodeId)) {
      continue;
    }
    descendants.add(nodeId);
    queue.push(...(childMap.get(nodeId) ?? []));
  }

  return [...descendants];
}

function applyDeterministicLayout(
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
  scene: SceneData,
  variant: number,
): void {
  const relationNames = Array.from(new Set(
    (scene.childMap.get(scene.rootId) ?? [])
      .map((nodeId) => scene.nodes.get(nodeId)?.relation)
      .filter((relation): relation is RelationType => Boolean(relation)),
  ));
  const relationCount = Math.max(relationNames.length, 1);
  const relationIndex = new Map(relationNames.map((relation, index) => [relation, index]));
  const children = scene.childMap;
  const positioned = new Set<string>([scene.rootId]);

  graph.mergeNodeAttributes(scene.rootId, {
    x: 0,
    y: 0,
  });

  function positionSubtree(
    parentId: string,
    baseAngle: number,
    sector: number,
    ringDepth: number,
  ): void {
    const childIds = (children.get(parentId) ?? []).slice().sort();
    if (childIds.length === 0) {
      return;
    }

    const parentNode = scene.nodes.get(parentId);
    const parentAttrs = graph.getNodeAttributes(parentId);
    const parentX = parentAttrs.x;
    const parentY = parentAttrs.y;
    const isSynsetParent = parentNode?.kind === 'synset';

    childIds.forEach((childId, index) => {
      const childNode = scene.nodes.get(childId);
      if (!childNode || positioned.has(childId)) {
        return;
      }

      const count = Math.max(childIds.length, 1);
      const spread = isSynsetParent
        ? Math.PI * 2
        : Math.min(sector, Math.PI * 0.92);
      const childAngle = count === 1
        ? baseAngle
        : baseAngle - (spread / 2) + ((spread * index) / Math.max(count - 1, 1));
      const noise = (seededNoise(index + ringDepth * 31 + variant * 67) - 0.5) * (isSynsetParent ? 0.26 : 0.18);
      const angle = childAngle + noise;
      const distance = isSynsetParent
        ? 46 + Math.sqrt(count) * 10 + (seededNoise(index + 11) * 12)
        : 88 + (ringDepth * 18) + Math.sqrt(count) * 8 + (seededNoise(index + 19) * 16);

      const x = parentX + Math.cos(angle) * distance;
      const y = parentY + Math.sin(angle) * distance;

      graph.mergeNodeAttributes(childId, { x, y });
      positioned.add(childId);

      positionSubtree(
        childId,
        angle,
        isSynsetParent ? Math.PI * 0.72 : Math.max(sector / Math.max(count, 1), Math.PI / 8),
        ringDepth + 1,
      );
    });
  }

  const rootChildren = (scene.childMap.get(scene.rootId) ?? []).slice().sort((a, b) => {
    const nodeA = scene.nodes.get(a);
    const nodeB = scene.nodes.get(b);
    const relationA = nodeA?.relation ?? '';
    const relationB = nodeB?.relation ?? '';
    return relationA.localeCompare(relationB) || a.localeCompare(b);
  });

  const groupedRootChildren = new Map<RelationType | 'unknown', string[]>();
  rootChildren.forEach((nodeId) => {
    const relation = scene.nodes.get(nodeId)?.relation ?? 'unknown';
    groupedRootChildren.set(relation, [...(groupedRootChildren.get(relation) ?? []), nodeId]);
  });

  groupedRootChildren.forEach((group, relation) => {
    const index = relation === 'unknown' ? 0 : relationIndex.get(relation) ?? 0;
    const baseAngle = (-Math.PI / 2) + ((Math.PI * 2 * index) / relationCount) + (variant * 0.27);
    const sector = Math.min((Math.PI * 2) / relationCount, Math.PI * 0.9);

    group.forEach((nodeId, nodeIndex) => {
      const count = Math.max(group.length, 1);
      const angle = count === 1
        ? baseAngle
        : baseAngle - (sector / 2) + ((sector * nodeIndex) / Math.max(count - 1, 1));
      const radius = 126 + Math.sqrt(count) * 18 + (seededNoise(nodeIndex + 23) * 22);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      graph.mergeNodeAttributes(nodeId, { x, y });
      positioned.add(nodeId);
      positionSubtree(nodeId, angle, Math.max(sector / Math.max(count, 1), Math.PI / 6), 1);
    });
  });

  scene.nodes.forEach((node, nodeId) => {
    if (positioned.has(nodeId)) {
      return;
    }

    const relation = node.relation;
    const index = relation ? relationIndex.get(relation) ?? 0 : 0;
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / relationCount) + (seededNoise(index + variant * 79) * 0.5);
    const radius = 180 + (node.depth * 42);

    graph.mergeNodeAttributes(nodeId, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
}

function createSigmaGraph(scene: SceneData): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> {
  const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>({ multi: true, type: 'directed' });

  scene.nodes.forEach((node) => {
    const isRoot = node.kind === 'root';
    const isSynset = node.kind === 'synset';

    graph.addNode(node.id, {
      x: 0,
      y: 0,
      size: isRoot ? 18 : isSynset ? 2.6 : 5.4,
      color: isRoot ? ROOT_COLOR : relationColor(node.relation),
      label: isSynset ? null : node.label,
      forceLabel: isRoot,
      kind: node.kind,
      relation: node.relation,
      depth: node.depth,
      zIndex: isRoot ? 3 : isSynset ? 1 : 2,
    });
  });

  scene.edges.forEach((edge) => {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      color: getLinkColor(edge.relation),
      size: edge.source === scene.rootId ? 1.4 : edge.target.startsWith('synset-') ? 1.1 : 0.9,
      zIndex: edge.source === scene.rootId ? 1 : 0,
    });
  });

  return graph;
}

function getGraphBounds(graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  graph.forEachNode((_node, attrs) => {
    minX = Math.min(minX, attrs.x);
    maxX = Math.max(maxX, attrs.x);
    minY = Math.min(minY, attrs.y);
    maxY = Math.max(maxY, attrs.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return {
      x: [-1, 1] as [number, number],
      y: [-1, 1] as [number, number],
    };
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = Math.max(width, height) * 0.12 + 48;

  return {
    x: [minX - padding, maxX + padding] as [number, number],
    y: [minY - padding, maxY + padding] as [number, number],
  };
}

function fitCamera(renderer: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>, duration = 320): void {
  renderer.setCustomBBox(getGraphBounds(renderer.getGraph()));
  renderer.refresh();

  const camera = renderer.getCamera();
  if (duration <= 0) {
    camera.setState({
      x: 0.5,
      y: 0.5,
      ratio: 1,
      angle: 0,
    });
    return;
  }

  void camera.animate({
    x: 0.5,
    y: 0.5,
    ratio: 1,
    angle: 0,
  }, { duration });
}

export function drawLexicalGraph({
  containerElement,
  data,
}: DrawOptions): LexicalGraphHandle {
  const graph = createSigmaGraph(data);
  let layoutVariant = 0;
  applyDeterministicLayout(graph, data, layoutVariant);

  const renderer = new Sigma(graph, containerElement, {
    allowInvalidContainer: true,
    autoCenter: true,
    autoRescale: true,
    defaultEdgeColor: EDGE_COLOR,
    defaultNodeColor: DEFAULT_NODE_COLOR,
    dragTimeout: 0,
    enableEdgeEvents: false,
    hideEdgesOnMove: false,
    hideLabelsOnMove: false,
    itemSizesReference: 'screen',
    labelDensity: 0.18,
    labelFont: 'Space Grotesk, Avenir Next, sans-serif',
    labelGridCellSize: 140,
    labelRenderedSizeThreshold: 7,
    labelWeight: '600',
    minCameraRatio: 0.08,
    maxCameraRatio: 8,
    minEdgeThickness: 0.6,
    renderEdgeLabels: false,
    renderLabels: true,
    stagePadding: 24,
    zIndex: true,
  });

  fitCamera(renderer, 0);

  let dragState: {
    nodeId: string;
    startGraphX: number;
    startGraphY: number;
    affected: Map<string, { x: number; y: number }>;
    latestPointer?: { x: number; y: number };
    frameId: number | null;
  } | null = null;

  function commitDragFrame(): void {
    if (!dragState || !dragState.latestPointer) {
      return;
    }

    const dx = dragState.latestPointer.x - dragState.startGraphX;
    const dy = dragState.latestPointer.y - dragState.startGraphY;

    dragState.affected.forEach((position, nodeId) => {
      graph.mergeNodeAttributes(nodeId, {
        x: position.x + dx,
        y: position.y + dy,
      });
    });

    renderer.refresh();
    dragState.frameId = null;
  }

  function scheduleDragFrame(): void {
    if (!dragState || dragState.frameId !== null) {
      return;
    }

    dragState.frameId = window.requestAnimationFrame(() => {
      commitDragFrame();
    });
  }

  function finishDrag(): void {
    if (!dragState) {
      renderer.setSetting('enableCameraPanning', true);
      return;
    }

    if (dragState.frameId !== null) {
      window.cancelAnimationFrame(dragState.frameId);
      dragState.frameId = null;
    }
    commitDragFrame();
    dragState = null;
    renderer.setSetting('enableCameraPanning', true);
  }

  renderer.on('downNode', (payload) => {
    if (payload.node === data.rootId) {
      return;
    }

    payload.preventSigmaDefault();
    renderer.setSetting('enableCameraPanning', false);

    const descendants = collectDescendants(payload.node, data.childMap);
    const affected = new Map<string, { x: number; y: number }>();
    [payload.node, ...descendants].forEach((nodeId) => {
      const attrs = graph.getNodeAttributes(nodeId);
      affected.set(nodeId, { x: attrs.x, y: attrs.y });
    });

    const nodeAttrs = graph.getNodeAttributes(payload.node);
    dragState = {
      nodeId: payload.node,
      startGraphX: nodeAttrs.x,
      startGraphY: nodeAttrs.y,
      affected,
      frameId: null,
    };
  });

  renderer.on('moveBody', (payload) => {
    if (!dragState) {
      return;
    }

    payload.preventSigmaDefault();
    dragState.latestPointer = renderer.viewportToGraph({
      x: payload.event.x,
      y: payload.event.y,
    });
    scheduleDragFrame();
  });

  renderer.on('upNode', finishDrag);
  renderer.on('upStage', finishDrag);
  renderer.on('leaveStage', finishDrag as never);

  return {
    center: (duration = 320) => fitCamera(renderer, duration),
    reformat: () => {
      finishDrag();
      layoutVariant += 1;
      applyDeterministicLayout(graph, data, layoutVariant);
      fitCamera(renderer, 320);
    },
    resize: () => {
      renderer.resize();
      renderer.refresh();
    },
    destroy: () => {
      finishDrag();
      renderer.kill();
    },
  };
}
