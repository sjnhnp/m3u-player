// src/components/ThemeSwitcher.jsx
import React, { useState, useEffect, useRef } from 'react';
import ThemeMenu from './ThemeMenu';

// ★★ 将读取 localStorage 的逻辑提取到一个辅助函数中
// 这个函数只会在 useState 初始化时被调用一次
function getInitialMode() {
  try {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode === 'light' || savedMode === 'dark') {
      // 如果 localStorage 有有效值，直接返回
      return savedMode;
    } else {
      // 如果 localStorage 无效或没有值，检查系统偏好作为首次默认值
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
  } catch (error) {
    console.error("无法读取初始主题模式:", error);
    // 如果读取 localStorage 出错，安全回退到 'light'
    return 'light';
  }
}

export default function ThemeSwitcher() {
  // ★★ 使用辅助函数来初始化 state
  // 注意：传递的是函数引用 getInitialMode，而不是调用结果 getInitialMode()
  // useState 会自动调用这个函数一次来获取初始值
  const [mode, setMode] = useState(getInitialMode);

  const [showMenu, setShow] = useState(false); // 这个不变
  const btnRef = useRef(null); // 这个不变

  /* Effect 1: 同步 mode 到 <body> class 和 localStorage (保持不变) */
  // 这个 Effect 现在是安全的，因为它会在 mode 真正改变时
  // (包括初始加载时从 localStorage 读取到的值被设置后)
  // 或者用户手动选择后运行，并写入正确的 mode 值。
  useEffect(() => {
    // 先移除可能存在的类
    document.body.classList.remove('light', 'dark');
    // 直接添加当前的 mode 作为 class
    document.body.classList.add(mode);

    // 尝试保存到 localStorage
    try {
       localStorage.setItem('themeMode', mode);
     } catch (error) {
       console.error("无法保存主题模式到 localStorage:", error);
     }
  }, [mode]); // 依赖 [mode]，每次 mode 变化时运行

  /* Effect 2: (不再需要) 从 localStorage 读取初始状态 */
  // 因为我们已经在 useState 初始化时读取了，所以这个 Effect 可以删除了
  // useEffect(() => {
  //   // ... (之前的读取逻辑)
  // }, []); // <--- 删除或注释掉这个 Effect

  /* Effect 3: 点击空白处自动收起菜单 (保持不变) */
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setShow(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // 处理用户选择新模式 (保持不变)
  const handleSelect = (val) => {
    setMode(val); // 更新状态，会触发 Effect 1
    setShow(false);
  };

  // 渲染 (保持不变)
  return (
    <div className="theme-switcher" ref={btnRef}>
      <button className="theme-btn" onClick={() => setShow(s => !s)}>
        {mode === 'light' ? '☀️' : '🌙'}
      </button>

      {showMenu && (
        <ThemeMenu mode={mode} onChange={handleSelect} />
      )}
    </div>
  );
}
