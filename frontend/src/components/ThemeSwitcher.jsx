import React from "react";

// 图标SVG
const icons = {
  auto: (
    <svg width="22" height="22" fill="none" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" stroke="#f7b500" strokeWidth="2"/>
      <path d="M11 4v2M11 16v2M4 11h2M16 11h2M7.07 7.07l1.42 1.42M14.49 14.49l1.42 1.42M7.07 14.93l1.42-1.42M14.49 7.51l1.42-1.42" stroke="#f7b500" strokeWidth="1.5"/>
    </svg>
  ),
  light: (
    <svg width="22" height="22" fill="none" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="6" fill="#fffbe1" stroke="#fae38d" strokeWidth="2"/>
    </svg>
  ),
  dark: (
    <svg width="22" height="22" fill="none" viewBox="0 0 22 22">
      <path d="M18 14.5A7 7 0 0 1 7.49 4 7 7 0 1 0 18 14.5Z" fill="#1e2234" stroke="#415264" strokeWidth="2"/>
    </svg>
  )
};

const THEME_OPTIONS = [
  { key: "auto", label: "自动", icon: icons.auto },
  { key: "light", label: "明亮", icon: icons.light },
  { key: "dark",  label: "暗夜", icon: icons.dark }
];

function getPreferredTheme() {
  // 如果没有localStorage值就用auto
  return localStorage.getItem("__themeMode") || "auto";
}

// 响应系统主题变化（仅当模式为auto时）
function setBodyClass(mode) {
  document.body.classList.remove("dark", "light");
  if (mode === "dark") document.body.classList.add("dark");
  else if (mode === "light") document.body.classList.add("light");
  // auto无需加class（用css媒体查询）
}

export default function ThemeSwitcher() {
  const [open, setOpen] = React.useState(false);
  const [theme, setTheme] = React.useState(getPreferredTheme());

  React.useEffect(() => {
    setBodyClass(theme);

    // 系统主题变动监听器，仅auto生效
    let mql;
    function systemChange(e) {
      if (localStorage.getItem("__themeMode") === "auto") {
        setBodyClass(e.matches ? "dark" : "light");
      }
    }
    if (theme === "auto") {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      setBodyClass(mql.matches ? "dark" : "light");
      mql.addEventListener("change", systemChange);
    }
    return () => { mql && mql.removeEventListener("change", systemChange); };
  }, [theme]);

  function handleSelect(selected) {
    setTheme(selected);
    localStorage.setItem("__themeMode", selected);
    setBodyClass(selected);
    setOpen(false);
    // 立即响应主题切换
    if (selected === "auto") {
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setBodyClass(isSystemDark ? "dark" : "light");
    }
  }

  // 菜单聚焦时仅自己处理点击，不冒泡
  React.useEffect(() => {
    if (!open) return;
    function handleClose(e) { setOpen(false); }
    window.addEventListener("mousedown", handleClose);
    return () => window.removeEventListener("mousedown", handleClose);
  }, [open]);

  const currentIcon = THEME_OPTIONS.find(opt => opt.key === theme)?.icon || icons.auto;

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="主题切换"
        style={{
          background: "none", border: "none", cursor: "pointer", outline: "none",
          padding: "4px", borderRadius: "50%", minWidth: 34, minHeight: 34, transition:'background 0.18s'
        }}
        title="主题切换"
        onClick={e => { e.stopPropagation(); setOpen(v=>!v); }}
      >
        {currentIcon}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: 40, right: 0, background: "var(--color-bg-card)",
          borderRadius: 8, boxShadow: "0 2px 14px 0 rgba(0,0,0,0.13)",
          border: "1px solid var(--color-border)", minWidth: 110, zIndex: 1000, padding: "6px 0"
        }} onClick={e=>e.stopPropagation()}>
          {THEME_OPTIONS.map(opt =>
              <button
                key={opt.key}
                onClick={() => handleSelect(opt.key)}
                style={{
                  width: "100%",
                  background: theme === opt.key ? "var(--color-selected-bg)" : "none",
                  border: "none",
                  padding: "7px 16px",
                  fontSize: "15px",
                  textAlign: "left",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  fontWeight: theme === opt.key ? 600 : 400
                }}
              >{opt.icon}<span style={{marginLeft:10}}>{opt.label}</span></button>
          )}
        </div>
      )}
    </div>
  );
}
