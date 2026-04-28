import {
  BookOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Button, Empty } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import {
  LemmaPosToHierarchy,
  LemmaToDefinition,
  POS,
  WiktionaryEntry,
} from '../../api/types';
import WordnetAPI from '../../api/WordnetAPI';
import { readCookie, writeCookie } from '../../util/cookie';
import { isEmpty } from '../../util/object';
import { getLemmaId } from '../../util/wordnet';
import Definition from './Definition';
import EmptyResult from './EmptyResult';
import LoadingSpin from './LoadingSpin';
import Viz from './Viz/Viz';

const SYNSETS_SIDEBAR_COOKIE = 'lexical_synsets_sidebar_open';
const SYNSETS_SIDEBAR_WIDTH_COOKIE = 'lexical_synsets_sidebar_width_ratio';
const DEFAULT_SYNSTES_SIDEBAR_RATIO = 0.34;
const MOBILE_BREAKPOINT_PX = 767;
const MIN_SYNSTES_SIDEBAR_WIDTH_PX = 20 * 16;
const MIN_GRAPH_STAGE_WIDTH_PX = 420;
const MAX_SYNSTES_SIDEBAR_RATIO = 0.52;

function readSynsetsSidebarCookie(): boolean {
  return readCookie(SYNSETS_SIDEBAR_COOKIE) === 'true';
}

function clampSynsetsSidebarRatio(ratio: number, viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return DEFAULT_SYNSTES_SIDEBAR_RATIO;
  }

  const minRatio = Math.min(0.9, MIN_SYNSTES_SIDEBAR_WIDTH_PX / viewportWidth);
  const maxRatio = Math.max(
    minRatio,
    Math.min(MAX_SYNSTES_SIDEBAR_RATIO, (viewportWidth - MIN_GRAPH_STAGE_WIDTH_PX) / viewportWidth),
  );

  if (!Number.isFinite(ratio)) {
    return Math.min(Math.max(DEFAULT_SYNSTES_SIDEBAR_RATIO, minRatio), maxRatio);
  }

  return Math.min(Math.max(ratio, minRatio), maxRatio);
}

function readSynsetsSidebarWidthCookie(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SYNSTES_SIDEBAR_RATIO;
  }

  const value = readCookie(SYNSETS_SIDEBAR_WIDTH_COOKIE);
  const parsedValue = value ? Number.parseFloat(value) : Number.NaN;
  return clampSynsetsSidebarRatio(parsedValue, window.innerWidth);
}

