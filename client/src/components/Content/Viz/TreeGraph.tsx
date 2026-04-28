import * as d3 from 'd3';
import { Empty } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LemmaToDefinition,
  POS,
  RelationType,
  TypeToHierarchy,
  HierarchyNode,
} from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';
import { isEmpty } from '../../../util/object';
import { replaceUnderscores, toRouteWord } from '../../../util/wordnet';
import './Graph.css';

type TreeNodeKind = 'root' | 'relation' | 'synset' | 'word';

type TreeGraphNode = {
  id: string;
  label: string;
  kind: TreeNodeKind;
  relation?: RelationType;
  navigationTarget?: string;
  children?: TreeGraphNode[];
};

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(Math.floor(entry.contentRect.width), 1),
        height: Math.max(Math.floor(entry.contentRect.height), 1),
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
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

function getRootLabel(lemma: string): string {
  const pos = lemma.substring(0, 1) as POS;
  return `${replaceUnderscores(lemma.substring(2))} (${WordnetAPI.posMap[pos]})`;
}

function formatRelationLabel(relation: RelationType): string {
  return relation.replace(/_/g, ' ');
}

function makeNodeId(prefix: string, counter: { value: number }): string {
  const id = `${prefix}-${counter.value}`;
  counter.value += 1;
  return id;
}

function buildTreeBranch(
  branch: HierarchyNode,
  relation: RelationType,
  counter: { value: number },
): TreeGraphNode | null {
  if (branch.label === '_SYNSET') {
    const children = (branch.children ?? [])
      .map((child) => buildTreeBranch(child, relation, counter))
      .filter((child): child is TreeGraphNode => Boolean(child));

    if (children.length === 0) {
      return null;
    }

    if (children.length === 1) {
      return children[0];
    }

    return {
      id: makeNodeId('tree-synset', counter),
      label: 'synset group',
      kind: 'synset',
      relation,
      children,
    };
  }

  return {
    id: makeNodeId('tree-word', counter),
    label: replaceUnderscores(branch.label),
    kind: 'word',
    relation,
    navigationTarget: branch.label,
    children: (branch.children ?? [])
      .map((child) => buildTreeBranch(child, relation, counter))
      .filter(isDefined),
  };
}

function buildTreeGraphData(data: TypeToHierarchy, lemma: string): TreeGraphNode {
  const counter = { value: 0 };
  const relationChildren = Object.entries(data)
    .map(([relationName, tree]) => {
      const relation = relationName as RelationType;
      const children = (tree.children ?? [])
        .map((child) => buildTreeBranch(child, relation, counter))
        .filter(isDefined);

      if (children.length === 0) {
        return null;
      }

      const relationNode: TreeGraphNode = {
        id: makeNodeId(`tree-relation-${relation}`, counter),
        label: formatRelationLabel(relation),
        kind: 'relation' as const,
        relation,
        children,
      };

      return relationNode;
    })
    .filter(isDefined);

  return {
    id: 'tree-root',
    label: getRootLabel(lemma),
    kind: 'root',
    children: relationChildren,
  };
}

function getNodeColor(node: TreeGraphNode): string {
  if (node.kind === 'root') {
    return '#ffffff';
  }
  if (node.relation) {
    return WordnetAPI.colors[node.relation] ?? '#68a6c7';
  }
  return '#68a6c7';
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

function getSemanticLabel(node: TreeGraphNode): string {
  if (node.kind === 'synset') {
    return 'intermediate synset';
  }
  return node.label;
}

function getSemanticDescription(node: TreeGraphNode): string {
  if (node.kind === 'root') {
    return 'selected WordNet concept';
  }
  if (node.kind === 'relation') {
    return `${node.label} lexical branch`;
  }
  if (node.kind === 'synset') {
    return getSpecificityDescription(node.relation);
  }
  return 'WordNet lemma in this semantic path';
}

function getDefinitionQuery(node: TreeGraphNode): string | null {
  if (node.kind === 'synset' || node.kind === 'relation') {
    return null;
  }

  const label = node.kind === 'root'
    ? node.label.replace(/\s+\([^)]*\)$/u, '')
    : node.navigationTarget ?? node.label;

  return label.trim().replace(/\s+/gu, '_') || null;
}

