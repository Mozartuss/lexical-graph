import { Button, Divider, Skeleton } from 'antd';
import React from 'react';
import { Link } from 'react-router-dom';
import {
  LemmaToDefinition,
  POS,
  PosToGlosses,
  SynsetDefinition,
  WiktionaryEntry,
} from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';
import { getLemmaId, replaceUnderscores, toRouteWord } from '../../../util/wordnet';
import { OnClick } from '../../types';
import './Definition.css';
import DefinitionTitle from './DefinitionTitle';

type GlossesProps = { data: LemmaToDefinition; onClick: OnClick; currentLemma: string };
const Glosses = (props: GlossesProps): React.JSX.Element => {
  const { data, onClick, currentLemma } = props;
  const lemmata = Object.keys(data);
  return (
    <div>
      {lemmata.map((lemma, lemmaIndex) => {
        const posToGlosses: PosToGlosses = data[lemma];
        return (
          <div key={lemma} className="lemma-section">
            {Object.keys(posToGlosses).map((pos: string) => {
              // @ts-ignore
              const glosses: SynsetDefinition[] = posToGlosses[pos];
              const lemmaId = getLemmaId(lemma, (pos as POS));
              const isCurrentLemma = currentLemma === lemmaId;
              return (
                <article key={`${lemma}_${pos}_container`} className="dictionary-entry">
                  <header className="dictionary-entry__header">
                    <div className="dictionary-entry__topline">
                      <div className="dictionary-entry__wordline">
                        <h3 className="dictionary-entry__lemma">{replaceUnderscores(lemma)}</h3>
                        <span className="dictionary-entry__pos">{WordnetAPI.posMap[(pos as POS)]}</span>
                      </div>
                      {!isCurrentLemma && (
                        <Button
                          size="small"
                          type="primary"
                          className="show-button"
                          onClick={onClick}
                          data-lemma={lemmaId}
                        >
                          Show relations
                        </Button>
                      )}
                      {isCurrentLemma && (
                        <Button
                          size="small"
                          type="default"
                          className="show-button"
                          onClick={onClick}
                          disabled
                        >
                          Relations are shown
                        </Button>
                      )}
                    </div>
                    <div className="dictionary-entry__meta">
                      <span>
                        {glosses.length}
                        {' '}
                        {glosses.length === 1 ? 'sense' : 'senses'}
                      </span>
                    </div>
                  </header>
                  <ol key={pos} className="dictionary-senses">
                    {glosses.map(({ gloss, terms, examples }, senseIndex) => {
                      const key = `${pos}_def_${gloss}}`;
                      return (
                        <li key={`${key}_gloss`} className="dictionary-sense">
                          <div className="dictionary-sense__number">
                            {senseIndex + 1}
                          </div>
                          <div className="dictionary-sense__body">
                            <p className="dictionary-sense__definition">
                              {gloss}
                            </p>
                            {examples && examples.length > 0 && (
                              <div key={`${key}_examples`} className="dictionary-sense__examples">
                                <span className="dictionary-sense__label">Examples</span>
                                <ul>
                                  {examples.map((example) => (
                                    <li key={`${key}_${example.substring(0, 15)}`}>
                                      <q>{example}</q>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {terms && terms.length > 0 && (
                              <div key={`${key}_links`} className="dictionary-sense__terms">
                                <span className="dictionary-sense__label">Also in this synset</span>
                                <ul>
                                  {terms.map((term: string) => (
                                    <li key={`${key}_links_${term}`}>
                                      <Link to={`/${toRouteWord(term)}`}>
                                        {term}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
            {lemmata.length > 1 && lemmaIndex < lemmata.length - 1 && <Divider />}
          </div>
        );
      })}
    </div>
  );
};

function WiktionaryList({ title, items }: { title: string; items: string[] }): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="dictionary-sense__terms wiktionary-block__list">
      <span className="wiktionary-block__label">{title}</span>
      <ul>
        {items.slice(0, 12).map((item) => (
          <li key={`${title}_${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type ParsedPronunciation = {
  enpr?: string;
  ipa: string[];
  extras: Array<{ label: string; value: string }>;
};

function normalizePronunciationItems(pronunciations: string[]): ParsedPronunciation {
  const combined = pronunciations.join(' ');
  const ipa = [...combined.matchAll(/\/[^/]+\/|\[[^\]]+\]/gu)]
    .map((match) => match[0].trim())
    .filter(Boolean)
    .slice(0, 4);
  const extras: Array<{ label: string; value: string }> = [];
  const enpr = combined.match(/enPR:?\s*([^,]+?)(?=\s+(?:IPA|Homophone|Rhymes)\b|,|$)/u)?.[1]?.trim();

  const homophone = combined.match(/Homophone:\s*([^]+?)(?=\s+Rhymes:|$)/u)?.[1]?.trim();
  if (homophone) {
    extras.push({ label: 'Homophone', value: homophone });
  }

  const rhyme = combined.match(/Rhymes:\s*([^, ]+)/u)?.[1]?.trim();
  if (rhyme) {
    extras.push({ label: 'Rhyme', value: rhyme });
  }

  return {
    enpr,
    ipa: [...new Set(ipa)],
    extras,
  };
}

function WiktionaryPanel({
  entry,
  isLoading,
}: {
  entry: WiktionaryEntry | null;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <section className="wiktionary-block dictionary-entry">
        <header className="dictionary-entry__header">
          <div className="dictionary-entry__wordline">
            <h3 className="dictionary-entry__lemma">Wiktionary</h3>
            <span className="dictionary-entry__pos">Reference</span>
          </div>
        </header>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </section>
    );
  }

  if (!entry) {
    return (
      <section className="wiktionary-block dictionary-entry">
        <header className="dictionary-entry__header">
          <div className="dictionary-entry__wordline">
            <h3 className="dictionary-entry__lemma">Wiktionary</h3>
            <span className="dictionary-entry__pos">Reference</span>
          </div>
        </header>
        <p className="wiktionary-block__empty">No Wiktionary linguistic data found.</p>
      </section>
    );
  }

  const pronunciation = normalizePronunciationItems(entry.pronunciations);

  return (
    <section className="wiktionary-block dictionary-entry">
      <header className="dictionary-entry__header wiktionary-block__header">
        <div className="dictionary-entry__wordline">
          <h3 className="dictionary-entry__lemma">Wiktionary</h3>
          <span className="dictionary-entry__pos">Reference</span>
        </div>
        <div className="dictionary-entry__meta">
          <span>
            {entry.senses.length}
            {' '}
            parsed senses
          </span>
        </div>
        <a href={entry.sourceUrl} target="_blank" rel="noreferrer">Source</a>
      </header>
      {(pronunciation.enpr || pronunciation.ipa.length > 0 || pronunciation.extras.length > 0) && (
        <div className="wiktionary-block__pronunciation">
          <span className="wiktionary-block__label">Pronunciation</span>
          <div className="wiktionary-pronunciation">
            {pronunciation.ipa.length > 0 && (
              <div className="wiktionary-pronunciation__row">
                <span className="wiktionary-pronunciation__label">IPA</span>
                <div className="wiktionary-pronunciation__values">
                  {pronunciation.ipa.map((item) => (
                    <span key={item} className="wiktionary-pronunciation__token wiktionary-pronunciation__token--ipa">{item}</span>
                  ))}
                </div>
              </div>
            )}
            {pronunciation.enpr && (
              <div className="wiktionary-pronunciation__row">
                <span className="wiktionary-pronunciation__label">enPR</span>
                <div className="wiktionary-pronunciation__values">
                  <span className="wiktionary-pronunciation__token">{pronunciation.enpr}</span>
                </div>
              </div>
            )}
            {pronunciation.extras.map((item) => (
              <div key={`${item.label}_${item.value}`} className="wiktionary-pronunciation__row">
                <span className="wiktionary-pronunciation__label">{item.label}</span>
                <div className="wiktionary-pronunciation__values">
                  <span className="wiktionary-pronunciation__token">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <WiktionaryList title="Alternative forms" items={entry.alternativeForms ?? []} />
      {entry.etymology && (
        <div className="dictionary-sense__terms wiktionary-block__section">
          <span className="dictionary-sense__label">Etymology</span>
          <p>{entry.etymology}</p>
        </div>
      )}
      <WiktionaryList title="Forms" items={entry.forms} />
      <WiktionaryList title="Synonyms" items={entry.synonyms ?? []} />
      <WiktionaryList title="Hypernyms" items={entry.hypernyms ?? []} />
      <WiktionaryList title="Hyponyms" items={entry.hyponyms ?? []} />
      <WiktionaryList title="Meronyms" items={entry.meronyms ?? []} />
      <WiktionaryList title="Holonyms" items={entry.holonyms ?? []} />
      {entry.senses.length > 0 && (
        <div className="wiktionary-block__section">
          <ol className="dictionary-senses wiktionary-block__senses">
            {entry.senses.slice(0, 6).map((sense, senseIndex) => (
              <li key={`${sense.pos}_${sense.definition}`} className="dictionary-sense">
                <div className="dictionary-sense__number">{senseIndex + 1}</div>
                <div className="dictionary-sense__body">
                  <p className="dictionary-sense__definition">{sense.definition}</p>
                  <div className="dictionary-sense__terms wiktionary-sense__meta">
                    <span className="dictionary-sense__label">Sense metadata</span>
                    <ul>
                      <li>{sense.pos}</li>
                      {sense.labels.map((label) => (
                        <li key={`${sense.definition}_${label}`}>{label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <WiktionaryList title="Derived terms" items={entry.derivedTerms} />
      <WiktionaryList title="Related terms" items={entry.relatedTerms} />
      <WiktionaryList title="Descendants" items={entry.descendants} />
      <WiktionaryList title="See also" items={entry.seeAlso} />
    </section>
  );
}

type DefinitionProps = {
  def: LemmaToDefinition;
  onClick: OnClick;
  currentLemma: string;
  wiktionaryEntry: WiktionaryEntry | null;
  wiktionaryIsLoading: boolean;
};
const Definition = (props: DefinitionProps): React.JSX.Element => {
  const {
    def,
    onClick,
    currentLemma,
    wiktionaryEntry,
    wiktionaryIsLoading,
  } = props;
  return (
    <div className="synsets-panel">
      <DefinitionTitle />
      <Glosses data={def} onClick={onClick} currentLemma={currentLemma} />
      <WiktionaryPanel entry={wiktionaryEntry} isLoading={wiktionaryIsLoading} />
    </div>
  );
};

export default Definition;