function Content({ query }: { query: string }): React.JSX.Element {
  const [definitionsData, setDefinitionsData] = useState<LemmaToDefinition | null>(null);
  const [graphData, setGraphData] = useState<LemmaPosToHierarchy | null>(null);
  const [wiktionaryEntry, setWiktionaryEntry] = useState<WiktionaryEntry | null>(null);
  const [wiktionaryIsLoading, setWiktionaryIsLoading] = useState<boolean>(false);
  const [graphIsLoading, setGraphIsLoading] = useState<boolean>(false);
  const [currentLemma, setCurrentLemma] = useState<string | null>(null);
  const [synsetsOpen, setSynsetsOpen] = useState(readSynsetsSidebarCookie);
  const [synsetsSidebarRatio, setSynsetsSidebarRatio] = useState(readSynsetsSidebarWidthCookie);
  const [isResizingSynsetsSidebar, setIsResizingSynsetsSidebar] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startRatio: number } | null>(null);
  const synsetsSidebarRatioRef = useRef(synsetsSidebarRatio);

  useEffect(() => {
    synsetsSidebarRatioRef.current = synsetsSidebarRatio;
  }, [synsetsSidebarRatio]);

  useEffect(() => {
    const handleWindowResize = (): void => {
      if (window.innerWidth <= MOBILE_BREAKPOINT_PX) {
        return;
      }

      const nextRatio = clampSynsetsSidebarRatio(synsetsSidebarRatioRef.current, window.innerWidth);
      if (Math.abs(nextRatio - synsetsSidebarRatioRef.current) < 0.0001) {
        return;
      }

      synsetsSidebarRatioRef.current = nextRatio;
      setSynsetsSidebarRatio(nextRatio);
      writeCookie(SYNSETS_SIDEBAR_WIDTH_COOKIE, nextRatio.toFixed(4));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (!isResizingSynsetsSidebar) {
      return undefined;
    }

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const stopResize = (): void => {
      resizeStateRef.current = null;
      setIsResizingSynsetsSidebar(false);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      writeCookie(SYNSETS_SIDEBAR_WIDTH_COOKIE, synsetsSidebarRatioRef.current.toFixed(4));
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const deltaX = resizeState.startX - event.clientX;
      const nextRatio = clampSynsetsSidebarRatio(
        resizeState.startRatio + (deltaX / window.innerWidth),
        window.innerWidth,
      );
      synsetsSidebarRatioRef.current = nextRatio;
      setSynsetsSidebarRatio(nextRatio);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };
  }, [isResizingSynsetsSidebar]);

  useEffect(() => {
    setDefinitionsData(null);
    setGraphData(null);
    setWiktionaryEntry(null);
    setCurrentLemma(null);
    setGraphIsLoading(true);
    setWiktionaryIsLoading(true);

    let isCurrent = true;
    WordnetAPI.getRelations(query).then((graph) => {
      if (!isCurrent) {
        return;
      }
      setGraphData(graph);
      setGraphIsLoading(false);
    });
    WordnetAPI.getDefinitions(query).then((definitions) => {
      if (!isCurrent) {
        return;
      }
      setDefinitionsData(definitions);
      const firstLemma = Object.keys(definitions)[0];
      if (!firstLemma) {
        return;
      }
      const firstPos = Object.keys(definitions[firstLemma])[0];
      setCurrentLemma(getLemmaId(firstLemma, (firstPos as POS)));
    });
    WordnetAPI.getWiktionaryEntry(query)
      .then((entry) => {
        if (!isCurrent) {
          return;
        }
        setWiktionaryEntry(entry);
        setWiktionaryIsLoading(false);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setWiktionaryEntry(null);
        setWiktionaryIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [query]);

  if (definitionsData === null) {
    return <LoadingSpin />;
  }
  if (isEmpty(definitionsData)) {
    return <EmptyResult word={query} />;
  }

  const onClickLemma = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const { lemma } = event.currentTarget.dataset;
    if (lemma) {
      setCurrentLemma(lemma);
    }
  };

  const synsetsContent = currentLemma ? (
    <Definition
      def={definitionsData}
      onClick={onClickLemma}
      currentLemma={currentLemma}
      wiktionaryEntry={wiktionaryEntry}
      wiktionaryIsLoading={wiktionaryIsLoading}
    />
  ) : null;
  const synsetsVisible = synsetsOpen;
  const hasCurrentGraph = Boolean(currentLemma && graphData?.[currentLemma]);
  const workspaceStyle = {
    '--synsets-sidebar-width-ratio': String(synsetsSidebarRatio),
  } as React.CSSProperties & { '--synsets-sidebar-width-ratio': string };

  const setSynsetsVisible = (isVisible: boolean): void => {
    setSynsetsOpen(isVisible);
    writeCookie(SYNSETS_SIDEBAR_COOKIE, String(isVisible));
  };

  const onStartResizeSynsetsSidebar = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!synsetsVisible || window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      return;
    }

    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startRatio: synsetsSidebarRatioRef.current,
    };
    setIsResizingSynsetsSidebar(true);
  };

  return (
    <section
      className={`lexical-workspace${synsetsVisible ? ' lexical-workspace--synsets-visible' : ''}`}
      style={workspaceStyle}
    >
      <div className="workspace-actions">
        <Button
          icon={<BookOutlined />}
          onClick={() => {
            if (synsetsVisible) {
              setSynsetsVisible(false);
              return;
            }
            setSynsetsVisible(true);
          }}
        >
          Synsets
        </Button>
      </div>
      <div className="graph-stage">
        {graphIsLoading && <LoadingSpin />}
        {!graphIsLoading && hasCurrentGraph && currentLemma && graphData?.[currentLemma] && (
          <Viz fullData={graphData[currentLemma]} lemma={currentLemma} />
        )}
        {!graphIsLoading && currentLemma && graphData && !hasCurrentGraph && (
          <div className="graph-empty-state">
            <Empty
              description="No WordNet relation graph is available for this synset."
            />
          </div>
        )}
      </div>
      <aside
        className={`synsets-sidebar${synsetsVisible ? ' synsets-sidebar--visible' : ''}`}
        aria-hidden={!synsetsVisible}
        aria-label="Synsets"
      >
        <div
          className={`synsets-sidebar__resize-handle${isResizingSynsetsSidebar ? ' is-active' : ''}`}
          role="separator"
          aria-label="Resize the synsets sidebar"
          aria-orientation="vertical"
          onPointerDown={onStartResizeSynsetsSidebar}
        />
        <div className="synsets-sidebar__header">
          <h2>Synsets</h2>
          <div className="synsets-sidebar__actions">
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="Close synsets"
              tabIndex={synsetsVisible ? 0 : -1}
              onClick={() => {
                setSynsetsVisible(false);
              }}
            />
          </div>
        </div>
        <div className="synsets-sidebar__body">
          {synsetsContent}
        </div>
      </aside>
    </section>
  );
}

export default Content;