function getTooltipEyebrow(node: TreeGraphNode): string {
  if (node.kind === 'root') {
    return 'Selected lemma';
  }
  if (node.kind === 'relation') {
    return 'Relation branch';
  }
  if (node.kind === 'synset') {
    return 'Intermediate synset';
  }
  return 'Hovered term';
}

function createTooltipPathLines(pathNodes: TreeGraphNode[]): string[] {
  if (pathNodes.length === 0) {
    return [];
  }

  const lines = [`${getSemanticLabel(pathNodes[0])} — ${getSemanticDescription(pathNodes[0])}`];
  let activeRelationLabel: string | null = null;

  pathNodes.slice(1).forEach((node) => {
    const nextRelationLabel = node.kind === 'relation'
      ? node.label
      : node.relation
        ? node.relation.replace(/_/gu, ' ')
        : activeRelationLabel;

    if (nextRelationLabel && nextRelationLabel !== activeRelationLabel) {
      lines.push(`↓ ${nextRelationLabel}`);
      activeRelationLabel = nextRelationLabel;
    }

    lines.push(`${getSemanticLabel(node)} — ${getSemanticDescription(node)}`);
  });

  return lines;
}

type HoverState = {
  nodeId: string;
  highlightedNodeIds: Set<string>;
  highlightedLinkIds: Set<string>;
  node: TreeGraphNode;
  pathLines: string[];
  depthLine: string;
  pathHopCount: number;
  branchingLabel: string;
};

type TreeGraphProps = {
  data: TypeToHierarchy;
  lemma: string;
};

