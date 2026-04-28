import { AimOutlined, PartitionOutlined } from '@ant-design/icons';
import { Button, Empty, Slider } from 'antd';
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { TypeToHierarchy } from '../../../api/types';
import { readCookie, writeCookie } from '../../../util/cookie';
import { isEmpty } from '../../../util/object';
import {
  buildLexicalGraph,
  drawLexicalGraph,
  LexicalGraphData,
  LexicalGraphHandle,
  LexicalNodePosition,
} from './D3Graph';
import './Graph.css';

const GRAPH_DEPTH_COOKIE = 'lexical_graph_depth';

function readDepthCookie(): number | null {
  const value = readCookie(GRAPH_DEPTH_COOKIE);
  const parsedValue = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function writeDepthCookie(depth: number): void {
  writeCookie(GRAPH_DEPTH_COOKIE, String(depth));
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

function getEndpointId(endpoint: string | { id: string }): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function getChildMap(graphData: LexicalGraphData): Map<string, string[]> {
  const childMap = new Map<string, string[]>();
  graphData.links.forEach((link) => {
    const sourceId = getEndpointId(link.source);
    const targetId = getEndpointId(link.target);
    childMap.set(sourceId, [...(childMap.get(sourceId) ?? []), targetId]);
  });
  return childMap;
}

function getDescendantWordLabels(
  nodeId: string,
  graphData: LexicalGraphData,
  childMap: Map<string, string[]>,
): string[] {
  const nodeById = new Map(graphData.nodes.map((node) => [node.id, node]));
  const labels: string[] = [];
  const visited = new Set<string>();
  const queue = [...(childMap.get(nodeId) ?? [])];

  while (queue.length > 0 && labels.length < 4) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const currentNode = nodeById.get(currentId);
    if (!currentNode) {
      continue;
    }

    if (currentNode.kind === 'word') {
      labels.push(currentNode.label);
      continue;
    }

    queue.push(...(childMap.get(currentId) ?? []));
  }

  return labels;
}

function getBoundaryLabel(labels: string[], relation?: string): string {
  if (labels.length > 0) {
    return `${labels.slice(0, 3).join(', ')} category`;
  }
  if (relation === 'hyponym') {
    return 'more specific category';
  }
  if (relation === 'hypernym') {
    return 'broader category';
  }
  return 'intermediate synset';
}

function getBoundaryDescription(labels: string[], hiddenChildCount: number, relation?: string): string {
  const relationLabel = relation ? relation.replace(/_/g, ' ') : 'semantic';
  const examples = labels.length > 0 ? ` Examples below this point include ${labels.slice(0, 3).join(', ')}.` : '';
  return `Depth boundary: this ${relationLabel} synset continues into ${hiddenChildCount} hidden child nodes.${examples}`;
}

function getSemanticDepth(node: { kind: string; depth: number }): number {
  if (node.kind === 'root') {
    return 0;
  }

  if (node.kind === 'word') {
    return Math.max(1, node.depth - 1);
  }

  return node.depth;
}

function normalizeGraphLinks(graphData: LexicalGraphData): LexicalGraphData {
  return {
    nodes: graphData.nodes.map((node) => ({ ...node })),
    links: graphData.links.map((link) => ({
      source: getEndpointId(link.source),
      target: getEndpointId(link.target),
      relation: link.relation,
    })),
  };
}

function simplifyBridgeNodes(graphData: LexicalGraphData): LexicalGraphData {
  const simplifiedGraph = normalizeGraphLinks(graphData);

  let changed = true;
  while (changed) {
    changed = false;

    const incomingLinks = new Map<string, typeof simplifiedGraph.links>();
    const outgoingLinks = new Map<string, typeof simplifiedGraph.links>();

    simplifiedGraph.links.forEach((link) => {
      const sourceId = getEndpointId(link.source);
      const targetId = getEndpointId(link.target);

      incomingLinks.set(targetId, [...(incomingLinks.get(targetId) ?? []), link]);
      outgoingLinks.set(sourceId, [...(outgoingLinks.get(sourceId) ?? []), link]);
    });

    const redundantBridge = simplifiedGraph.nodes.find((node) => {
      if (node.kind !== 'bridge' || node.isBoundary) {
        return false;
      }

      const incoming = incomingLinks.get(node.id) ?? [];
      const outgoing = outgoingLinks.get(node.id) ?? [];
      return incoming.length === 1 && outgoing.length === 1;
    });

    if (!redundantBridge) {
      continue;
    }

    const [incoming] = incomingLinks.get(redundantBridge.id) ?? [];
    const [outgoing] = outgoingLinks.get(redundantBridge.id) ?? [];
    if (!incoming || !outgoing) {
      continue;
    }

    const sourceId = getEndpointId(incoming.source);
    const targetId = getEndpointId(outgoing.target);
    const replacementLink = {
      source: sourceId,
      target: targetId,
      relation: outgoing.relation ?? incoming.relation,
    };

    simplifiedGraph.nodes = simplifiedGraph.nodes.filter((node) => node.id !== redundantBridge.id);
    simplifiedGraph.links = simplifiedGraph.links.filter((link) => {
      const linkSourceId = getEndpointId(link.source);
      const linkTargetId = getEndpointId(link.target);
      return linkSourceId !== sourceId || linkTargetId !== redundantBridge.id;
    }).filter((link) => {
      const linkSourceId = getEndpointId(link.source);
      const linkTargetId = getEndpointId(link.target);
      return linkSourceId !== redundantBridge.id || linkTargetId !== targetId;
    });

    const duplicateReplacement = simplifiedGraph.links.some((link) => (
      getEndpointId(link.source) === sourceId
      && getEndpointId(link.target) === targetId
      && (link.relation ?? incoming.relation) === replacementLink.relation
    ));

    if (!duplicateReplacement && sourceId !== targetId) {
      simplifiedGraph.links.push(replacementLink);
    }

    changed = true;
  }

  return simplifiedGraph;
}

function cloneGraphAtDepth(graphData: LexicalGraphData, maxDepth: number): LexicalGraphData {
  const childMap = getChildMap(graphData);
  const nodeIds = new Set(
    graphData.nodes
      .filter((node) => node.kind === 'root' || getSemanticDepth(node) <= maxDepth)
      .map((node) => node.id),
  );

  const nodes = graphData.nodes
    .filter((node) => nodeIds.has(node.id))
    .map((node) => {
      const depth = getSemanticDepth(node);
      const isBoundary = node.kind === 'bridge'
        && depth === maxDepth
        && (childMap.get(node.id) ?? []).some((childId) => !nodeIds.has(childId));

      return {
        id: node.id,
        label: node.label,
        relation: node.relation,
        kind: node.kind,
        radius: isBoundary ? 7.5 : node.radius,
        depth,
        isBoundary,
        semanticLabel: undefined,
        semanticDescription: undefined,
        fx: node.kind === 'root' ? 0 : undefined,
        fy: node.kind === 'root' ? 0 : undefined,
      };
    })
    .map((node) => {
      if (!node.isBoundary) {
        return node;
      }

      const labels = getDescendantWordLabels(node.id, graphData, childMap);
      const hiddenChildCount = (childMap.get(node.id) ?? []).filter((childId) => !nodeIds.has(childId)).length;
      return {
        ...node,
        semanticLabel: getBoundaryLabel(labels, node.relation),
        semanticDescription: getBoundaryDescription(labels, hiddenChildCount, node.relation),
      };
    });
  const links = graphData.links
    .map((link) => ({
      source: getEndpointId(link.source),
      target: getEndpointId(link.target),
      relation: link.relation,
    }))
    .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));

  return simplifyBridgeNodes({ nodes, links });
}

