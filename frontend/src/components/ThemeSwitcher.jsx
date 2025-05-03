// src/components/ThemeSwitcher.jsx
import React, { useState, useEffect, useRef } from "react";
import { FaRegSun, FaRegMoon, FaRegClock } from "react-icons/fa"; // ☀️ 🌙 ⏰

/**
 * 小白理解版：
 * 1) 点右上角图标 => 打开一个小菜单
 * 2) 菜单里点“白天 / 夜晚 / 自动”即可切主题
 * 3) 结果写入 localStorage，刷新页面还能记住
 */
export default function ThemeSwitcher() {
  const [mode, setMode] = useState("auto");   // 当前模式
  const [showMenu, setShowMenu] = useState(false); // 是否展开菜单
  const menuRef = useRef(null); // 用来监听“点空白处关闭菜单”

  /* -------------- 第一次渲染：读 localStorage ------------- */
  useEffect(() => {
    const stored = localStorage.getItem("__themeMode") || "auto";
    applyMode(stored);
    setMode(stored);
  }, []);

  /* -------------- 监听点击页面其它地方就关菜单 ------------- */
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* -------------- 真正的“切主题”动作 ------------- */
  function applyMode(nextMode) {
    document.body.classList.remove("light", "dark"); // 先清理
    if (nextMode === "light") document.body.classList.add("light");
    if (nextMode === "dark") document.body.classList.add("dark");
    localStorage.setItem("__themeMode", nextMode);
  }

  /* -------------- 处理菜单点击 ------------- */
  function handleSelect(nextMode) {
    applyMode(nextMode);
    setMode(nextMode);
    setShowMenu(false);
  }

  /* -------------- 当前图标显示什么？ ------------- */
  const icon =
    mode === "light" ? <FaRegSun /> :
    mode === "dark"  ? <FaRegMoon /> :
                       <FaRegClock />; // auto = 时钟图标

  return (
    <div className="theme-switcher" ref={menuRef}>
      {/* 顶部右侧那颗按钮 */}
      <button
        className="theme-btn"
        aria-label="选择主题"
        onClick={() => setShowMenu((v) => !v)}
      >
        {icon}
      </button>

      {/* 弹出的菜单 */}
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
