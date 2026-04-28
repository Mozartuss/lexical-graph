import * as d3 from 'd3';
import {
  LemmaToDefinition,
  POS,
  RelationType,
  TypeToHierarchy,
  HierarchyNode,
} from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';
import { replaceUnderscores, toRouteWord } from '../../../util/wordnet';

type NodeKind = 'root' | 'bridge' | 'word';

type RelationCluster = {
  relation: RelationType;
  nodes: LexicalNode[];
};

type LinkLabel = {
  relation: RelationType;
  nodes: LexicalNode[];
  termCount: number;
};

type HoverPath = {
  nodeIds: Set<string>;
  linkIds: Set<string>;
};

export type LexicalNode = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  semanticLabel?: string;
  semanticDescription?: string;
  navigationTarget?: string;
  isBoundary?: boolean;
  relation?: RelationType;
  kind: NodeKind;
  radius: number;
  depth: number;
  layoutX?: number;
  layoutY?: number;
};

export type LexicalLink = d3.SimulationLinkDatum<LexicalNode> & {
  source: string | LexicalNode;
  target: string | LexicalNode;
  relation?: RelationType;
};

export type LexicalGraphData = {
  nodes: LexicalNode[];
  links: LexicalLink[];
};

export type LexicalNodePosition = {
  x?: number;
  y?: number;
  layoutX?: number;
  layoutY?: number;
  fx?: number | null;
  fy?: number | null;
};

const ROOT_COLOR = '#ffffff';
const SYNONYM_COLOR = '#38e8ae';
const DEFAULT_NODE_COLOR = '#68a6c7';
const ANTONYM_COLOR = '#ff69b4';
const EDGE_COLOR = 'var(--graph-edge)';

function relationColor(relation?: RelationType): string {
  if (relation === 'antonym') {
    return ANTONYM_COLOR;
  }
  if (relation === 'synonym') {
    return SYNONYM_COLOR;
  }
  if (relation) {
    return WordnetAPI.colors[relation] ?? DEFAULT_NODE_COLOR;
  }
  return DEFAULT_NODE_COLOR;
}

function getRootLabel(lemma: string): string {
  const pos = lemma.substring(0, 1) as POS;
  return `${replaceUnderscores(lemma.substring(2))} (${WordnetAPI.posMap[pos]})`;
}

function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) {
    return color;
  }

  const hex = color.slice(1);
  const normalizedHex = hex.length === 3
    ? hex.split('').map((digit) => `${digit}${digit}`).join('')
    : hex;
  const value = Number.parseInt(normalizedHex, 16);

  if (!Number.isFinite(value)) {
    return color;
  }

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function makeNode(
  id: string,
  label: string,
  kind: NodeKind,
  relation?: RelationType,
  depth = 0,
): LexicalNode {
  const radius = kind === 'root' ? 18 : kind === 'bridge' ? 3.5 : 7;
  const node: LexicalNode = {
    id,
    label,
    kind,
    relation,
    radius,
    depth,
  };

  if (kind === 'root') {
    node.fx = 0;
    node.fy = 0;
  }

  return node;
}

function flattenBranch(
  branch: HierarchyNode,
  parentId: string,
  relation: RelationType,
  nodeByLabel: Map<string, LexicalNode>,
  bridgeNodes: LexicalNode[],
  linksById: Map<string, LexicalLink>,
  links: LexicalLink[],
  depth: number,
): void {
  if (branch.label === '_SYNSET') {
    const bridgeId = `bridge-${bridgeNodes.length}`;
    const bridgeNode = makeNode(bridgeId, '', 'bridge', relation, depth);
    bridgeNodes.push(bridgeNode);

    const bridgeLinkKey = `${parentId}->${bridgeId}:${relation}`;
    const bridgeLink = {
      source: parentId,
      target: bridgeId,
      relation,
    };
    linksById.set(bridgeLinkKey, bridgeLink);
    links.push(bridgeLink);

    branch.children?.forEach((child) => {
      flattenBranch(child, bridgeId, relation, nodeByLabel, bridgeNodes, linksById, links, depth + 1);
    });
    return;
  }

  const label = replaceUnderscores(branch.label);
  const labelKey = label.toLocaleLowerCase();
  let node = nodeByLabel.get(labelKey);

  if (!node) {
    node = makeNode(`word-${nodeByLabel.size}`, label, 'word', relation, depth);
    nodeByLabel.set(labelKey, node);
  } else {
    node.depth = Math.min(node.depth, depth);
  }

  const linkKey = `${parentId}->${node.id}:${relation}`;
  if (!linksById.has(linkKey)) {
    const link = {
      source: parentId,
      target: node.id,
      relation,
    };
    linksById.set(linkKey, link);
    links.push(link);
  }

  branch.children?.forEach((child) => {
    flattenBranch(child, node.id, relation, nodeByLabel, bridgeNodes, linksById, links, depth + 1);
  });
}

export function buildLexicalGraph(data: TypeToHierarchy, lemma: string): LexicalGraphData {
  const root = makeNode('root', getRootLabel(lemma), 'root');
  const nodeByLabel = new Map<string, LexicalNode>();
  const bridgeNodes: LexicalNode[] = [];
  const linksById = new Map<string, LexicalLink>();
  const links: LexicalLink[] = [];

  Object.entries(data).forEach(([relationName, tree]) => {
    const relation = relationName as RelationType;
    tree.children?.forEach((child) => {
      flattenBranch(child, 'root', relation, nodeByLabel, bridgeNodes, linksById, links, 1);
    });
  });

  return { nodes: [root, ...bridgeNodes, ...nodeByLabel.values()], links };
}

function getLinkEndpoint(endpoint: string | LexicalNode): LexicalNode {
  return typeof endpoint === 'string'
    ? {
      id: endpoint, label: endpoint, kind: 'word', radius: 1, depth: 1,
    }
    : endpoint;
}