const Graph = (props: { data: TypeToHierarchy; lemma: string }): React.JSX.Element => {
  const { data, lemma } = props;
  const navigate = useNavigate();
  const stageRef = useRef<SVGSVGElement | null>(null);
  const graphHandleRef = useRef<LexicalGraphHandle | null>(null);
  const positionCacheRef = useRef<Map<string, LexicalNodePosition>>(new Map());
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const graphData = useMemo(() => simplifyBridgeNodes(buildLexicalGraph(data, lemma)), [data, lemma]);
  const maximumDepth = useMemo(
    () => Math.max(1, ...graphData.nodes.map((node) => getSemanticDepth(node))),
    [graphData],
  );
  const [visibleDepth, setVisibleDepth] = useState(() => readDepthCookie() ?? maximumDepth);
  const effectiveDepth = Math.min(Math.max(visibleDepth, 1), maximumDepth);
  const filteredGraphData = useMemo(
    () => cloneGraphAtDepth(graphData, effectiveDepth),
    [effectiveDepth, graphData],
  );
  const hasUsableSize = size.width > 0 && size.height > 0;

  useEffect(() => {
    setVisibleDepth((currentDepth) => Math.min(Math.max(currentDepth, 1), maximumDepth));
  }, [maximumDepth]);

  useEffect(() => {
    positionCacheRef.current.clear();
  }, [lemma]);

  const onDepthChange = (depth: number): void => {
    setVisibleDepth(depth);
    writeDepthCookie(depth);
  };

  useEffect(() => {
    if (!stageRef.current || !hasUsableSize || isEmpty(data)) {
      return undefined;
    }

    graphHandleRef.current = drawLexicalGraph({
      svgElement: stageRef.current,
      data: filteredGraphData,
      width: size.width,
      height: size.height,
      initialPositions: positionCacheRef.current,
      onPositionsChange: (positions) => {
        positionCacheRef.current = positions;
      },
      onNavigate: (word) => navigate(`/${word}`),
    });

    return () => {
      graphHandleRef.current?.destroy();
      graphHandleRef.current = null;
    };
  }, [data, filteredGraphData, hasUsableSize, lemma, navigate, size.height, size.width]);

  return (
    <div className="graph" ref={containerRef}>
      {isEmpty(data) ? (
        <Empty />
      ) : (
        <>
          <svg ref={stageRef} className="graph__stage" aria-label="Lexical graph" role="img" />
          <div className="graph-map-controls" aria-label="Graph controls">
            <Button
              aria-label="Reformat graph"
              icon={<PartitionOutlined />}
              onClick={() => graphHandleRef.current?.reformat()}
              title="Reformat graph"
            />
            <Button
              aria-label="Center graph"
              icon={<AimOutlined />}
              onClick={() => graphHandleRef.current?.center(320)}
              title="Center graph"
            />
            <div className="graph-depth-control" aria-label="Graph depth control">
              <div className="graph-depth-control__header">
                <span>Depth</span>
                <strong>{effectiveDepth}</strong>
              </div>
              <Slider
                min={1}
                max={maximumDepth}
                value={effectiveDepth}
                onChange={onDepthChange}
                tooltip={{ formatter: (value) => `Show ${value} hops` }}
                disabled={maximumDepth <= 1}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Graph;
