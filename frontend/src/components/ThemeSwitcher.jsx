// ThemeSwitcher.jsx
import React from "react";

export default function ThemeSwitcher() {
  function handleChange(e) {
    const mode = e.target.value;
    document.body.classList.remove('dark', 'light');
    if (mode === 'dark')   document.body.classList.add('dark');
    if (mode === 'light')  document.body.classList.add('light');
    // 'auto' 则不加额外类名
    // 尽量用 localStorage 持久化，页面刷新后记忆用户选择
    window.localStorage.setItem('__themeMode', mode);
  }
  // 首次加载时自动读取（建议加到App的useEffect里）
  React.useEffect(()=>{
    const stored = localStorage.getItem('__themeMode');
    if(stored==='dark'||stored==='light'){
      document.body.classList.add(stored);
    }
  },[]);
  return (
    <div style={{display:'flex',alignItems:'center',gap:'0.5em',margin:'1em 0'}}>
      <label style={{fontWeight:'bold',color:'var(--color-primary)'}}>主题</label>
      <select
        aria-label="颜色模式"
        onChange={handleChange}
        defaultValue={localStorage.getItem('__themeMode') || "auto"}
        style={{
          padding: '5px 10px',
          borderRadius: '6px',
          border: '1px solid var(--color-border)',
          fontWeight: 500
        }}>
        <option value="auto">自动</option>
        <option value="light">白天</option>
        <option value="dark">夜晚</option>
      </select>
    </div>
  );
}
