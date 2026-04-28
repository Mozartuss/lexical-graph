import { Button } from 'antd';
import React, { useEffect, useState } from 'react';
import { RelationType, TypeToHierarchy } from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';
import { readCookie, writeCookie } from '../../../util/cookie';
import { deleteKey, hasOwnProperty } from '../../../util/object';
import Graph from './Graph';
import SwitchGroup from './SwitchGroup';
import TreeGraph from './TreeGraph';

type GraphViewMode = 'network' | 'tree';

const GRAPH_VIEW_COOKIE = 'lexical_graph_view_mode';

function readGraphViewModeCookie(): GraphViewMode {
  return readCookie(GRAPH_VIEW_COOKIE) === 'tree' ? 'tree' : 'network';
}

function Viz(props: { fullData: TypeToHierarchy; lemma: string }): React.JSX.Element {
  const { fullData, lemma } = props;
  const [displayData, setDisplayData] = useState<TypeToHierarchy | null>(null);
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>(readGraphViewModeCookie);
  const availableRelationTypes = WordnetAPI.RELATION_TYPES.filter((type) => hasOwnProperty(fullData, type));

  useEffect(() => {
    setDisplayData(fullData);
  }, [fullData, lemma]);

  const onChange = (type: RelationType, switched: boolean): void => {
    if (switched) {
      if (displayData && hasOwnProperty(displayData, type)) {
        return;
      }
      if (!fullData || !hasOwnProperty(fullData, type)) {
        return;
      }
      if (displayData) {
        setDisplayData({
          ...displayData,
          [type]: fullData[type],
        });
      } else {
        setDisplayData({ [type]: fullData[type] });
      }
    } else {
      if (!displayData || !hasOwnProperty(displayData, type)) {
        return;
      }
      setDisplayData(deleteKey(displayData, type));
    }
  };

  const onSelectGraphView = (mode: GraphViewMode): void => {
    setGraphViewMode(mode);
    writeCookie(GRAPH_VIEW_COOKIE, mode);
  };

  return (
    <>
      <div className="container__switches" aria-label="Graph relation filters">
        <div className="switches-panel">
          <div className="switches-panel__header">
            <span className="switches-panel__eyebrow">Graph filters</span>
            <div className="switches-panel__title-row">
              <strong className="switches-panel__title">Relations</strong>
              <span className="switches-panel__count">{availableRelationTypes.length}</span>
            </div>
            <div className="switches-panel__modes" role="tablist" aria-label="Graph display mode">
              <Button
                size="small"
                type={graphViewMode === 'network' ? 'primary' : 'default'}
                className="switches-panel__mode-button"
                aria-pressed={graphViewMode === 'network'}
                onClick={() => onSelectGraphView('network')}
              >
                Network
              </Button>
              <Button
                size="small"
                type={graphViewMode === 'tree' ? 'primary' : 'default'}
                className="switches-panel__mode-button"
                aria-pressed={graphViewMode === 'tree'}
                onClick={() => onSelectGraphView('tree')}
              >
                Tree
              </Button>
            </div>
          </div>
          <ul className="switches">
            {availableRelationTypes.map((type) => (
              <li key={type} className={hasOwnProperty(displayData || {}, type) ? 'is-active' : ''}>
                <SwitchGroup
                  type={type}
                  onChange={onChange}
                  checked={hasOwnProperty(displayData || {}, type)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {displayData && (graphViewMode === 'tree'
        ? <TreeGraph data={displayData} lemma={lemma} />
        : <Graph data={displayData} lemma={lemma} />)}
    </>
  );
}

export default Viz;
