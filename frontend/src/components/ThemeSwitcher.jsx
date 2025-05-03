import React, { useState, useEffect } from 'react';

const themeOptions = [
  { key: 'auto',  label: '自动' },
  { key: 'light', label: '光亮' },
  { key: 'dark',  label: '夜幕' },
];

// 获取本地/系统 prefers-color-scheme 主题
function getSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function getStoredTheme() {
  return localStorage.getItem('theme') || 'auto';
}

function setHtmlThemeClass(theme) {
  document.body.classList.remove('dark', 'light');
  if(theme === 'dark')      document.body.classList.add('dark');
  else if(theme === 'light')document.body.classList.add('light');
  // auto: 不加class，媒体查询生效
}

const ThemeSwitcher = () => {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme());

  // 每次theme变动，更新body的class和本地存储
  useEffect(() => {
    setHtmlThemeClass(theme);
    localStorage.setItem('theme', theme);
    // Auto时用系统色
    if(theme === 'auto') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = e => setHtmlThemeClass(e.matches ? 'dark' : 'light');
      media.addEventListener('change', listener);
      setHtmlThemeClass(getSystemTheme());
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  // 小月亮图标（夜）、太阳图标（日）、A为自动，你可自定义svg或用icon库
  const currentIcon = {
    auto:  <span role="img" aria-label="自动" style={{fontSize: 20}}>🅰️</span>,
    light: <span role="img" aria-label="光亮" style={{fontSize: 20}}>☀️</span>,
    dark:  <span role="img" aria-label="夜幕" style={{fontSize: 20}}>🌙</span>
  }[theme] || <span style={{fontSize: 20}}>🅰️</span>;

  // 菜单按钮与选项
  return (
    <div style={{
      position: 'absolute',        // 你可放到header里，这里绝对定位示例
      top: '20px',
      right: '30px',
      zIndex: 1000
    }}>
      <button
        aria-label="主题切换"
        onClick={()=>setOpen(x=>!x)}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 22,
          outline: 'none'
        }}
      >
        {currentIcon}
      </button>
      {open &&
        <ul style={{
          position:'absolute',
          top: '36px',
          right: 0,
          background: '#252a3a',
          color: '#fff',
          listStyle: 'none',
          padding: '6px 0',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          minWidth: 72,
        }}>
          {themeOptions.map(opt => (
            <li key={opt.key}>
              <button
                onClick={() => { setTheme(opt.key); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: "100%",
                  padding: "7px 20px",
                  background:'none',
                  border:'none',
                  color: theme === opt.key ? "#ff5252" : "#fff",
                  fontWeight: theme===opt.key ? 'bold' : 'normal',
                  cursor: 'pointer',
                  fontSize: 16
                }}>
                {opt.key==='auto'  && <span style={{marginRight:8}}>🅰️</span>}
                {opt.key==='light' && <span style={{marginRight:8}}>☀️</span>}
                {opt.key==='dark'  && <span style={{marginRight:8}}>🌙</span>}
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      }
    </div>
  );
};

export default ThemeSwitcher;
