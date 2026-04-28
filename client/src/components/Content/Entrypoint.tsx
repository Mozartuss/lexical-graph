import { Layout } from 'antd';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Content from './Content';

function Entrypoint(): React.JSX.Element {
  const [query, setQuery] = useState<string | null>(null);
  const { urlWord } = useParams<{ urlWord?: string }>();

  useEffect(() => {
    setQuery(urlWord || null);
    if (urlWord) {
      document.title = `${urlWord} | Lexical Graph | Wordnet Visualisation`;
    }
  }, [urlWord]);

  return (
    <Layout.Content className="app-main">
      <div className="main__content">
        {query && <Content query={query} />}
        {!query && (
          <div className="empty-search-state">
            <h1>Explore WordNet as a lexical network</h1>
            <p>Search for a word to map its synsets and relations.</p>
          </div>
        )}
      </div>
    </Layout.Content>
  );
}

export default Entrypoint;
