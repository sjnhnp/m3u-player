import React from "react";

const iconStyles = {
  button: {
    background: "none",
    border: "none",
    cursor: "pointer",
    outline: "none",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    width: 38,
    borderRadius: "50%",
    transition: "background 0.18s"
  },
  icon: {
    width: 22,
    height: 22,
    display: "inline-block",
    verticalAlign: "middle"
  },
  menu: {
    position: "absolute",
    top: 40,
    right: 0,
    background: "var(--color-bg-card)",
    borderRadius: 8,
    boxShadow: "0 2px 14px 0 rgba(0,0,0,0.13)",
    border: "1px solid var(--color-border)",
    minWidth: 120,
    zIndex: 1000,
    padding: "6px 0"
  },
  item: {
    width: "100%",
    background: "none",
    border: "none",
    padding: "7px 16px",
    fontSize: "15px",
    textAlign: "left",
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  }
};

const THEME_OPTIONS = [
  { key: "auto", label: "跟随系统", icon: (
      <svg style={{...iconStyles.icon}} viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="#f7b500" strokeWidth="2"/><path d="M11 4v2M11 16v2M4 11h2M16 11h2M7.07 7.07l1.42 1.42M14.49 14.49l1.42 1.42M7.07 14.93l1.42-1.42M14.49 7.51l1.42-1.42" stroke="#f7b500" strokeWidth="1.5"/></svg>
    )},
  { key: "light", label: "明亮", icon: (
      <svg style={{...iconStyles.icon}} viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="6" fill="#fffbe1" stroke="#fae38d" strokeWidth="2"/></svg>
    )},
  { key: "dark", label: "暗夜", icon: (
      <svg style={{...iconStyles.icon}} viewBox="0 0 22 22" fill="none"><path d="M18 14.5A7 7 0 0 1 7.49 4 7 7 0 1 0 18 14.5Z" fill="#1e2234" stroke="#415264" strokeWidth="2"/></svg>
    )}
];

function getPreferredTheme() {
  return localStorage.getItem("__themeMode") || "auto";
}

export default function ThemeSwitcher() {
  const [open, setOpen] = React.useState(false);
  const [theme, setTheme] = React.useState(getPreferredTheme());

  React.useEffect(() => {
    const mode = getPreferredTheme();
    document.body.classList.remove("dark", "light");
    if (mode === "dark") document.body.classList.add("dark");
    if (mode === "light") document.body.classList.add("light");
    setTheme(mode);
  }, []);

  function handleSelect(mode) {
    setTheme(mode);
    document.body.classList.remove("dark", "light");
    if (mode === "dark") document.body.classList.add("dark");
    if (mode === "light") document.body.classList.add("light");
    localStorage.setItem("__themeMode", mode);
    setOpen(false);
  }

  // 点击其它区域关闭菜单
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => setOpen(false);
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const currentIcon = THEME_OPTIONS.find(opt => opt.key === theme)?.icon;

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="切换主题"
        style={iconStyles.button}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        title="切换主题"
      >
        {currentIcon}
      </button>
      {open &&
        <div style={iconStyles.menu} onClick={e => e.stopPropagation()}>
            {THEME_OPTIONS.map(opt =>
              <button
                key={opt.key}
                onClick={() => handleSelect(opt.key)}
                style={{
                  ...iconStyles.item,
                  fontWeight: theme === opt.key ? 600 : 400,
                  background: theme === opt.key ? "var(--color-selected-bg)" : "none"
                }}
              >{opt.icon}<span style={{marginLeft:10}}>{opt.label}</span></button>
            )}
        </div>
      }
    </div>
  );
}
