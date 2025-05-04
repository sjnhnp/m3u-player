// src/components/ThemeMenu.jsx
import React from 'react';

/**
 * 显示三项菜单；由父组件传入：
 * mode      当前模式字符串 'auto' | 'light' | 'dark'
 * onChange  选择后的回调
 */
export default function ThemeMenu({ mode, onChange }) {
  const MenuItem = ({ value, children }) => {
    const active = mode === value;
    return (
      <li
        className={`menu-item ${active ? 'active' : ''}`}
        onClick={() => onChange(value)}
      >
        {/* check 占位：没勾也占 1em 宽，三行字才能对齐 */}
        <span className="check">{active && '✔'}</span>
        {children}
      </li>
    );
  };

  return (
    <ul className="theme-menu">
       {/* <MenuItem value="auto">自动（跟随系统）</MenuItem> */}
      <MenuItem value="light">白天</MenuItem>
      <MenuItem value="dark">夜晚</MenuItem>
    </ul>
  );
}