function getEndpointId(endpoint: string | LexicalNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function getLinkId(link: LexicalLink): string {
  return `${getEndpointId(link.source)}->${getEndpointId(link.target)}:${link.relation ?? 'unknown'}`;
}

function getNodeColor(node: LexicalNode): string {
  if (node.kind === 'root') {
    return ROOT_COLOR;
  }
  if (node.kind === 'bridge') {
    return relationColor(node.relation);
  }
  return relationColor(node.relation);
}

function getRelationClusters(data: LexicalGraphData): RelationCluster[] {
  const clusters = new Map<RelationType, LexicalNode[]>();

  data.nodes.forEach((node) => {
    if (node.kind === 'root' || !node.relation) {
      return;
    }

    clusters.set(node.relation, [...(clusters.get(node.relation) ?? []), node]);
  });

  return [...clusters.entries()]
    .map(([relation, nodes]) => ({ relation, nodes }))
    .filter((cluster) => cluster.nodes.length >= 2);
}

function formatRelationLabel(relation: RelationType): string {
  return relation.replace(/_/g, ' ');
}

function truncateLabel(label: string, maxLength = 30): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

function getLinkTooltip(link: LexicalLink): string {
  const source = getLinkEndpoint(link.source);
  const target = getLinkEndpoint(link.target);
  const sourceLabel = source.kind === 'root' ? source.label : source.label || 'synset';
  const targetLabel = target.kind === 'bridge' ? 'synset group' : target.label;

  if (!link.relation) {
    return `${sourceLabel} -> ${targetLabel}`;
  }

  return `${sourceLabel} -> ${formatRelationLabel(link.relation)} -> ${targetLabel}`;
}

function getSpecificityDescription(relation?: RelationType): string {
  if (relation === 'hyponym') {
    return 'narrower WordNet category';
  }
  if (relation === 'hypernym') {
    return 'broader WordNet category';
  }
  if (relation === 'meronym') {
    return 'part-related WordNet category';
  }
  if (relation === 'holonym') {
    return 'whole-related WordNet category';
  }
  if (relation === 'antonym') {
    return 'opposite lexical category';
  }
  if (relation === 'synonym') {
    return 'same-sense lexical category';
  }
  return 'intermediate WordNet synset';
}

function getClusterHull(cluster: RelationCluster, denseGraph: boolean): [number, number][] | null {
  const padding = denseGraph ? 28 : 38;
  const points = cluster.nodes.flatMap((node) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const label = getSemanticLabel(node);
    const radius = node.kind === 'bridge' && !node.isBoundary
      ? padding * 0.58
      : padding + Math.min(label.length * 1.3, 28);

    return d3.range(10).map((index) => {
      const angle = (Math.PI * 2 * index) / 10;
      return [
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
      ] as [number, number];
    });
  });

  if (points.length < 3) {
    return null;
  }

  const hull = d3.polygonHull(points);
  if (!hull) {
    return null;
  }

  return hull;
}

function getClusterPath(cluster: RelationCluster, denseGraph: boolean): string | null {
  const hull = getClusterHull(cluster, denseGraph);
  if (!hull) {
    return null;
  }

  return d3.line<[number, number]>()
    .curve(d3.curveBasisClosed)(hull);
}

function getClusterLabelPosition(label: LinkLabel, denseGraph: boolean): { x: number; y: number } {
  const hull = getClusterHull({ relation: label.relation, nodes: label.nodes }, denseGraph);

  if (!hull || hull.length === 0) {
    return {
      x: d3.mean(label.nodes, (node) => node.x ?? 0) ?? 0,
      y: (d3.min(label.nodes, (node) => node.y ?? 0) ?? 0) - 34,
    };
  }

  const centerX = d3.mean(hull, (point) => point[0]) ?? 0;
  const topY = d3.min(hull, (point) => point[1]) ?? 0;
  const topBand = hull.filter((point) => point[1] <= topY + 42);
  const labelX = d3.mean(topBand, (point) => point[0]) ?? centerX;
  return {
    x: labelX + ((centerX - labelX) * 0.12),
    y: topY + 4,
  };
}

function getPrimaryParentLinks(data: LexicalGraphData): Map<string, LexicalLink> {
  const parentLinkByTarget = new Map<string, LexicalLink>();
  const adjacency = new Map<string, LexicalLink[]>();

  data.links.forEach((link) => {
    const sourceId = getEndpointId(link.source);
    adjacency.set(sourceId, [...(adjacency.get(sourceId) ?? []), link]);
  });

  const visited = new Set<string>(['root']);
  const queue = ['root'];

  while (queue.length > 0) {
    const sourceId = queue.shift();
    if (!sourceId) {
      continue;
    }

    (adjacency.get(sourceId) ?? []).forEach((link) => {
      const targetId = getEndpointId(link.target);
      if (visited.has(targetId)) {
        return;
      }

      visited.add(targetId);
      parentLinkByTarget.set(targetId, link);
      queue.push(targetId);
    });
  }

  return parentLinkByTarget;
}

function getHoverPath(node: LexicalNode, parentLinkByTarget: Map<string, LexicalLink>): HoverPath {
  const nodeIds = new Set<string>([node.id]);
  const linkIds = new Set<string>();
  let currentId = node.id;

  while (currentId !== 'root') {
    const link = parentLinkByTarget.get(currentId);
    if (!link) {
      break;
    }

    const sourceId = getEndpointId(link.source);
    linkIds.add(getLinkId(link));
    nodeIds.add(sourceId);
    currentId = sourceId;
  }

  return { nodeIds, linkIds };
}

function getPathLinks(node: LexicalNode, parentLinkByTarget: Map<string, LexicalLink>): LexicalLink[] {
  const links: LexicalLink[] = [];
  let currentId = node.id;

  while (currentId !== 'root') {
    const link = parentLinkByTarget.get(currentId);
    if (!link) {
      break;
    }

    links.push(link);
    currentId = getEndpointId(link.source);
  }

  return links.reverse();
}

function getEndpointNode(endpoint: string | LexicalNode, nodeById: Map<string, LexicalNode>): LexicalNode | undefined {
  return typeof endpoint === 'string' ? nodeById.get(endpoint) : endpoint;
}

function getSemanticLabel(node: LexicalNode | undefined, rootLabel = 'root'): string {
  if (!node) {
    return 'unspecified intermediate synset';
  }
  if (node.kind === 'root') {
    return node.label || rootLabel;
  }
  if (node.kind === 'bridge') {
    return node.semanticLabel ?? 'unspecified intermediate synset';
  }
  return node.label;
}

function getSemanticDescription(node: LexicalNode | undefined): string {
  if (!node) {
    return 'intermediate WordNet synset';
  }
  if (node.kind === 'root') {
    return 'selected WordNet concept';
  }
  if (node.kind === 'bridge') {
    return node.semanticDescription ?? getSpecificityDescription(node.relation);
  }
  return 'WordNet lemma in this semantic path';
}

