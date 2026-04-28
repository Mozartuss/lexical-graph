import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './components/App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container was not found');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
