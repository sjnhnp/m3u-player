// src/components/ThemeSwitcher.jsx
import React, { useState, useEffect, useRef } from "react";

/* ================================================================
   1) 这三个小组件就是我们的图标（纯 SVG，零依赖）
   2) fill="currentColor" 代表自动跟随文字颜色 -> 日夜都能看
================================================================ */
const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1Zm7.07-4.5h1.43a1 1 0 1 1 0 2h-1.43a1 1 0 1 1 0-2Zm-12.14 0a1 1 0 1 1 0 2H5.5a1 1 0 1 1 0-2h1.43ZM17 7.05l1.06-1.06a1 1 0 1 1 1.41 1.41L18.4 8.47A1 1 0 1 1 17 7.05Zm-10.47 10.4L5.47 18.4a1 1 0 0 1-1.41-1.41L5.11 16a1 1 0 0 1 1.41 1.41ZM18.4 15.53a1 1 0 0 1 1.41 1.41L18.76 18.4a1 1 0 1 1-1.41-1.41l1.05-1.06Zm-12.82-8.95a1 1 0 1 1 1.41-1.41L8.47 5.6A1 1 0 1 1 7.05 7L5.99 5.94Z" />
  </svg>
);
const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z" />
  </svg>
);
const AutoIcon = () => (
  <svg
    width="22" height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"          {/*  ← 线条改细 */}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9"></circle>
    <polyline points="12 7 12 12 15 15"></polyline>
  </svg>
);


/* ====================== 主题切换主组件 ====================== */
export default function ThemeSwitcher() {
  const [mode, setMode] = useState("auto");        // 当前模式
  const [showMenu, setShowMenu] = useState(false); // 下拉是否展开
  const menuRef   = useRef(null);                  // 点空白处关闭菜单

  /* --- 页面一加载就读取 localStorage --- */
  useEffect(() => {
    const stored = localStorage.getItem("__themeMode") || "auto";
    applyMode(stored);
    setMode(stored);
  }, []);

  /* --- 监听点击页面空白处，自动收起菜单 --- */
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* --- 真正执行“切主题”的函数 --- */
  function applyMode(next) {
    document.body.classList.remove("light", "dark");
    if (next === "light") document.body.classList.add("light");
    if (next === "dark")  document.body.classList.add("dark");
    localStorage.setItem("__themeMode", next);
  }

  /* --- 菜单点击回调 --- */
  function handleSelect(next) {
    applyMode(next);
    setMode(next);
    setShowMenu(false);
  }

  /* --- 根据当前模式选一个图标 --- */
  const icon =
    mode === "light" ? <SunIcon /> :
    mode === "dark"  ? <MoonIcon /> :
                       <AutoIcon />;   // auto

  /* --- JSX --- */
  return (
    <div className="theme-switcher" ref={menuRef}>
      <button
        className="theme-btn"
        aria-label="选择主题"
        onClick={() => setShowMenu(v => !v)}
      >
        {icon}
      </button>

      {showMenu && (
        <ul className="theme-menu">
          <li onClick={() => handleSelect("auto")}>自动（跟随系统）</li>
          <li onClick={() => handleSelect("light")}>白天</li>
          <li onClick={() => handleSelect("dark")}>夜晚</li>
        </ul>
      )}
    </div>
  );
}
