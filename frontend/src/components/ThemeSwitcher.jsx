// src/components/ThemeSwitcher.jsx
import React, { useState, useEffect, useRef } from 'react';
import ThemeMenu from './ThemeMenu';

export default function ThemeSwitcher() {
  const [mode, setMode]     = useState('auto');  // 当前模式
  const [showMenu, setShow] = useState(false);   // 是否展开菜单
  const btnRef = useRef(null);

  /* 把 mode 同步到 <body> className（或 LocalStorage） */
  useEffect(() => {
    document.body.classList.remove('light', 'dark');
    if (mode !== 'auto') document.body.classList.add(mode);
  }, [mode]);

  /* 点击空白处自动收起菜单 */
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handleSelect = (val) => {
    setMode(val);
    setShow(false);
  };

  return (
    <div className="theme-switcher" ref={btnRef}>
      <button className="theme-btn" onClick={() => setShow(s => !s)}>
        🌓
      </button>

      {showMenu && (
        <ThemeMenu mode={mode} onChange={handleSelect} />
      )}
    </div>
  );
}

