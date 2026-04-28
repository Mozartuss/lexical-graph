import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Input, Layout, Spin } from 'antd';
import type { InputRef } from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LemmaSuggestion } from '../../api/types';
import WordnetAPI from '../../api/WordnetAPI';
import { toRouteWord } from '../../util/wordnet';
import './UI.css';

type HeaderProps = {
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
};

const Header = ({ themeMode, onToggleTheme }: HeaderProps): React.JSX.Element => {
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState<LemmaSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchVersion, setSearchVersion] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<InputRef | null>(null);
  const requestIdRef = useRef(0);
  const suggestionCacheRef = useRef<Map<string, LemmaSuggestion[]>>(new Map());
  const searchFieldName = useMemo(
    () => `lexical-graph-search-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  const routeWord = useMemo(() => {
    const nextPath = location.pathname.replace(/^\/+|\/+$/gu, '');
    return nextPath ? nextPath.replace(/_/g, ' ') : '';
  }, [location.pathname]);
  const normalizedQuery = searchValue.trim();
  const shouldOpenDropdown = isFocused && normalizedQuery.length >= 2;
  const showEmptyState = shouldOpenDropdown && !isLoading && suggestions.length === 0;

  useEffect(() => {
    const cachedSuggestions = routeWord.trim().length >= 2
      ? suggestionCacheRef.current.get(routeWord.trim()) ?? []
      : [];

    setSearchValue(routeWord);
    setSuggestions(cachedSuggestions);
    setActiveIndex(cachedSuggestions.length > 0 ? 0 : -1);
    requestIdRef.current += 1;
    setIsLoading(false);
  }, [routeWord]);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      requestIdRef.current += 1;
      setIsLoading(false);
      setSuggestions([]);
      setActiveIndex(-1);
      return undefined;
    }

    const cachedSuggestions = suggestionCacheRef.current.get(normalizedQuery);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setActiveIndex(cachedSuggestions.length > 0 ? 0 : -1);
      setIsLoading(false);
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      if (!cachedSuggestions) {
        setIsLoading(true);
      }

      WordnetAPI.getSuggestions(normalizedQuery)
        .then((nextSuggestions) => {
          if (requestIdRef.current === requestId) {
            suggestionCacheRef.current.set(normalizedQuery, nextSuggestions);
            setSuggestions(nextSuggestions);
            setActiveIndex(nextSuggestions.length > 0 ? 0 : -1);
          }
        })
        .catch(() => {
          if (requestIdRef.current === requestId) {
            setSuggestions([]);
            setActiveIndex(-1);
          }
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsLoading(false);
          }
        });
    }, cachedSuggestions ? 0 : 160);

    return () => {
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, searchVersion]);

  useEffect(() => {
    if (!shouldOpenDropdown) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsFocused(false);
      setActiveIndex(-1);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [shouldOpenDropdown]);

  const onSearch = useCallback((word: string): void => {
    const normalizedWord = toRouteWord(word);
    const displayWord = word.replace(/_/g, ' ').trim();

    setSearchValue(displayWord);
    setIsFocused(false);
    setSuggestions([]);
    setActiveIndex(-1);
    requestIdRef.current += 1;
    setIsLoading(false);
    inputRef.current?.blur();

    if (!normalizedWord) {
      navigate('/');
      return;
    }

    navigate(`/${normalizedWord}`);
  }, [navigate]);

  const onInputFocus = useCallback((): void => {
    setIsFocused(true);

    if (searchValue.trim().length >= 2) {
      setSearchVersion((currentVersion) => currentVersion + 1);
    }
  }, [searchValue]);

  const onSubmit = (): void => {
    const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
    onSearch(activeSuggestion?.lemma ?? searchValue);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!shouldOpenDropdown || suggestions.length === 0) {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((currentIndex) => ((currentIndex + 1) % suggestions.length));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((currentIndex) => {
        if (currentIndex <= 0) {
          return suggestions.length - 1;
        }

        return currentIndex - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsFocused(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <Layout.Header className="app-header">
      <Link to="/" className="brand-link">
        <span className="logo">Lexical Graph</span>
      </Link>
      <div
        ref={rootRef}
        className={`header-search ${shouldOpenDropdown ? 'header-search--open' : ''}`}
      >
        <form
          className="header-search__form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
        <Input
          ref={inputRef}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          id={searchFieldName}
          name={searchFieldName}
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          placeholder="Search WordNet"
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          value={searchValue}
          role="combobox"
          aria-expanded={shouldOpenDropdown}
          aria-controls="header-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `header-search-option-${activeIndex}` : undefined}
          onChange={(event) => {
            setSearchValue(event.target.value);
            setIsFocused(true);
            setActiveIndex(-1);
          }}
          onClick={() => setIsFocused(true)}
          onFocus={onInputFocus}
          onKeyDown={onKeyDown}
        />
        </form>
        {shouldOpenDropdown ? (
          <div className="header-search-dropdown" id="header-search-listbox" role="listbox">
            {isLoading ? (
              <div className="header-search-dropdown__state" aria-live="polite">
                <Spin size="small" />
                <span>Searching WordNet…</span>
              </div>
            ) : null}
            {!isLoading ? suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={`${suggestion.lemma}-${suggestion.pos}`}
                  id={`header-search-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`header-search-dropdown__option ${isActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSearch(suggestion.lemma);
                  }}
                >
                  <span className="header-search__lemma-row">
                    <span className="header-search__lemma">{suggestion.lemma.replace(/_/g, ' ')}</span>
                    <span className="header-search__pos-badge">{WordnetAPI.posMap[suggestion.pos]}</span>
                  </span>
                  <span className="header-search__meta">
                    {suggestion.synsetCount > 0 ? `${suggestion.synsetCount} synsets` : 'WordNet lemma'}
                  </span>
                </button>
              );
            }) : null}
            {showEmptyState ? (
              <div className="header-search-dropdown__state" aria-live="polite">
                <span>No matching WordNet entries</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="text"
        size="large"
        className="theme-toggle"
        aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        icon={themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        onClick={onToggleTheme}
      />
    </Layout.Header>
  );
};

export default React.memo(Header);