function getEndpointLabel(endpoint: string | LexicalNode, nodeById: Map<string, LexicalNode>, rootLabel = 'root'): string {
  const node = getEndpointNode(endpoint, nodeById);
  if (node) {
    return getSemanticLabel(node, rootLabel);
  }
  if (typeof endpoint !== 'string') {
    return getSemanticLabel(endpoint, rootLabel);
  }
  if (endpoint === 'root') {
    return rootLabel;
  }
  if (endpoint.startsWith('bridge-')) {
    return 'unspecified intermediate synset';
  }
  return endpoint.replace(/^word-/, 'term ');
}

function getDepthDescription(
  node: LexicalNode,
  parentLinkByTarget: Map<string, LexicalLink>,
  nodeById: Map<string, LexicalNode>,
): {
  depthLine: string;
  hopLines: string[];
} {
  if (node.kind === 'root') {
    return {
      depthLine: 'Depth 0: selected lemma',
      hopLines: [node.label],
    };
  }

  const pathLinks = getPathLinks(node, parentLinkByTarget);
  const rootLabel = pathLinks.length > 0 ? getEndpointLabel(pathLinks[0].source, nodeById) : 'root';
  const hopLines = pathLinks.flatMap((link, index) => {
    const sourceNode = getEndpointNode(link.source, nodeById);
    const targetNode = getEndpointNode(link.target, nodeById);
    const source = getSemanticLabel(sourceNode, rootLabel);
    const target = getSemanticLabel(targetNode, rootLabel);
    const targetDescription = getSemanticDescription(targetNode);
    const relation = formatRelationLabel(link.relation ?? node.relation ?? 'synonym');
    const sourceLine = index === 0 ? [`${truncateLabel(source, 56)} — ${truncateLabel(getSemanticDescription(sourceNode), 62)}`] : [];
    return [
      ...sourceLine,
      `↓ ${relation}`,
      `${truncateLabel(target, 56)} — ${truncateLabel(targetDescription, 62)}`,
    ];
  });

  return {
    depthLine: `Depth ${node.depth}: ${pathLinks.length} hops from root`,
    hopLines,
  };
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function getDefinitionQuery(node: LexicalNode): string | null {
  if (node.kind === 'bridge') {
    return null;
  }

  const label = node.kind === 'root'
    ? node.label.replace(/\s+\([^)]*\)$/u, '')
    : node.label;
  return label.trim().replace(/\s+/g, '_') || null;
}

function normalizeRouteWord(label: string): string {
  return toRouteWord(label);
}

function getNavigationTarget(node: LexicalNode): string | null {
  if (node.navigationTarget) {
    return normalizeRouteWord(node.navigationTarget);
  }
  if (node.kind === 'bridge') {
    return null;
  }

  const label = node.kind === 'root'
    ? node.label.replace(/\s+\([^)]*\)$/u, '')
    : node.label;
  return normalizeRouteWord(label);
}

function getFirstDefinition(definitions: LemmaToDefinition): string | null {
  for (const posToGlosses of Object.values(definitions)) {
    for (const glosses of Object.values(posToGlosses)) {
      const firstGloss = glosses[0]?.gloss;
      if (firstGloss) {
        return firstGloss;
      }
    }
  }

  return null;
}

function getLinkColor(link: LexicalLink): string {
  if (link.relation === 'antonym') {
    return 'rgba(255, 107, 122, 0.52)';
  }
  if (link.relation === 'synonym') {
    return 'rgba(110, 247, 177, 0.42)';
  }
  return EDGE_COLOR;
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function getDepths(data: LexicalGraphData): Map<string, number> {
  const depths = new Map<string, number>([['root', 0]]);
  const adjacency = new Map<string, string[]>();

  data.links.forEach((link) => {
    const source = getEndpointId(link.source);
    const target = getEndpointId(link.target);
    adjacency.set(source, [...(adjacency.get(source) ?? []), target]);
  });

  const queue = ['root'];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const currentDepth = depths.get(current) ?? 0;
    adjacency.get(current)?.forEach((next) => {
      if (!depths.has(next)) {
        depths.set(next, currentDepth + 1);
        queue.push(next);
      }
    });
  }

  return depths;
}

function getChildMap(data: LexicalGraphData): Map<string, LexicalNode[]> {
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const childMap = new Map<string, LexicalNode[]>();

  data.links.forEach((link) => {
    const source = nodeById.get(getEndpointId(link.source));
    const target = nodeById.get(getEndpointId(link.target));

    if (source && target && target.kind !== 'root') {
      childMap.set(source.id, [...(childMap.get(source.id) ?? []), target]);
    }
  });

  return childMap;
}

function getDescendantWords(node: LexicalNode, childMap: Map<string, LexicalNode[]>): LexicalNode[] {
  const words: LexicalNode[] = [];
  const visited = new Set<string>();
  const queue = [...(childMap.get(node.id) ?? [])];

  while (queue.length > 0 && words.length < 4) {
    const child = queue.shift();
    if (!child || visited.has(child.id)) {
      continue;
    }

    visited.add(child.id);
    if (child.kind === 'word') {
      words.push(child);
    }
    queue.push(...(childMap.get(child.id) ?? []));
  }

  return words;
}

function enrichBridgeLabels(data: LexicalGraphData, childMap: Map<string, LexicalNode[]>): void {
  data.nodes
    .filter((node) => node.kind === 'bridge')
    .forEach((bridge) => {
      const directWords = (childMap.get(bridge.id) ?? []).filter((child) => child.kind === 'word');
      const representativeWords = directWords.length > 0 ? directWords : getDescendantWords(bridge, childMap);
      const representativeLabels = representativeWords
        .slice(0, 3)
        .map((word) => word.label);

      if (representativeLabels.length === 0) {
        bridge.semanticLabel = bridge.semanticLabel ?? 'unspecified intermediate synset';
        bridge.semanticDescription = bridge.semanticDescription ?? getSpecificityDescription(bridge.relation);
        bridge.navigationTarget = undefined;
        return;
      }

      const suffix = representativeWords.length > 1 ? 'category' : 'sense';
      bridge.semanticLabel = `${representativeLabels.join(', ')} ${suffix}`;
      bridge.semanticDescription = `${getSpecificityDescription(bridge.relation)} represented by ${representativeLabels.join(', ')}`;
      bridge.navigationTarget = representativeLabels[0];
    });
}

