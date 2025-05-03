/* ThemeMenu.jsx */
import React from 'react';

export default function ThemeMenu({ mode, onChange }) {
  const MenuItem = ({ value, children }) => {
    const active = mode === value;
    return (
      <li
        className={`menu-item ${active ? 'active' : ''}`}
        onClick={() => onChange(value)}
      >
        {/* 留一个占位，让没对勾的行也对齐 */}
        <span className="check">{active && '✔'}</span>
        {children}
      </li>
    );
  };

  return (
    <ul className="theme-menu">
      <MenuItem value="auto">自动（跟随系统）</MenuItem>
      <MenuItem value="light">白天</MenuItem>
      <MenuItem value="dark">夜晚</MenuItem>
    </ul>
  );
}
