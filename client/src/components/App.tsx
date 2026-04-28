import { ConfigProvider, Layout, theme as antdTheme } from 'antd';
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { readCookie, writeCookie } from '../util/cookie';
import './App.css';
import Content from './Content';
import Header from './UI/Header';

type ThemeMode = 'light' | 'dark';
const THEME_STORAGE_KEY = 'lexical-graph-theme';
const THEME_COOKIE_KEY = 'lexical_graph_theme';
const routerBaseName = import.meta.env.BASE_URL.replace(/\/$/u, '');

function getInitialThemeMode(): ThemeMode {
  const cookieTheme = readCookie(THEME_COOKIE_KEY);
  if (cookieTheme === 'light' || cookieTheme === 'dark') {
    return cookieTheme;
  }

  const persistedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persistedTheme === 'light' || persistedTheme === 'dark') {
    return persistedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const App: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    writeCookie(THEME_COOKIE_KEY, themeMode);
  }, [themeMode]);

  return (
    <ConfigProvider
      theme={{
        algorithm: themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#4fb99f',
          borderRadius: 10,
        },
      }}
    >
      <BrowserRouter basename={routerBaseName}>
        <Layout className="app-shell">
          <Header
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((currentTheme) => (
              currentTheme === 'dark' ? 'light' : 'dark'
            ))}
          />
          <Routes>
            <Route path="/" element={<Content />} />
            <Route path="/:urlWord" element={<Content />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