function seedLayout(data: LexicalGraphData, width: number, height: number, variant = 0): void {
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const visibleNodes = data.nodes.filter((node) => node.kind !== 'bridge' || node.isBoundary);
  const relationTypes = Array.from(new Set(
    data.nodes
      .filter((node) => node.kind !== 'root' && node.relation)
      .map((node) => node.relation as RelationType),
  ));
  const relationCount = Math.max(relationTypes.length, 1);
  const relationIndex = new Map(relationTypes.map((relation, index) => [relation, index]));
  const bridgeByRelation = new Map<RelationType | 'unknown', LexicalNode[]>();
  const bridgeChildren = new Map<string, LexicalNode[]>();
  const wordParentBridgeIds = new Set<string>();
  const canvasBase = Math.min(width, height);
  const denseGraph = visibleNodes.length > 120;
  const ringGap = denseGraph ? 120 : 88;
  const baseRadius = denseGraph ? 115 : 86;

  data.links.forEach((link) => {
    const source = nodeById.get(getEndpointId(link.source));
    const target = nodeById.get(getEndpointId(link.target));

    if (source?.kind === 'bridge' && target?.kind === 'word') {
      bridgeChildren.set(source.id, [...(bridgeChildren.get(source.id) ?? []), target]);
      wordParentBridgeIds.add(target.id);
    }
  });

  data.nodes.forEach((node) => {
    if (node.kind === 'root') {
      node.x = 0;
      node.y = 0;
      node.fx = 0;
      node.fy = 0;
      node.layoutX = 0;
      node.layoutY = 0;
      return;
    }

    if (node.kind === 'bridge') {
      const key = node.relation ?? 'unknown';
      bridgeByRelation.set(key, [...(bridgeByRelation.get(key) ?? []), node]);
    }
  });

  bridgeByRelation.forEach((bucket, relation) => {
    const index = relation === 'unknown' ? 0 : relationIndex.get(relation) ?? 0;
    const baseAngle = (-Math.PI / 2) + ((Math.PI * 2 * index) / relationCount) + (variant * 0.32);
    const sector = Math.min((Math.PI * 2) / relationCount, Math.PI * 0.9);
    const sortedBucket = bucket
      .slice()
      .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    sortedBucket.forEach((bridge, nodeIndex) => {
      const spreadPosition = sortedBucket.length <= 1
        ? 0.5
        : nodeIndex / (sortedBucket.length - 1);
      const angleJitter = (seededNoise(nodeIndex + variant * 97 + index * 31) - 0.5) * sector * 0.16;
      const angle = baseAngle + ((spreadPosition - 0.5) * sector * 0.72) + angleJitter;
      const depth = Math.max(bridge.depth, 1);
      const branchSpread = Math.sqrt(sortedBucket.length) * (denseGraph ? 12 : 8);
      const radius = Math.min(
        Math.max(canvasBase * 0.48, 320),
        baseRadius + (depth * ringGap) + branchSpread + (seededNoise(nodeIndex + 11) * 24),
      );

      bridge.layoutX = Math.cos(angle) * radius;
      bridge.layoutY = Math.sin(angle) * radius;
      bridge.x = bridge.layoutX;
      bridge.y = bridge.layoutY;
      bridge.fx = undefined;
      bridge.fy = undefined;

      const children = (bridgeChildren.get(bridge.id) ?? [])
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const clusterRadius = Math.max(
        denseGraph ? 54 : 42,
        Math.min(denseGraph ? 132 : 104, 30 + Math.sqrt(children.length) * (denseGraph ? 22 : 17)),
      );

      children.forEach((child, childIndex) => {
        const childAngle = angle
          + ((Math.PI * 2 * childIndex) / Math.max(children.length, 1))
          + ((seededNoise(childIndex + nodeIndex * 43 + variant * 59) - 0.5) * 0.34);
        const childRadius = clusterRadius + (seededNoise(childIndex + 19) * 18);
        child.layoutX = (bridge.layoutX ?? 0) + Math.cos(childAngle) * childRadius;
        child.layoutY = (bridge.layoutY ?? 0) + Math.sin(childAngle) * childRadius;
        child.x = child.layoutX;
        child.y = child.layoutY;
        child.fx = undefined;
        child.fy = undefined;
      });
    });
  });

  data.nodes
    .filter((node) => node.kind === 'word' && !wordParentBridgeIds.has(node.id))
    .forEach((node, nodeIndex) => {
      const relation = node.relation ?? 'unknown';
      const index = relation === 'unknown' ? 0 : relationIndex.get(relation) ?? 0;
      const angle = (-Math.PI / 2)
        + ((Math.PI * 2 * index) / relationCount)
        + ((seededNoise(nodeIndex + variant * 71) - 0.5) * 0.8);
      const radius = baseRadius + (Math.max(node.depth, 1) * ringGap);

      node.layoutX = Math.cos(angle) * radius;
      node.layoutY = Math.sin(angle) * radius;
      node.x = node.layoutX;
      node.y = node.layoutY;
      node.fx = undefined;
      node.fy = undefined;
    });
}

export type DrawOptions = {
  svgElement: SVGSVGElement;
  data: LexicalGraphData;
  width: number;
  height: number;
  initialPositions?: Map<string, LexicalNodePosition>;
  onPositionsChange?: (positions: Map<string, LexicalNodePosition>) => void;
  onNavigate?: (word: string) => void;
};

export type LexicalGraphHandle = {
  center: (duration?: number) => void;
  reformat: () => void;
  destroy: () => void;
};

type SimulationProfile = {
  chargeRoot: number;
  chargeBridge: number;
  chargeWord: number;
  linkRootDistance: number;
  linkBridgeDistance: number;
  linkWordDistance: number;
  collideIterations: number;
  balanceStrength: number;
  clusterStrength: number;
  wordAnchorStrength: number;
  alphaDecay: number;
  alphaMin: number;
  velocityDecay: number;
};

function getSimulationProfile(nodeCount: number, denseGraph: boolean): SimulationProfile {
  const largeGraph = nodeCount > 220;

  if (largeGraph) {
    return {
      chargeRoot: -620,
      chargeBridge: -120,
      chargeWord: -92,
      linkRootDistance: 84,
      linkBridgeDistance: 70,
      linkWordDistance: 52,
      collideIterations: 2,
      balanceStrength: 0.044,
      clusterStrength: 0.02,
      wordAnchorStrength: 0.14,
      alphaDecay: 0.03,
      alphaMin: 0.004,
      velocityDecay: 0.72,
    };
  }

  if (denseGraph) {
    return {
      chargeRoot: -700,
      chargeBridge: -150,
      chargeWord: -125,
      linkRootDistance: 92,
      linkBridgeDistance: 76,
      linkWordDistance: 62,
      collideIterations: 3,
      balanceStrength: 0.052,
      clusterStrength: 0.026,
      wordAnchorStrength: 0.13,
      alphaDecay: 0.022,
      alphaMin: 0.005,
      velocityDecay: 0.68,
    };
  }

  return {
    chargeRoot: -420,
    chargeBridge: -100,
    chargeWord: -78,
    linkRootDistance: 72,
    linkBridgeDistance: 58,
    linkWordDistance: 46,
    collideIterations: 2,
    balanceStrength: 0.068,
    clusterStrength: 0.018,
    wordAnchorStrength: 0.11,
    alphaDecay: 0.026,
    alphaMin: 0.005,
    velocityDecay: 0.66,
  };
}

