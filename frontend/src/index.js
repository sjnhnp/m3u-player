import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // 确保这个文件存在或注释掉这行

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); // <-- 确保这个分号被复制并保留