export default function TreeGraph({ data, lemma }: TreeGraphProps): React.JSX.Element {
  const navigate = useNavigate();
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const definitionCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverDefinition, setHoverDefinition] = useState<string>('');
  const [tooltipTop, setTooltipTop] = useState(20);

  const treeRoot = useMemo(() => buildTreeGraphData(data, lemma), [data, lemma]);
  const layout = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return null;
    }

    const hierarchy = d3.hierarchy<TreeGraphNode>(treeRoot);
    const treeLayout = d3.tree<TreeGraphNode>()
      .nodeSize([52, 146])
      .separation((leftNode, rightNode) => {
        if (leftNode.parent === rightNode.parent) {
          if (leftNode.depth <= 1) {
            return 0.8;
          }
          return leftNode.data.kind === 'word' && rightNode.data.kind === 'word' ? 0.68 : 0.78;
        }

        return 0.92;
      });
    const root = treeLayout(hierarchy);
    const descendants = root.descendants();
    const links = root.links();
    const minX = d3.min(descendants, (node) => node.x) ?? 0;
    const maxX = d3.max(descendants, (node) => node.x) ?? 0;
    const minY = d3.min(descendants, (node) => node.y) ?? 0;
    const maxY = d3.max(descendants, (node) => node.y) ?? 0;
    const bounds = {
      minX: minY,
      maxX: maxY,
      minY: minX,
      maxY: maxX,
    };
    const nodeById = new Map(descendants.map((node) => [node.data.id, node]));

    return {
      descendants,
      links,
      bounds,
      nodeById,
      linkPath: d3.linkHorizontal<d3.HierarchyPointLink<TreeGraphNode>, d3.HierarchyPointNode<TreeGraphNode>>()
        .x((point) => point.y)
        .y((point) => point.x),
    };
  }, [size.height, size.width, treeRoot]);

  const hoverState = useMemo<HoverState | null>(() => {
    if (!layout || !hoveredNodeId) {
      return null;
    }

    const hoveredNode = layout.nodeById.get(hoveredNodeId);
    if (!hoveredNode) {
      return null;
    }

    const highlightedNodeIds = new Set<string>();
    const highlightedLinkIds = new Set<string>();
    const pathNodes = hoveredNode.ancestors().reverse();

    pathNodes.forEach((node) => {
      highlightedNodeIds.add(node.data.id);
      if (node.parent) {
        highlightedLinkIds.add(`${node.parent.data.id}->${node.data.id}`);
      }
    });

    (hoveredNode.children ?? []).forEach((childNode) => {
      highlightedNodeIds.add(childNode.data.id);
      highlightedLinkIds.add(`${hoveredNode.data.id}->${childNode.data.id}`);
    });

    const pathLines = createTooltipPathLines(pathNodes.map((node) => node.data));
    const pathHopCount = pathLines.filter((line) => line.startsWith('↓')).length;
    const directChildCount = hoveredNode.children?.length ?? 0;

    return {
      nodeId: hoveredNode.data.id,
      highlightedNodeIds,
      highlightedLinkIds,
      node: hoveredNode.data,
      pathLines,
      depthLine: `Depth ${hoveredNode.depth}: ${pathHopCount} ${pathHopCount === 1 ? 'hop' : 'hops'} from root`,
      pathHopCount,
      branchingLabel: directChildCount > 0
        ? `${directChildCount} child ${directChildCount === 1 ? 'node' : 'nodes'}`
        : 'Leaf node',
    };
  }, [hoveredNodeId, layout]);

  useEffect(() => {
    if (!hoverState) {
      setHoverDefinition('');
      return;
    }

    const definitionQuery = getDefinitionQuery(hoverState.node);
    if (!definitionQuery) {
      setHoverDefinition(getSemanticDescription(hoverState.node));
      return;
    }

    setHoverDefinition('Loading definition...');
    if (!definitionCacheRef.current.has(definitionQuery)) {
      definitionCacheRef.current.set(
        definitionQuery,
        WordnetAPI.getDefinitions(definitionQuery)
          .then(getFirstDefinition)
          .catch(() => null),
      );
    }

    let isCurrent = true;
    void definitionCacheRef.current.get(definitionQuery)?.then((definition) => {
      if (!isCurrent) {
        return;
      }

      setHoverDefinition(definition ?? 'No WordNet definition available for this term.');
    });

    return () => {
      isCurrent = false;
    };
  }, [hoverState]);

  useEffect(() => {
    if (!hoverState || !containerRef.current) {
      return;
    }

    const workspaceElement = containerRef.current.closest('.graph-stage') ?? containerRef.current.parentElement;
    const filtersElement = workspaceElement?.querySelector('.container__switches');
    const hostRect = containerRef.current.getBoundingClientRect();
    const filtersRect = filtersElement?.getBoundingClientRect();
    const minimumTop = 20;
    const verticalGap = 18;
    const nextTop = filtersRect
      ? Math.max(minimumTop, Math.round(filtersRect.bottom - hostRect.top + verticalGap))
      : minimumTop;

    setTooltipTop(nextTop);
  }, [hoverState, size.height, size.width]);

  useEffect(() => {
    if (!layout || !svgRef.current || !viewportRef.current) {
      return undefined;
    }

    const svgSelection = d3.select(svgRef.current);
    const viewportSelection = d3.select(viewportRef.current);
    const marginX = 36;
    const marginY = 42;
    const contentWidth = Math.max(layout.bounds.maxX - layout.bounds.minX, 1);
    const contentHeight = Math.max(layout.bounds.maxY - layout.bounds.minY, 1);
    const scaleX = (size.width - (marginX * 2)) / contentWidth;
    const scaleY = (size.height - (marginY * 2)) / contentHeight;
    const fitScale = Math.max(0.36, Math.min(scaleX, scaleY, 1.08));
    const translateX = ((size.width - (contentWidth * fitScale)) / 2) - (layout.bounds.minX * fitScale);
    const translateY = ((size.height - (contentHeight * fitScale)) / 2) - (layout.bounds.minY * fitScale);
    const initialTransform = d3.zoomIdentity.translate(translateX, translateY).scale(fitScale);

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.32, 2.8])
      .on('zoom', (event) => {
        viewportSelection.attr('transform', event.transform.toString());
      });

    svgSelection.call(zoomBehavior);
    svgSelection.call(zoomBehavior.transform, initialTransform);

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, [layout, size.height, size.width]);

  return (
    <div className="graph graph--tree" ref={containerRef}>
      {isEmpty(data) || !layout ? (
        <Empty />
      ) : (
        <div className="graph-tree__scroller">
          <svg
            ref={svgRef}
            className="graph-tree__stage"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label="Lexical tree"
          >
            <g ref={viewportRef}>
              <g className="graph-tree__links">
                {layout.links.map((link) => (
                  <path
                    key={`${link.source.data.id}-${link.target.data.id}`}
                    className={`graph-tree__link graph-tree__link--${link.target.data.kind}${hoverState
                      ? hoverState.highlightedLinkIds.has(`${link.source.data.id}->${link.target.data.id}`)
                        ? ' is-highlighted'
                        : ' is-muted'
                      : ''}`}
                    d={layout.linkPath(link) ?? undefined}
                    stroke={getNodeColor(link.target.data)}
                  />
                ))}
              </g>
              <g className="graph-tree__nodes">
                {layout.descendants.map((node) => {
                  const color = getNodeColor(node.data);
                  const isWord = node.data.kind === 'word';

                  return (
                    <g
                      key={node.data.id}
                      className={`graph-tree__node graph-tree__node--${node.data.kind}${isWord ? ' is-clickable' : ''}${hoverState
                        ? hoverState.highlightedNodeIds.has(node.data.id)
                          ? ' is-highlighted'
                          : ' is-muted'
                        : ''}`}
                      transform={`translate(${node.y}, ${node.x})`}
                      onPointerEnter={() => setHoveredNodeId(node.data.id)}
                      onPointerLeave={() => setHoveredNodeId(null)}
                      onClick={() => {
                        if (!node.data.navigationTarget) {
                          return;
                        }

                        navigate(`/${toRouteWord(node.data.navigationTarget)}`);
                      }}
                    >
                      {node.data.kind === 'word' ? (
                        <>
                          <circle className="graph-tree__dot" r={5.2} fill={color} />
                          <text className="graph-tree__label" x={12} y={4}>{node.data.label}</text>
                        </>
                      ) : (
                        <>
                          <circle
                            className={`graph-tree__hub graph-tree__hub--${node.data.kind}`}
                            r={node.data.kind === 'root' ? 12 : node.data.kind === 'relation' ? 8.5 : 6.5}
                            fill={color}
                          />
                          {node.data.kind !== 'synset' ? (
                            <text className="graph-tree__label graph-tree__label--hub" x={16} y={4}>{node.data.label}</text>
                          ) : null}
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
          {hoverState ? (
            <div
              className="graph-node-tooltip graph-node-tooltip--fixed is-visible"
              style={{ '--graph-tooltip-top': `${tooltipTop}px` } as React.CSSProperties}
              aria-live="polite"
            >
              <div className="graph-node-tooltip__header">
                <div className="graph-node-tooltip__eyebrow">{getTooltipEyebrow(hoverState.node)}</div>
                <div className="graph-node-tooltip__title">{getSemanticLabel(hoverState.node)}</div>
                <div className="graph-node-tooltip__meta">
                  <div className="graph-node-tooltip__relation">{hoverState.node.relation ? formatRelationLabel(hoverState.node.relation) : 'root'}</div>
                  <div className="graph-node-tooltip__depth">{hoverState.depthLine}</div>
                  <div className="graph-node-tooltip__branching">{hoverState.branchingLabel}</div>
                </div>
              </div>
              <div className="graph-node-tooltip__section">
                <div className="graph-node-tooltip__section-label">Definition</div>
                <div className="graph-node-tooltip__definition">{hoverDefinition}</div>
              </div>
              <div className="graph-node-tooltip__section graph-node-tooltip__section--path">
                <div className="graph-node-tooltip__section-header">
                  <div className="graph-node-tooltip__section-label">Traversal path</div>
                  <div className="graph-node-tooltip__section-meta">
                    {hoverState.pathHopCount > 0 ? `${hoverState.pathHopCount} ${hoverState.pathHopCount === 1 ? 'hop' : 'hops'}` : 'Origin'}
                  </div>
                </div>
                <div className="graph-node-tooltip__path">
                  {hoverState.pathLines.slice(0, 8).map((line) => {
                    const isRelationLine = line.startsWith('↓');
                    return (
                      <div
                        key={`${hoverState.nodeId}_${line}`}
                        className={`graph-node-tooltip__path-step ${isRelationLine ? 'graph-node-tooltip__path-step--relation' : 'graph-node-tooltip__path-step--node'}`}
                      >
                        <span className={`graph-node-tooltip__path-marker ${isRelationLine ? 'graph-node-tooltip__path-marker--relation' : 'graph-node-tooltip__path-marker--node'}`}>
                          {isRelationLine ? '↓' : '•'}
                        </span>
                        <span className={isRelationLine ? 'graph-node-tooltip__hop-relation' : 'graph-node-tooltip__hop-node'}>
                          {isRelationLine ? line.replace(/^↓\s*/u, '') : line}
                        </span>
                      </div>
                    );
                  })}
                  {hoverState.pathLines.length > 8 ? (
                    <div className="graph-node-tooltip__path-overflow">
                      {`+ ${hoverState.pathLines.length - 8} more path entries`}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}