export function drawLexicalGraph({
  svgElement,
  data,
  width,
  height,
  initialPositions,
  onPositionsChange,
  onNavigate,
}: DrawOptions): LexicalGraphHandle {
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  let layoutVariant = 0;
  seedLayout(data, width, height, layoutVariant);
  const cachedPositionCount = initialPositions
    ? data.nodes.filter((node) => initialPositions.has(node.id)).length
    : 0;
  const hasCachedLayout = cachedPositionCount > Math.max(3, data.nodes.length * 0.55);
  if (hasCachedLayout && initialPositions) {
    data.nodes.forEach((node) => {
      const position = initialPositions.get(node.id);
      if (!position) {
        return;
      }

      node.x = position.x ?? node.x;
      node.y = position.y ?? node.y;
      node.layoutX = position.layoutX ?? position.x ?? node.layoutX;
      node.layoutY = position.layoutY ?? position.y ?? node.layoutY;
      node.fx = position.fx ?? (node.kind === 'root' ? 0 : undefined);
      node.fy = position.fy ?? (node.kind === 'root' ? 0 : undefined);
    });
  }
  const visibleNodeCount = data.nodes.filter((node) => node.kind !== 'bridge' || node.isBoundary).length;
  const denseGraph = visibleNodeCount > 120;
  const simulationProfile = getSimulationProfile(visibleNodeCount, denseGraph);
  const childMap = getChildMap(data);
  enrichBridgeLabels(data, childMap);
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const clusters = getRelationClusters(data);
  const nonRootNodes = data.nodes.filter((node) => node.kind !== 'root');
  const parentLinkByTarget = getPrimaryParentLinks(data);
  const linkLabels: LinkLabel[] = clusters
    .map((cluster) => ({
      relation: cluster.relation,
      nodes: cluster.nodes,
      termCount: cluster.nodes.filter((node) => node.kind !== 'bridge' || node.isBoundary).length,
    }))
    .filter((label) => label.termCount > 0);

  const viewport = svg
    .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const container = viewport.append('g');

  const clusterHull = container.append('g')
    .attr('class', 'graph-clusters')
    .selectAll<SVGPathElement, RelationCluster>('path')
    .data(clusters)
    .join('path')
    .attr('class', 'graph-cluster')
    .attr('fill', (d) => withAlpha(relationColor(d.relation), 0.16))
    .attr('stroke', (d) => withAlpha(relationColor(d.relation), 0.26));

  const linkGlow = container.append('g')
    .attr('class', 'graph-links-glow')
    .selectAll<SVGLineElement, LexicalLink>('line')
    .data(data.links)
    .join('line')
    .attr('data-link-id', getLinkId)
    .attr('stroke', getLinkColor)
    .attr('stroke-width', (d) => (getEndpointId(d.source) === 'root' ? 3.2 : 1.8));

  const link = container.append('g')
    .attr('class', 'graph-links')
    .selectAll<SVGLineElement, LexicalLink>('line')
    .data(data.links)
    .join('line')
    .attr('data-link-id', getLinkId)
    .attr('stroke', getLinkColor)
    .attr('stroke-width', (d) => (getEndpointId(d.source) === 'root' ? 1.25 : 0.7));

  const linkHit = container.append('g')
    .attr('class', 'graph-link-hits')
    .selectAll<SVGLineElement, LexicalLink>('line')
    .data(data.links)
    .join('line')
    .attr('data-link-id', getLinkId);

  const relationBadge = container.append('g')
    .attr('class', 'graph-relation-badges')
    .selectAll<SVGGElement, LinkLabel>('g')
    .data(linkLabels)
    .join('g')
    .attr('class', 'graph-relation-badge');

  relationBadge.append('rect')
    .attr('x', -53)
    .attr('y', -18)
    .attr('width', 106)
    .attr('height', 32)
    .attr('rx', 7)
    .attr('ry', 7)
    .attr('fill', (d) => withAlpha(relationColor(d.relation), 0.28))
    .attr('stroke', (d) => withAlpha(relationColor(d.relation), 0.42));

  relationBadge.append('text')
    .attr('class', 'graph-relation-badge__label')
    .attr('text-anchor', 'middle')
    .attr('y', -4)
    .text((d) => formatRelationLabel(d.relation));

  relationBadge.append('text')
    .attr('class', 'graph-relation-badge__meta')
    .attr('text-anchor', 'middle')
    .attr('y', 10)
    .text((d) => `${d.termCount} terms`);

  const nodeGroup = container.append('g')
    .attr('class', 'graph-nodes')
    .selectAll<SVGGElement, LexicalNode>('g')
    .data(data.nodes)
    .join('g')
    .attr('class', (d) => `graph-node graph-node--${d.kind}`)
    .attr('data-depth', (d) => d.depth)
    .attr('data-kind', (d) => d.kind)
    .attr('data-label', (d) => getSemanticLabel(d))
    .attr('data-boundary', (d) => String(Boolean(d.isBoundary)))
    .attr('tabindex', (d) => (d.kind === 'root' ? null : 0));

  nodeGroup
    .append('circle')
    .attr('class', 'graph-node-hit')
    .attr('r', (d) => {
      if (d.kind === 'root') {
        return 30;
      }
      if (d.kind === 'bridge' && !d.isBoundary) {
        return 14;
      }
      return Math.max(d.radius + 12, Math.min(52, 18 + (getSemanticLabel(d).length * 1.1)));
    });

  nodeGroup.sort((a, b) => b.depth - a.depth);

  nodeGroup
    .filter((d) => d.kind === 'root')
    .append('circle')
    .attr('class', 'graph-root-halo')
    .attr('r', (d) => d.radius + 10);

  nodeGroup
    .filter((d) => d.kind !== 'bridge' || Boolean(d.isBoundary))
    .append('circle')
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => (d.kind === 'bridge' ? withAlpha(getNodeColor(d), 0.9) : getNodeColor(d)))
    .attr('stroke', (d) => (d.kind === 'root' ? 'var(--graph-tooltip-title)' : 'var(--graph-bg)'))
    .attr('stroke-width', (d) => (d.kind === 'root' ? 1.6 : 0.8));

  nodeGroup
    .filter((d) => d.kind === 'bridge' && !d.isBoundary)
    .append('circle')
    .attr('class', 'graph-bridge-ring')
    .attr('r', (d) => d.radius)
    .attr('fill', 'transparent')
    .attr('stroke', getNodeColor)
    .attr('stroke-width', 1.8);

  nodeGroup
    .filter((d) => d.kind !== 'bridge' || Boolean(d.isBoundary))
    .append('title')
    .text((d) => getSemanticLabel(d));

  nodeGroup
    .filter((d) => d.kind !== 'bridge' || Boolean(d.isBoundary))
    .append('text')
    .attr('class', 'graph-label')
    .attr('dy', (d) => d.radius + 8)
    .text((d) => getSemanticLabel(d));

  const hostElement = svgElement.parentElement ?? svgElement;
  const fixedTooltip = createElement('div', 'graph-node-tooltip graph-node-tooltip--fixed');
  fixedTooltip.setAttribute('aria-live', 'polite');
  const fixedTooltipHeader = createElement('div', 'graph-node-tooltip__header');
  const fixedTooltipEyebrow = createElement('div', 'graph-node-tooltip__eyebrow');
  const fixedTooltipTitle = createElement('div', 'graph-node-tooltip__title');
  const fixedTooltipMeta = createElement('div', 'graph-node-tooltip__meta');
  const fixedTooltipRelation = createElement('div', 'graph-node-tooltip__relation');
  const fixedTooltipDepth = createElement('div', 'graph-node-tooltip__depth');
  const fixedTooltipBranching = createElement('div', 'graph-node-tooltip__branching');
  const fixedTooltipDefinitionSection = createElement('div', 'graph-node-tooltip__section');
  const fixedTooltipDefinitionLabel = createElement('div', 'graph-node-tooltip__section-label');
  const fixedTooltipDefinition = createElement('div', 'graph-node-tooltip__definition');
  const fixedTooltipPathSection = createElement('div', 'graph-node-tooltip__section graph-node-tooltip__section--path');
  const fixedTooltipPathHeader = createElement('div', 'graph-node-tooltip__section-header');
  const fixedTooltipPathLabel = createElement('div', 'graph-node-tooltip__section-label');
  const fixedTooltipPathMeta = createElement('div', 'graph-node-tooltip__section-meta');
  const fixedTooltipPath = createElement('div', 'graph-node-tooltip__path');

  fixedTooltipDefinitionLabel.textContent = 'Definition';
  fixedTooltipPathLabel.textContent = 'Traversal path';
  fixedTooltipHeader.append(fixedTooltipEyebrow, fixedTooltipTitle, fixedTooltipMeta);
  fixedTooltipMeta.append(fixedTooltipRelation, fixedTooltipDepth, fixedTooltipBranching);
  fixedTooltipDefinitionSection.append(fixedTooltipDefinitionLabel, fixedTooltipDefinition);
  fixedTooltipPathHeader.append(fixedTooltipPathLabel, fixedTooltipPathMeta);
  fixedTooltipPathSection.append(fixedTooltipPathHeader, fixedTooltipPath);

  fixedTooltip.append(
    fixedTooltipHeader,
    fixedTooltipDefinitionSection,
    fixedTooltipPathSection,
  );
  hostElement.appendChild(fixedTooltip);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      container.attr('transform', event.transform.toString());
    });

  viewport.call(zoom);
  const relationBadgePositions = new Map<RelationType, { x: number; y: number }>();
  let pendingRenderFrame: number | null = null;
  const definitionCache = new Map<string, Promise<string | null>>();
  let hoverRequestId = 0;
  const workspaceElement = hostElement.closest('.graph-stage') ?? hostElement.parentElement;

  function updateFixedTooltipOffset(): void {
    const filtersElement = workspaceElement?.querySelector('.container__switches');
    const hostRect = hostElement.getBoundingClientRect();
    const filtersRect = filtersElement?.getBoundingClientRect();
    const minimumTop = 20;
    const verticalGap = 18;
    const nextTop = filtersRect
      ? Math.max(minimumTop, Math.round(filtersRect.bottom - hostRect.top + verticalGap))
      : minimumTop;

    fixedTooltip.style.setProperty('--graph-tooltip-top', `${nextTop}px`);
  }

  function createTooltipPathStep(line: string): HTMLDivElement {
    const isRelationLine = line.startsWith('↓');
    const stepElement = createElement(
      'div',
      `graph-node-tooltip__path-step ${isRelationLine ? 'graph-node-tooltip__path-step--relation' : 'graph-node-tooltip__path-step--node'}`,
    );
    const markerElement = createElement(
      'span',
      `graph-node-tooltip__path-marker ${isRelationLine ? 'graph-node-tooltip__path-marker--relation' : 'graph-node-tooltip__path-marker--node'}`,
    );
    const contentElement = createElement(
      'span',
      isRelationLine ? 'graph-node-tooltip__hop-relation' : 'graph-node-tooltip__hop-node',
    );

    markerElement.textContent = isRelationLine ? '↓' : '•';
    contentElement.textContent = isRelationLine ? line.replace(/^↓\s*/u, '') : line;
    stepElement.append(markerElement, contentElement);

    return stepElement;
  }

  function clearHoverPath(): void {
    hoverRequestId += 1;
    linkGlow.classed('is-highlighted', false).classed('is-muted', false);
    link.classed('is-highlighted', false).classed('is-muted', false);
    nodeGroup.classed('is-highlighted', false).classed('is-muted', false);
    clusterHull.classed('is-highlighted', false);
    relationBadge.classed('is-highlighted', false);
    fixedTooltip.classList.remove('is-visible');
  }

  function showNodeHover(node: LexicalNode): void {
    const requestId = hoverRequestId + 1;
    hoverRequestId = requestId;
    const path = getHoverPath(node, parentLinkByTarget);
    const directChildLinks = data.links.filter((linkItem) => getEndpointId(linkItem.source) === node.id);
    directChildLinks.forEach((linkItem) => {
      path.linkIds.add(getLinkId(linkItem));
      path.nodeIds.add(getEndpointId(linkItem.target));
    });
    const relation = node.relation;
    linkGlow
      .classed('is-highlighted', (d) => path.linkIds.has(getLinkId(d)))
      .classed('is-muted', (d) => !path.linkIds.has(getLinkId(d)));
    link
      .classed('is-highlighted', (d) => path.linkIds.has(getLinkId(d)))
      .classed('is-muted', (d) => !path.linkIds.has(getLinkId(d)));
    nodeGroup
      .classed('is-highlighted', (d) => path.nodeIds.has(d.id))
      .classed('is-muted', (d) => !path.nodeIds.has(d.id));
    clusterHull.classed('is-highlighted', (d) => Boolean(relation && d.relation === relation));
    relationBadge.classed('is-highlighted', (d) => Boolean(relation && d.relation === relation));

    updateFixedTooltipOffset();
    fixedTooltip.classList.add('is-visible');
    fixedTooltipEyebrow.textContent = node.kind === 'root'
      ? 'Selected lemma'
      : node.kind === 'bridge'
        ? 'Intermediate synset'
        : 'Hovered term';
    fixedTooltipTitle.textContent = truncateLabel(getSemanticLabel(node), 56);
    fixedTooltipRelation.textContent = node.relation ? formatRelationLabel(node.relation) : 'root';
    const depthDescription = getDepthDescription(node, parentLinkByTarget, nodeById);
    fixedTooltipDepth.textContent = depthDescription.depthLine;
    fixedTooltipBranching.textContent = directChildLinks.length > 0
      ? `${directChildLinks.length} child ${directChildLinks.length === 1 ? 'node' : 'nodes'}`
      : 'Leaf node';
    fixedTooltipDefinition.textContent = node.kind === 'bridge'
      ? getSemanticDescription(node)
      : 'Loading definition...';
    const pathHopCount = depthDescription.hopLines.filter((line) => line.startsWith('↓')).length;
    fixedTooltipPathMeta.textContent = pathHopCount > 0
      ? `${pathHopCount} ${pathHopCount === 1 ? 'hop' : 'hops'}`
      : 'Origin';
    fixedTooltipPath.replaceChildren();
    depthDescription.hopLines.slice(0, 8).forEach((line) => {
      const lineElement = createTooltipPathStep(line);
      fixedTooltipPath.appendChild(lineElement);
    });
    if (depthDescription.hopLines.length > 8) {
      const overflowElement = createElement('div', 'graph-node-tooltip__path-overflow');
      overflowElement.textContent = `+ ${depthDescription.hopLines.length - 8} more path entries`;
      fixedTooltipPath.appendChild(overflowElement);
    }

    const definitionQuery = getDefinitionQuery(node);
    if (!definitionQuery) {
      return;
    }

    if (!definitionCache.has(definitionQuery)) {
      definitionCache.set(
        definitionQuery,
        WordnetAPI.getDefinitions(definitionQuery)
          .then(getFirstDefinition)
          .catch(() => null),
      );
    }

    void definitionCache.get(definitionQuery)?.then((definition) => {
      if (hoverRequestId !== requestId) {
        return;
      }

      fixedTooltipDefinition.textContent = definition ?? 'No WordNet definition available for this term.';
    });
  }

  nodeGroup
    .on('pointerenter', (_event, node) => showNodeHover(node))
    .on('pointerleave', clearHoverPath)
    .on('click', (event, node) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = getNavigationTarget(node);
      if (target) {
        onNavigate?.(target);
      }
    });

  function renderGraph(): void {
    pendingRenderFrame = null;

    clusterHull.attr('d', (d) => getClusterPath(d, denseGraph));

    linkGlow
      .attr('x1', (d) => getLinkEndpoint(d.source).x ?? 0)
      .attr('y1', (d) => getLinkEndpoint(d.source).y ?? 0)
      .attr('x2', (d) => getLinkEndpoint(d.target).x ?? 0)
      .attr('y2', (d) => getLinkEndpoint(d.target).y ?? 0);

    link
      .attr('x1', (d) => getLinkEndpoint(d.source).x ?? 0)
      .attr('y1', (d) => getLinkEndpoint(d.source).y ?? 0)
      .attr('x2', (d) => getLinkEndpoint(d.target).x ?? 0)
      .attr('y2', (d) => getLinkEndpoint(d.target).y ?? 0);

    linkHit
      .attr('x1', (d) => getLinkEndpoint(d.source).x ?? 0)
      .attr('y1', (d) => getLinkEndpoint(d.source).y ?? 0)
      .attr('x2', (d) => getLinkEndpoint(d.target).x ?? 0)
      .attr('y2', (d) => getLinkEndpoint(d.target).y ?? 0);

    relationBadge.attr('transform', (d) => {
      const target = getClusterLabelPosition(d, denseGraph);
      const previous = relationBadgePositions.get(d.relation);
      const next = previous
        ? {
          x: previous.x + ((target.x - previous.x) * 0.22),
          y: previous.y + ((target.y - previous.y) * 0.22),
        }
        : target;
      relationBadgePositions.set(d.relation, next);
      return `translate(${next.x},${next.y})`;
    });

    nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

  }

  function scheduleRender(): void {
    if (pendingRenderFrame !== null) {
      return;
    }

    pendingRenderFrame = window.requestAnimationFrame(() => {
      renderGraph();
    });
  }

  function getDescendants(node: LexicalNode): LexicalNode[] {
    const descendants = new Map<string, LexicalNode>();
    const queue = [...(childMap.get(node.id) ?? [])];

    while (queue.length > 0) {
      const child = queue.shift();
      if (!child || descendants.has(child.id)) {
        continue;
      }

      descendants.set(child.id, child);
      queue.push(...(childMap.get(child.id) ?? []));
    }

    return [...descendants.values()];
  }

  function centerGraph(duration = 280): void {
    const liveNodes = data.nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
    if (liveNodes.length === 0) {
      return;
    }

    const minX = d3.min(liveNodes, (node) => (node.x ?? 0) - node.radius) ?? -width / 2;
    const maxX = d3.max(liveNodes, (node) => (node.x ?? 0) + node.radius) ?? width / 2;
    const minY = d3.min(liveNodes, (node) => (node.y ?? 0) - node.radius) ?? -height / 2;
    const maxY = d3.max(liveNodes, (node) => (node.y ?? 0) + node.radius + 18) ?? height / 2;
    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);
    const padding = 104;
    const scale = Math.min(
      1.15,
      Math.max(0.28, Math.min((width - padding * 2) / boundsWidth, (height - padding * 2) / boundsHeight)),
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    viewport.transition()
      .duration(duration)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(-centerX * scale, -centerY * scale)
          .scale(scale),
      );
  }

  renderGraph();
  centerGraph(hasCachedLayout ? 260 : 0);

  const simulation = d3.forceSimulation<LexicalNode>(data.nodes)
    .force('link', d3.forceLink<LexicalNode, LexicalLink>(data.links)
      .id((d) => d.id)
      .distance((d) => {
        const source = getLinkEndpoint(d.source);
        const target = getLinkEndpoint(d.target);
        if (source.kind === 'root') {
          return simulationProfile.linkRootDistance;
        }
        if (source.kind === 'bridge' || target.kind === 'bridge') {
          return simulationProfile.linkBridgeDistance;
        }
        return simulationProfile.linkWordDistance;
      })
      .strength((d) => {
        const source = getLinkEndpoint(d.source);
        const target = getLinkEndpoint(d.target);
        return source.kind === 'bridge' || target.kind === 'bridge' ? 0.42 : 0.28;
      }))
    .force('charge', d3.forceManyBody<LexicalNode>().strength((d) => {
      if (d.kind === 'root') {
        return simulationProfile.chargeRoot;
      }
      return d.kind === 'bridge' ? simulationProfile.chargeBridge : simulationProfile.chargeWord;
    }))
    .force('collide', d3.forceCollide<LexicalNode>()
      .radius((d) => {
        if (d.kind === 'bridge') {
          return d.radius + 14;
        }
        const labelRadius = d.kind === 'root' ? 34 : Math.min(54, 10 + getSemanticLabel(d).length * 1.8);
        return Math.max(d.radius + 12, labelRadius);
      })
      .iterations(simulationProfile.collideIterations))
    .force('center', d3.forceCenter(0, 0).strength(0.08))
    .force('balance', (alpha) => {
      const centerX = d3.mean(nonRootNodes, (node) => node.x ?? 0) ?? 0;
      const centerY = d3.mean(nonRootNodes, (node) => node.y ?? 0) ?? 0;

      nonRootNodes.forEach((node) => {
        node.vx = (node.vx ?? 0) - centerX * alpha * simulationProfile.balanceStrength;
        node.vy = (node.vy ?? 0) - centerY * alpha * simulationProfile.balanceStrength;
      });
    })
    .force('cluster', (alpha) => {
      clusters.forEach((cluster) => {
        const liveNodes = cluster.nodes;
        if (liveNodes.length === 0) {
          return;
        }

        const centerX = d3.mean(liveNodes, (node) => node.x ?? 0) ?? 0;
        const centerY = d3.mean(liveNodes, (node) => node.y ?? 0) ?? 0;
        liveNodes.forEach((node) => {
          node.vx = (node.vx ?? 0) + (centerX - (node.x ?? 0)) * alpha * simulationProfile.clusterStrength;
          node.vy = (node.vy ?? 0) + (centerY - (node.y ?? 0)) * alpha * simulationProfile.clusterStrength;
        });
      });
    })
    .force('x', d3.forceX<LexicalNode>((d) => d.layoutX ?? 0).strength((d) => {
      if (d.kind === 'root') {
        return 0.4;
      }
      return d.kind === 'bridge' ? 0.22 : simulationProfile.wordAnchorStrength;
    }))
    .force('y', d3.forceY<LexicalNode>((d) => d.layoutY ?? 0).strength((d) => {
      if (d.kind === 'root') {
        return 0.4;
      }
      return d.kind === 'bridge' ? 0.22 : simulationProfile.wordAnchorStrength;
    }))
    .alpha(hasCachedLayout ? 0.16 : 1)
    .alphaMin(simulationProfile.alphaMin)
    .alphaDecay(simulationProfile.alphaDecay)
    .velocityDecay(simulationProfile.velocityDecay)
    .on('tick', scheduleRender)
    .on('end', renderGraph);

  let dragState: {
    node: LexicalNode;
  } | null = null;

  const drag = d3.drag<SVGGElement, LexicalNode>()
    .on('start', (event, node) => {
      event.sourceEvent.stopPropagation();
      clearHoverPath();
      simulation.alphaTarget(0.24).restart();
      node.fx = node.x;
      node.fy = node.y;

      dragState = {
        node,
      };
      renderGraph();
    })
    .on('drag', (event, node) => {
      if (!dragState) {
        return;
      }

      node.x = event.x;
      node.y = event.y;
      node.fx = event.x;
      node.fy = event.y;
      node.layoutX = event.x;
      node.layoutY = event.y;
      renderGraph();
    })
    .on('end', (event, node) => {
      if (node.kind !== 'root') {
        node.fx = event.x;
        node.fy = event.y;
        node.layoutX = event.x;
        node.layoutY = event.y;
      }
      dragState = null;
      simulation.alphaTarget(0).alpha(Math.max(simulation.alpha(), 0.35)).restart();
      renderGraph();
    });

  nodeGroup
    .filter((d) => d.kind !== 'root')
    .call(drag);

  function reformatGraph(): void {
    layoutVariant += 1;
    const currentPositions = new Map(
      data.nodes.map((node) => [
        node.id,
        {
          x: node.x,
          y: node.y,
          layoutX: node.layoutX,
          layoutY: node.layoutY,
        },
      ]),
    );
    data.nodes.forEach((node) => {
      if (node.kind !== 'root') {
        node.fx = undefined;
        node.fy = undefined;
      }
    });
    seedLayout(data, width, height, layoutVariant);
    data.nodes.forEach((node) => {
      const currentPosition = currentPositions.get(node.id);
      if (!currentPosition || node.kind === 'root') {
        return;
      }

      const targetX = node.layoutX ?? currentPosition.x ?? 0;
      const targetY = node.layoutY ?? currentPosition.y ?? 0;
      const currentX = currentPosition.x ?? targetX;
      const currentY = currentPosition.y ?? targetY;
      node.x = currentX;
      node.y = currentY;
      node.layoutX = currentX + ((targetX - currentX) * 0.36);
      node.layoutY = currentY + ((targetY - currentY) * 0.36);
    });
    renderGraph();
    centerGraph(260);
    simulation.alpha(Math.max(simulation.alpha(), 0.42)).restart();
  }

  return {
    center: centerGraph,
    reformat: reformatGraph,
    destroy: () => {
      if (pendingRenderFrame !== null) {
        window.cancelAnimationFrame(pendingRenderFrame);
        pendingRenderFrame = null;
      }
      if (onPositionsChange) {
        onPositionsChange(new Map(data.nodes.map((node) => [
          node.id,
          {
            x: node.x,
            y: node.y,
            layoutX: node.layoutX,
            layoutY: node.layoutY,
            fx: node.fx,
            fy: node.fy,
          },
        ])));
      }
      simulation.stop();
      fixedTooltip.remove();
      svg.selectAll('*').remove();
    },
  };
}
