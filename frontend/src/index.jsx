import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Make sure this file exists or comment out if not needed

const rootElement = document.getElementById('root');
// Ensure the element with id 'root' exists in your public/index.html
if (!rootElement) {
  throw new Error("Failed to find the root element. Check your public/index.html file.");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
   <React.StrictMode>
    <App />
   </React.StrictMode>
);
