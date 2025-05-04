// src/components/ThemeSwitcher.jsx
import React, { useState, useEffect, useRef } from 'react';
import ThemeMenu from './ThemeMenu';

export default function ThemeSwitcher() {
  const [mode, setMode]     = useState('light');  // 当前模式
  const [showMenu, setShow] = useState(false);   // 是否展开菜单
  const btnRef = useRef(null);

  /* 把 mode 同步到 <body> className（或 LocalStorage） */
  useEffect(() => {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(mode);
    // (可选) 将选择持久化到 localStorage
    try {
       localStorage.setItem('themeMode', mode);
     } catch (error) {
       console.error("Failed to save theme mode to localStorage", error);
     }
     //if (mode !== 'auto') document.body.classList.add(mode);
  }, [mode]);

 // (可选) 从 localStorage 读取初始状态
   useEffect(() => {
     try {
       const savedMode = localStorage.getItem('themeMode');
       if (savedMode === 'light' || savedMode === 'dark') {
         setMode(savedMode);
       } else {
          // 如果没有保存或值无效，可以检查系统偏好作为一次性默认值
          const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          setMode(prefersDark ? 'dark' : 'light');
       }
     } catch (error) {
       console.error("Failed to read theme mode from localStorage", error);
       setMode('light'); // Fallback to light on error
     }
   }, []); // 空依赖数组，只在组件挂载时运行一次

  
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
        {/* 可以根据当前模式显示不同图标 */}
        {mode === 'light' ? '☀️' : '🌙'}
      </button>

      {showMenu && (
        <ThemeMenu mode={mode} onChange={handleSelect} />
      )}
    </div>
  );
}

