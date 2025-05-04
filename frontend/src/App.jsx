// frontend/src/App.jsx
// --- 导入 React 核心库和钩子 ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- 导入 HLS.js 库 ---
import Hls from 'hls.js';

// --- 导入子组件 ---
import SubscriptionList from './components/SubscriptionList'; // 导入列表组件
import AddSubscription from './components/AddSubscription';   // 导入添加组件
import ThemeSwitcher from './components/ThemeSwitcher';

// --- 常量定义 ---
const USER_SUBS_LOCALSTORAGE_KEY = 'm3uPlayerUserSubscriptions';
const LAST_SELECTED_SUB_URL_KEY = 'm3uPlayerLastSelectedSubscriptionUrl';
const LAST_SELECTED_CHANNEL_URL_KEY = 'm3uPlayerLastSelectedChannelUrl';

// ---- 在这里插入小组件 ----
function SmallNote() {
  return (
    <div style={{
      color: '#888',
      fontSize: '13px',
      marginBottom: '16px',
      marginTop: '-8px'
    }}>
      请先选择订阅列表其中一个，每次切换订阅列表/刷新网页都是一次重新加载订阅，品质不佳的是因为http，所以很多不能播放。
    </div>
  );
}
// ---- 到这里结束 ----


// --- 主应用组件 App ---
function App() {
  // --- 状态定义 (State) ---
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]);
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(() => {
    try { return localStorage.getItem(LAST_SELECTED_SUB_URL_KEY) || null; }
    catch (error) { console.error("读取订阅URL失败:", error); return null; }
  });
  const [channels, setChannels] = useState([]);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(() => {
      try { return localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY) || null; }
      catch (error) { console.error("读取频道URL失败:", error); return null; }
  });
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' });
  const [channelSearchQuery, setChannelSearchQuery] = useState('');

  // --- Refs ---
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const initialLoadStateRef = useRef('pending'); // pending, subscription_loading, subscription_loaded, channel_loading, complete


  // --- API 地址 ---
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 辅助函数: getPlayableUrl ---
  const getPlayableUrl = useCallback((originalUrl) => {
    if (!originalUrl) { console.warn("getPlayableUrl: 空 URL"); return null; }
    try {
      const isHttp = originalUrl.toLowerCase().startsWith('http://');
      const isPageHttps = window.location.protocol === 'https:';
      if (isHttp && isPageHttps) {
        return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`;
      }
      return originalUrl;
    } catch (error) {
      console.error(`处理 URL 出错: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 出错: ${originalUrl}`, type: 'error' });
      return null;
    }
  }, [apiBaseUrl]);

  // --- 事件处理函数 ---

  // 处理选择订阅源 (fetchAndParseM3u)
  const fetchAndParseM3u = useCallback(async (originalM3uUrl, isInitialLoad = false) => {
    if (!originalM3uUrl) { console.warn("fetchAndParseM3u: 空 URL"); return; }
    console.log(`fetchAndParseM3u 调用: URL=${originalM3uUrl}, isInitialLoad=${isInitialLoad}`);

    if (!isInitialLoad) {
        console.log("手动选择订阅: 清除旧频道选择");
        setSelectedChannelUrl(null);
        try { localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); }
        catch (error) { console.error("清除频道URL localStorage失败:", error); }
        initialLoadStateRef.current = 'complete'; // 手动选择，结束自动加载流程
    }

    if (localStorage.getItem(LAST_SELECTED_SUB_URL_KEY) !== originalM3uUrl) {
        try { localStorage.setItem(LAST_SELECTED_SUB_URL_KEY, originalM3uUrl); }
        catch (error) { console.error("保存订阅URL localStorage失败:", error); }
    }

    setSelectedSubscriptionUrl(originalM3uUrl);
    const selectedSub = mergedSubscriptions.find(sub => sub.url === originalM3uUrl);
    const subName = selectedSub?.name || originalM3uUrl.split('/').pop() || '订阅';
    setStatus({ message: `加载 "${subName}" 频道列表...`, type: 'loading'});
    setChannels([]); // 清空旧频道
    setChannelSearchQuery('');

    // 重置播放器
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); }
    if (videoRef.current) { videoRef.current.removeAttribute('src'); videoRef.current.load(); }

    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
      setStatus({ message: `无法处理订阅 URL: ${originalM3uUrl}`, type: 'error' });
      if (isInitialLoad) {
           console.error("fetchAndParseM3u (Initial): 无效 URL");
           initialLoadStateRef.current = 'complete';
           localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
           setSelectedSubscriptionUrl(null);
      }
      return;
    }
    console.log(`开始获取 M3U: ${urlToFetch}`);

    try {
      const response = await fetch(urlToFetch);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const m3uText = await response.text();

      // M3U 解析
      const parsedChannels = [];
      const lines = m3uText.split('\n');
      let currentChannelInfo = null;
      for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('#EXTINF:')) {
              currentChannelInfo = { id: '', name: '', url: '', logo: '', group: '' };
              const commaIndex = trimmedLine.indexOf(',');
              if (commaIndex !== -1) {
                  currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
                  const attributesPart = trimmedLine.substring(8, commaIndex);
                  const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
                  if (logoMatch && logoMatch[1]) currentChannelInfo.logo = logoMatch[1];
                  const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
                  if (groupMatch && groupMatch[1]) currentChannelInfo.group = groupMatch[1];
              } else {
                  currentChannelInfo.name = trimmedLine.substring(8).trim();
              }
          } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('://')) {
              currentChannelInfo.url = trimmedLine;
              currentChannelInfo.id = `ch_${currentChannelInfo.url}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
              parsedChannels.push(currentChannelInfo);
              currentChannelInfo = null;
          } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
              console.warn(`忽略非 URL 行: ${trimmedLine}`);
              currentChannelInfo = null; // 即使不是 URL，也重置，避免错误关联
          }
      }

      setChannels(parsedChannels); // 更新频道列表
      setStatus({
           message: `"${subName}" 加载完成: ${parsedChannels.length} 个频道`,
           type: parsedChannels.length > 0 ? 'info' : 'warning'
       });

      if (isInitialLoad) {
          console.log("fetchAndParseM3u (Initial): 成功，状态 -> subscription_loaded");
          initialLoadStateRef.current = 'subscription_loaded'; // 触发 Effect 4
      }

    } catch (error) {
      console.error(`加载或解析 M3U (${originalM3uUrl}) 出错:`, error);
      let errorMsg = `加载 "${subName}" 频道列表出错: ${error.message}`;
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) errorMsg += ` - 检查网络/代理/源地址。`;
      else if (error.message.includes('HTTP ')) errorMsg += ` - 服务器错误 (${error.message.match(/HTTP \d+/)?.[0]})。`;
      setStatus({ message: errorMsg, type: 'error'});
      setChannels([]);

      if (isInitialLoad) {
          console.error("fetchAndParseM3u (Initial): 失败，状态 -> complete");
          localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
          localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
          setSelectedSubscriptionUrl(null);
          setSelectedChannelUrl(null);
          initialLoadStateRef.current = 'complete';
      }
    }
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]); // 依赖项: mergedSubscriptions, getPlayableUrl, apiBaseUrl

  // 处理选择频道 (loadVideoStream)
  const loadVideoStream = useCallback((originalChannelUrl, isInitialLoad = false) => {
    if (!originalChannelUrl) { console.warn("loadVideoStream: 空 URL"); return; }
    console.log(`loadVideoStream 调用: URL=${originalChannelUrl}, isInitialLoad=${isInitialLoad}`);

    if (!isInitialLoad) {
        initialLoadStateRef.current = 'complete'; // 手动选择，结束自动加载
    }

    if (localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY) !== originalChannelUrl) {
        try { localStorage.setItem(LAST_SELECTED_CHANNEL_URL_KEY, originalChannelUrl); }
        catch (error) { console.error("保存频道URL localStorage失败:", error); }
    }

    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `加载频道中...`, type: 'loading' });

    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
      setStatus({ message: `无法处理频道 URL: ${originalChannelUrl}`, type: 'error' });
      if (isInitialLoad) {
           console.error("loadVideoStream (Initial): 无效 URL");
           initialLoadStateRef.current = 'complete';
           localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
           setSelectedChannelUrl(null);
      }
      return;
    }
    console.log(`播放器加载源: ${urlToPlay}`);

    const videoElement = videoRef.current;
    if (!videoElement) {
        console.error("播放器 video 元素无效！");
        setStatus({ message: "播放器元素丢失", type: 'error' });
        if (isInitialLoad) initialLoadStateRef.current = 'complete';
        return;
    }

    if (hlsRef.current) { // 使用 HLS.js
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        const hls = hlsRef.current;
        hls.stopLoad();
        hls.detachMedia();
        hls.attachMedia(videoElement);
        hls.loadSource(urlToPlay);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) { // 使用原生 HLS
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        videoElement.pause();
        videoElement.src = urlToPlay;
        videoElement.load();
        videoElement.play().catch(e => {
            console.warn("原生 HLS 自动播放失败:", e.message);
            setStatus({ message: "播放器已加载，请点击播放", type: 'info' });
        });
    } else { // 不支持 HLS
        setStatus({ message: "浏览器不支持 HLS", type: 'error' });
        if (isInitialLoad) initialLoadStateRef.current = 'complete';
    }

    // 标记完成的逻辑现在由 Effect 4 处理，因为它需要观察状态变化
    // if (isInitialLoad) {
    //     // 可以在这里设置一个 'channel_loading' 状态，让 effect 4 观察
    // }

  }, [getPlayableUrl]); // 依赖项: getPlayableUrl

  // 处理添加用户订阅
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData;
    if (!name || !url) { setStatus({ message: "名称和 URL 不能为空", type: 'warning' }); return; }
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) || userSubscriptions.some(sub => sub.url === url);
    if (isDuplicate) { setStatus({ message: `订阅 "${url}" 已存在`, type: 'warning' }); return; }

    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url };
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs);
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `订阅 "${name}" 添加成功!`, type: 'success' });
    } catch (error) {
        console.error("保存用户订阅失败:", error);
        setStatus({ message: `添加 "${name}" 成功，但保存失败！`, type: 'warning' });
    }
  }, [userSubscriptions, fixedSubscriptions]); // 依赖项: userSubscriptions, fixedSubscriptions

  // 处理删除用户订阅
  const handleDeleteUserSubscription = useCallback((idToDelete) => {
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete) { console.warn("尝试删除不存在的订阅:", idToDelete); return; }
      if (!window.confirm(`确定删除订阅 "${subToDelete.name}"?`)) return;

      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs);

      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `订阅 "${subToDelete.name}" 已删除`, type: 'success' });

          if (selectedSubscriptionUrl === subToDelete.url) {
              console.log("删除当前选中订阅，重置状态和存储");
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null);
              // 重置播放器
              if (videoRef.current) videoRef.current.pause();
              if (hlsRef.current) { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); }
              if (videoRef.current) { videoRef.current.removeAttribute('src'); videoRef.current.load(); }
              // 清除存储
              localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
              localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
              setStatus({ message: "当前订阅已删除，播放器已重置", type: 'info' });
          }
      } catch (error) {
           console.error("删除订阅或清除 localStorage 出错:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 时出错`, type: 'error' });
      }
  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项: userSubscriptions, selectedSubscriptionUrl

  // --- 副作用钩子 (Effects) ---

  // Effect 1: 初始化 HLS, 加载本地/固定订阅 (首次加载)
  useEffect(() => {
    let hlsInstance = null;
    let nativeListenersAttached = false;
    const videoElement = videoRef.current;

    // HLS.js 初始化
    if (typeof Hls !== 'undefined' && Hls.isSupported() && videoElement) {
      console.log("初始化 HLS.js");
      const hls = new Hls({ manifestLoadErrorMaxRetry: 3, levelLoadErrorMaxRetry: 5, fragLoadErrorMaxRetry: 5 });
      hlsInstance = hls;
      hls.attachMedia(videoElement);
      hlsRef.current = hls;
      // HLS 事件监听
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS Error:', data);
         let msg = `播放错误 (${data.type}): ${data.details || '未知'}`;
         if(data.fatal) msg += " (严重)";
         setStatus({ message: msg, type: 'error' });
         // 简单恢复尝试
         if(data.fatal) {
            if(data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
         }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setStatus(prev => ({ ...prev, message: "准备播放...", type: 'loading' })); // 保留 type，可能已经是 error
            videoElement?.play().catch(e => console.warn("自动播放失败:", e.message));
      });
      hls.on(Hls.Events.BUFFER_STALLED, () => setStatus({ message: "缓冲中...", type: 'warning' }));
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
           if(status.message === "缓冲中..." || status.message === "准备播放...") {
               setStatus({ message: "正在播放...", type: 'info' });
           }
      });
       hls.on(Hls.Events.FRAG_BUFFERED, () => { // 另一个表示播放正常的信号
           if(status.type === 'loading' || status.message === "准备播放...") {
                setStatus({ message: "正在播放...", type: 'info' });
           }
       });

    // 原生 HLS 支持
    } else if (videoElement?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("使用原生 HLS");
        const handlers = {
             onError: (e) => { console.error('原生 HLS Error:', e, videoElement.error); setStatus({ message: `播放错误: ${videoElement.error?.message || '未知'}`, type: 'error' }); },
             onCanPlay: () => { if (status.type === 'loading') setStatus({ message: "正在播放...", type: 'info' }); },
             onWaiting: () => setStatus({ message: "缓冲中...", type: 'warning' }),
             onPlaying: () => { if (status.message !== "正在播放...") setStatus({ message: "正在播放...", type: 'info' }); },
             onStalled: () => setStatus({ message: "缓冲中...", type: 'warning' }),
        };
        videoElement.addEventListener('error', handlers.onError);
        videoElement.addEventListener('canplay', handlers.onCanPlay);
        videoElement.addEventListener('waiting', handlers.onWaiting);
        videoElement.addEventListener('playing', handlers.onPlaying);
        videoElement.addEventListener('stalled', handlers.onStalled);
        nativeListenersAttached = true;
        videoElement._nativeHlsHandlers = handlers; // 保存引用以便清理
    } else { // 不支持 HLS
        console.error("浏览器不支持 HLS");
        setStatus({ message: "抱歉，浏览器不支持 HLS 播放", type: 'error' });
    }

    // 加载本地用户订阅
    try {
        const stored = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY);
        const initial = stored ? JSON.parse(stored) : [];
        if (Array.isArray(initial) && initial.every(i => i && i.id && i.name && i.url)) {
             setUserSubscriptions(initial); console.log("加载用户订阅:", initial.length);
        } else { if(stored) console.warn("本地订阅格式错误"); setUserSubscriptions([]); localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([])); }
    } catch (e) { console.error("加载用户订阅失败:", e); setUserSubscriptions([]); setStatus(prev => ({ ...prev, message: "加载本地订阅失败", type: 'warning' })); }

    // 获取固定订阅
    const fetchFixed = async () => {
      console.log("获取固定订阅...");
      try {
        const res = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data) && data.every(i => i && i.name && i.url)) {
           setFixedSubscriptions(data); console.log("获取固定订阅:", data.length);
        } else { console.error("固定订阅格式错误"); setFixedSubscriptions([]); setStatus(prev => ({ ...prev, message: "获取固定订阅格式错误", type: 'error' })); }
      } catch (e) { console.error('获取固定订阅出错:', e); setFixedSubscriptions([]); setStatus(prev => ({ ...prev, message: `获取固定订阅出错: ${e.message}`, type: 'error' })); }
    };
    fetchFixed();

    // 清理函数
    return () => {
        if (hlsInstance) { hlsInstance.destroy(); console.log("HLS instance destroyed"); }
        if (nativeListenersAttached && videoElement && videoElement._nativeHlsHandlers) {
             console.log("移除原生 HLS 监听器");
             const h = videoElement._nativeHlsHandlers;
             videoElement.removeEventListener('error', h.onError);
             videoElement.removeEventListener('canplay', h.onCanPlay);
             videoElement.removeEventListener('waiting', h.onWaiting);
             videoElement.removeEventListener('playing', h.onPlaying);
             videoElement.removeEventListener('stalled', h.onStalled);
             delete videoElement._nativeHlsHandlers;
        }
    };
  }, [apiBaseUrl]); // 依赖项: apiBaseUrl

  // Effect 2: 合并订阅列表
  useEffect(() => {
    const merged = [
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true, id: `fixed_${sub.url}` })),
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并订阅列表:", merged.length);
  }, [fixedSubscriptions, userSubscriptions]); // 依赖项: fixedSubscriptions, userSubscriptions

  // Effect 3: 尝试自动加载上次订阅 (基于合并列表)
  // ★★ 移除 status.message 依赖 ★★
  useEffect(() => {
    if (mergedSubscriptions.length > 0 && initialLoadStateRef.current === 'pending') {
        const lastSubUrl = localStorage.getItem(LAST_SELECTED_SUB_URL_KEY);
        console.log("Effect 3: 检查上次订阅 URL:", lastSubUrl);
        if (lastSubUrl && mergedSubscriptions.some(sub => sub.url === lastSubUrl)) {
            console.log("Effect 3: 上次订阅有效，调用 fetchAndParseM3u");
            initialLoadStateRef.current = 'subscription_loading';
            fetchAndParseM3u(lastSubUrl, true); // true for initial load
        } else {
            if (lastSubUrl) console.warn("Effect 3: 上次订阅无效");
            else console.log("Effect 3: 无上次订阅记录");
            initialLoadStateRef.current = 'complete'; // 无法自动加载，流程结束
            localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY); // 清理无效或不存在的 key
            localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
            // 只有在应用初始加载时才设置提示信息
            if (status.message === "应用加载中...") {
                 setStatus({ message: mergedSubscriptions.length > 0 ? "请选择一个订阅源" : "无可用订阅源", type: 'info'});
            }
        }
    } else if (mergedSubscriptions.length === 0 && initialLoadStateRef.current === 'pending' && (fixedSubscriptions.length > 0 || userSubscriptions.length > 0)) {
        // 如果列表为空，但原始列表有内容（说明合并刚完成），也标记完成
        console.log("Effect 3: 列表为空，标记完成");
        initialLoadStateRef.current = 'complete';
         if (status.message === "应用加载中...") {
            setStatus({ message: "无可用订阅源", type: 'warning'});
        }
    }
  // ★★ 依赖项移除了 status.message ★★
  }, [mergedSubscriptions, fetchAndParseM3u, fixedSubscriptions, userSubscriptions]); // 依赖: mergedSubscriptions, fetchAndParseM3u, fixed/user lists to detect when merging is likely done

  // Effect 4: 尝试自动加载上次频道 (基于频道列表)
  // ★★ 移除 status.type 依赖 ★★
  useEffect(() => {
    // 条件：频道列表 channels 已更新 且 状态为 subscription_loaded
    if (initialLoadStateRef.current === 'subscription_loaded') {
        const lastChannelUrl = localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY);
        console.log("Effect 4: 检查上次频道 URL:", lastChannelUrl);

        if (lastChannelUrl && channels.length > 0 && channels.some(ch => ch.url === lastChannelUrl)) {
            console.log("Effect 4: 上次频道有效，调用 loadVideoStream");
            initialLoadStateRef.current = 'channel_loading';
            loadVideoStream(lastChannelUrl, true); // true for initial load
            // ★ 标记完成移到下方，基于状态变化 ★
        } else {
            if (lastChannelUrl) console.warn("Effect 4: 上次频道无效或列表为空");
            else console.log("Effect 4: 无上次频道记录");
            initialLoadStateRef.current = 'complete'; // 无法加载频道，流程结束
            localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); // 清理无效 key
            setSelectedChannelUrl(null); // 清理无效的选中状态
        }
    }

    // ★ 如果状态从 channel_loading 变了 (加载成功/失败/缓冲)，则认为自动加载完成 ★
    if (initialLoadStateRef.current === 'channel_loading') {
        // 这里不再检查 status.type，而是假设 loadVideoStream 调用后，
        // 播放器状态会变化，此时标记完成。
        // 这个逻辑可能不完美，但避免了对 status 的直接依赖。
        // 一个更稳妥的方法是 loadVideoStream 返回 Promise 并在其 resolve/reject 中更新 ref，但这会增加复杂性。
        console.log("Effect 4: channel_loading 状态检测，标记完成");
         initialLoadStateRef.current = 'complete';
    }
  // ★★ 依赖项移除了 status.type ★★
  }, [channels, loadVideoStream]); // 依赖项: channels, loadVideoStream


  // --- 计算过滤后的频道列表 ---
  const filteredChannels = channels.filter(channel => {
    const query = channelSearchQuery.toLowerCase().trim();
    if (!query) return true;
    const nameMatch = channel.name?.toLowerCase().includes(query); // Optional chaining for safety
    const groupMatch = channel.group?.toLowerCase().includes(query);
    return nameMatch || groupMatch;
  });

  // --- 定义组件内部使用的样式 ---
  const styles = {
    searchInput: { width: 'calc(100% - 20px)', padding: '8px 10px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    channelLogo: { width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle', flexShrink: 0, objectFit: 'contain' },
    channelName: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '5px' }
  };

  // --- JSX 结构渲染 ---
  return (
    <div className="app-root">
      <header className="app-header">
        <h2 className="app-title">看看讲究将就看看</h2>
        <ThemeSwitcher />
      </header>
      {/* <SmallNote /> */}
      <div className="main-flex">
        {/* --- 左侧边栏 --- */}
        <div id="sidebar">
          {/* 添加自定义订阅 */}
          <div id="addSubscriptionArea">
            <h3>添加自定义订阅</h3>
            <AddSubscription addSubscription={handleAddUserSubscription} />
          </div>
          {/* 订阅源列表 */}
          <div id="subscriptionArea">
            <h3>订阅源列表</h3>
            <SubscriptionList
              subscriptions={mergedSubscriptions}
              removeSubscription={handleDeleteUserSubscription}
              selectSubscription={(url) => fetchAndParseM3u(url, false)} // 手动
              selectedSubscriptionUrl={selectedSubscriptionUrl}
            />
          </div>
          {/* 频道列表 */}
          <div id="channelArea">
            <h3>频道列表</h3>
            {selectedSubscriptionUrl && channels.length > 0 && (
              <input
                type="search"
                placeholder="搜索频道名称或分组..."
                value={channelSearchQuery}
                onChange={(e) => setChannelSearchQuery(e.target.value)}
                style={styles.searchInput}
                aria-label="搜索频道"
              />
            )}
            <ul id="channelList" aria-live="polite">
              {/* 条件渲染 */}
              {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (<li className="list-placeholder">请先选择订阅源</li>)}
              {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && (<li className="list-placeholder">加载频道中...</li>)}
              {selectedSubscriptionUrl && channels.length === 0 && status.type !== 'loading' && status.type !== 'error' && (<li className="list-placeholder">无可用频道或解析失败</li>)}
              {selectedSubscriptionUrl && channels.length > 0 && filteredChannels.length === 0 && channelSearchQuery && (<li className="list-placeholder">无匹配 "{channelSearchQuery}"</li>)}
              {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && (<li className="list-placeholder error-message">加载频道列表失败</li>)}
              {/* 渲染频道 */}
              {filteredChannels.map((channel) => (
                <li
                  key={channel.id}
                  className={`channel-item ${selectedChannelUrl === channel.url ? 'selected' : ''}`}
                  onClick={() => loadVideoStream(channel.url, false)} // 手动
                  title={`${channel.name || '未知'}\n组: ${channel.group || '无'}\nURL: ${channel.url || '无'}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadVideoStream(channel.url, false); }}
                >
                  {channel.logo && (<img src={channel.logo} alt="" style={styles.channelLogo} onError={(e) => { e.target.style.display = 'none'; }} loading="lazy"/>)}
                  <span style={styles.channelName}>
                    {channel.group ? `[${channel.group}] ` : ''}{channel.name || '未知频道'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* 状态显示 */}
          <div id="status" className={status.type} role="status" aria-live="assertive">
            {status.message}
          </div>
        </div>
        {/* --- 右侧主内容 --- */}
        <div id="main">
          <div id="videoArea">
            <div id="videoContainer">
               <video ref={videoRef} id="videoPlayer" controls playsInline style={{backgroundColor: '#000', width: '100%', height: '100%'}} aria-label="视频播放器">
                  浏览器不支持 HTML5 视频。
               </video>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
