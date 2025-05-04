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
    <div style={{ color: '#888', fontSize: '13px', marginBottom: '16px', marginTop: '-8px' }}>
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
      if (isHttp && isPageHttps) { return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`; }
      return originalUrl;
    } catch (error) {
      console.error(`处理 URL 出错: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 出错: ${originalUrl}`, type: 'error' });
      return null;
    }
  }, [apiBaseUrl]);

  // --- 事件处理函数 ---

  // 处理选择订阅源 (fetchAndParseM3u) - 保持不变
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
    setChannels([]);
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
              currentChannelInfo = null;
          }
      }

      setChannels(parsedChannels);
      setStatus({
           message: `"${subName}" 加载完成: ${parsedChannels.length} 个频道`,
           type: parsedChannels.length > 0 ? 'info' : 'warning'
       });

      if (isInitialLoad) {
          console.log("fetchAndParseM3u (Initial): 成功，状态 -> subscription_loaded");
          initialLoadStateRef.current = 'subscription_loaded';
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
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]); // 依赖项不变

  // 处理选择频道 (loadVideoStream) - 保持不变
  const loadVideoStream = useCallback((originalChannelUrl, isInitialLoad = false) => {
    if (!originalChannelUrl) { console.warn("loadVideoStream: 空 URL"); return; }
    console.log(`loadVideoStream 调用: URL=${originalChannelUrl}, isInitialLoad=${isInitialLoad}`);

    if (!isInitialLoad) { initialLoadStateRef.current = 'complete'; }

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

    if (hlsRef.current) { // HLS.js
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        const hls = hlsRef.current;
        hls.stopLoad(); hls.detachMedia(); hls.attachMedia(videoElement); hls.loadSource(urlToPlay);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) { // 原生 HLS
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        videoElement.pause(); videoElement.src = urlToPlay; videoElement.load();
        videoElement.play().catch(e => { console.warn("原生 HLS 自动播放失败:", e.message); setStatus({ message: "播放器已加载，请点击播放", type: 'info' }); });
    } else { // 不支持 HLS
        setStatus({ message: "浏览器不支持 HLS", type: 'error' });
        if (isInitialLoad) initialLoadStateRef.current = 'complete';
    }
  }, [getPlayableUrl]);

  // 处理添加用户订阅 - 保持不变
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
  }, [userSubscriptions, fixedSubscriptions]);

  // 处理删除用户订阅 - 保持不变
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
              setSelectedSubscriptionUrl(null); setChannels([]); setSelectedChannelUrl(null);
              if (videoRef.current) videoRef.current.pause();
              if (hlsRef.current) { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); }
              if (videoRef.current) { videoRef.current.removeAttribute('src'); videoRef.current.load(); }
              localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY); localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
              setStatus({ message: "当前订阅已删除，播放器已重置", type: 'info' });
          }
      } catch (error) {
           console.error("删除订阅或清除 localStorage 出错:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 时出错`, type: 'error' });
      }
  }, [userSubscriptions, selectedSubscriptionUrl]);

  // --- 副作用钩子 (Effects) ---

  // Effect 1: 初始化 HLS, 加载本地/固定订阅 (首次加载) - 保持不变
  useEffect(() => {
    let hlsInstance = null;
    let nativeListenersAttached = false;
    const videoElement = videoRef.current;

    if (typeof Hls !== 'undefined' && Hls.isSupported() && videoElement) {
      console.log("初始化 HLS.js");
      const hls = new Hls({ manifestLoadErrorMaxRetry: 3, levelLoadErrorMaxRetry: 5, fragLoadErrorMaxRetry: 5 });
      hlsInstance = hls; hls.attachMedia(videoElement); hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (event, data) => { console.error('HLS Error:', data); let msg = `播放错误 (${data.type}): ${data.details || '未知'}`; if(data.fatal) msg += " (严重)"; setStatus({ message: msg, type: 'error' }); if(data.fatal) { if(data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError(); } });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus(prev => ({ ...prev, message: "准备播放...", type: 'loading' })); videoElement?.play().catch(e => console.warn("自动播放失败:", e.message)); });
      hls.on(Hls.Events.BUFFER_STALLED, () => setStatus({ message: "缓冲中...", type: 'warning' }));
      hls.on(Hls.Events.BUFFER_APPENDED, () => { if(status.message === "缓冲中..." || status.message === "准备播放...") { setStatus({ message: "正在播放...", type: 'info' }); } });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { if(status.type === 'loading' || status.message === "准备播放...") { setStatus({ message: "正在播放...", type: 'info' }); } });
    } else if (videoElement?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("使用原生 HLS");
        const handlers = { onError: (e) => { console.error('原生 HLS Error:', e, videoElement.error); setStatus({ message: `播放错误: ${videoElement.error?.message || '未知'}`, type: 'error' }); }, onCanPlay: () => { if (status.type === 'loading') setStatus({ message: "正在播放...", type: 'info' }); }, onWaiting: () => setStatus({ message: "缓冲中...", type: 'warning' }), onPlaying: () => { if (status.message !== "正在播放...") setStatus({ message: "正在播放...", type: 'info' }); }, onStalled: () => setStatus({ message: "缓冲中...", type: 'warning' }), };
        videoElement.addEventListener('error', handlers.onError); videoElement.addEventListener('canplay', handlers.onCanPlay); videoElement.addEventListener('waiting', handlers.onWaiting); videoElement.addEventListener('playing', handlers.onPlaying); videoElement.addEventListener('stalled', handlers.onStalled);
        nativeListenersAttached = true; videoElement._nativeHlsHandlers = handlers;
    } else { console.error("浏览器不支持 HLS"); setStatus({ message: "抱歉，浏览器不支持 HLS 播放", type: 'error' }); }

    try { const stored = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY); const initial = stored ? JSON.parse(stored) : []; if (Array.isArray(initial) && initial.every(i => i && i.id && i.name && i.url)) { setUserSubscriptions(initial); console.log("加载用户订阅:", initial.length); } else { if(stored) console.warn("本地订阅格式错误"); setUserSubscriptions([]); localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([])); } } catch (e) { console.error("加载用户订阅失败:", e); setUserSubscriptions([]); setStatus(prev => ({ ...prev, message: "加载本地订阅失败", type: 'warning' })); }

    const fetchFixed = async () => { console.log("获取固定订阅..."); try { const res = await fetch(`${apiBaseUrl}/fixed-subscriptions`); if (!res.ok) throw new Error(`HTTP ${res.status}`); const data = await res.json(); if (Array.isArray(data) && data.every(i => i && i.name && i.url)) { setFixedSubscriptions(data); console.log("获取固定订阅:", data.length); } else { console.error("固定订阅格式错误"); setFixedSubscriptions([]); setStatus(prev => ({ ...prev, message: "获取固定订阅格式错误", type: 'error' })); } } catch (e) { console.error('获取固定订阅出错:', e); setFixedSubscriptions([]); setStatus(prev => ({ ...prev, message: `获取固定订阅出错: ${e.message}`, type: 'error' })); } };
    fetchFixed();

    return () => { if (hlsInstance) { hlsInstance.destroy(); console.log("HLS instance destroyed"); } if (nativeListenersAttached && videoElement && videoElement._nativeHlsHandlers) { console.log("移除原生 HLS 监听器"); const h = videoElement._nativeHlsHandlers; videoElement.removeEventListener('error', h.onError); videoElement.removeEventListener('canplay', h.onCanPlay); videoElement.removeEventListener('waiting', h.onWaiting); videoElement.removeEventListener('playing', h.onPlaying); videoElement.removeEventListener('stalled', h.onStalled); delete videoElement._nativeHlsHandlers; } };
  }, [apiBaseUrl]);

  // Effect 2: 合并订阅列表 - 保持不变
  useEffect(() => {
    const merged = [
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true, id: `fixed_${sub.url}` })),
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    // ★ 只有当列表实际内容变化时才更新状态，避免不必要的重渲染 ★
    if (JSON.stringify(merged) !== JSON.stringify(mergedSubscriptions)) {
        setMergedSubscriptions(merged);
        console.log("合并订阅列表更新:", merged.length);
    }
  }, [fixedSubscriptions, userSubscriptions, mergedSubscriptions]); // 添加 mergedSubscriptions 依赖用于比较

  // ★★★ Effect 3: 尝试自动加载上次订阅 (修正逻辑避免过早失败) ★★★
  useEffect(() => {
   // console.log(`Effect 3 Triggered. State: ${initialLoadStateRef.current}, Merged Subs: ${mergedSubscriptions.length}, Fixed Subs: ${fixedSubscriptions.length}`);

    // Only run the core logic if we are still in the initial pending state
    if (initialLoadStateRef.current === 'pending') {
      // Attempt auto-load only if we have some merged subscriptions already
      if (mergedSubscriptions.length > 0) {
        const lastSubUrl = localStorage.getItem(LAST_SELECTED_SUB_URL_KEY);
      //  console.log("Effect 3: [Pending State] Checking lastSubUrl:", lastSubUrl);

        if (lastSubUrl) {
          const subscriptionExists = mergedSubscriptions.some(sub => sub.url === lastSubUrl);
       //   console.log("Effect 3: [Pending State] Subscription exists in current merged list?", subscriptionExists);

          if (subscriptionExists) {
            // SUCCESS CASE: Found the URL in the current list
        //    console.log("Effect 3: [Pending State] Valid last subscription found. Calling fetchAndParseM3u.");
            initialLoadStateRef.current = 'subscription_loading'; // Move to next state
            fetchAndParseM3u(lastSubUrl, true); // Call the load function
          } else {
            // URL in localStorage, but NOT in the current merged list.
            // IS IT REALLY INVALID? Or is the list just incomplete?
            // Only consider it *truly* invalid if the fixed subscriptions have already been loaded (or failed).
            // We use fixedSubscriptions.length > 0 as a proxy for the fetch attempt being complete.
            // AND userSubscriptions are loaded (which happens early).
            const fixedSubsFetchAttempted = fixedSubscriptions.length > 0; // Or check a dedicated loading state if available
            const userSubsLoaded = true; // Assumed loaded by this point

            if (fixedSubsFetchAttempted && userSubsLoaded) {
              // If both sources are loaded/attempted, and the URL is *still* not found, THEN it's likely invalid.
          //    console.warn("Effect 3: [Pending State] lastSubUrl not found in merged list, AND fixed/user subs seem loaded. Marking as invalid.");
              initialLoadStateRef.current = 'complete'; // Mark auto-load as complete (failed)
              localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
              localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
              // Clear the state only if it matches the invalid URL
              if (selectedSubscriptionUrl === lastSubUrl) {
                setSelectedSubscriptionUrl(null);
                setSelectedChannelUrl(null);
              }
              setStatus({ message: "上次选择的订阅源已失效", type: 'warning' });
            } else {
              // Fixed subs haven't loaded yet. The list might still update. Do nothing and wait.
          //    console.log("Effect 3: [Pending State] lastSubUrl not found, but fixed subs not loaded yet. Waiting...");
            }
          }
        } else {
          // NO URL found in localStorage. Auto-load is not possible.
        //  console.log("Effect 3: [Pending State] No lastSubUrl found in localStorage. Marking auto-load as complete.");
          initialLoadStateRef.current = 'complete'; // Mark auto-load as complete (no record)
          // Set initial message only if status hasn't been changed by errors etc.
          if (status.message === "应用加载中...") {
            setStatus({ message: mergedSubscriptions.length > 0 ? "请选择一个订阅源" : "无可用订阅源", type: 'info' });
          }
        }
      } else {
        // Pending state, but merged list is still empty. Wait for Effect 2 to run.
     //   console.log("Effect 3: [Pending State] Merged list is empty, waiting for data...");
      }
    } else {
      // Not in 'pending' state, skip the auto-load logic.
   //   console.log("Effect 3: [Not Pending State] Skipping auto-load logic.");
    }
    // ★★ Dependencies: Trigger when merged list or fixed list changes ★★
    // We need fixedSubscriptions here to know when the fetch attempt is likely complete.
  }, [mergedSubscriptions, fixedSubscriptions, fetchAndParseM3u, selectedSubscriptionUrl, status.message]); // Added dependencies


  // Effect 4: 尝试自动加载上次频道 (基于频道列表) - 保持不变
  useEffect(() => {
    if (initialLoadStateRef.current === 'subscription_loaded') {
        const lastChannelUrl = localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY);
     //   console.log("Effect 4: [Sub Loaded State] Checking lastChannelUrl:", lastChannelUrl);
        if (lastChannelUrl && channels.length > 0 && channels.some(ch => ch.url === lastChannelUrl)) {
       //     console.log("Effect 4: [Sub Loaded State] Valid last channel found. Calling loadVideoStream.");
            initialLoadStateRef.current = 'channel_loading';
            loadVideoStream(lastChannelUrl, true);
        } else {
            if (lastChannelUrl) console.warn("Effect 4: [Sub Loaded State] lastChannelUrl found but invalid or channel list empty.");
            else console.log("Effect 4: [Sub Loaded State] No lastChannelUrl found.");
            initialLoadStateRef.current = 'complete';
            localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
            if (selectedChannelUrl === lastChannelUrl) { setSelectedChannelUrl(null); }
        }
    }
    // 检测频道加载是否开始（状态变为 loading 或其他），标记自动加载流程完成
    if (initialLoadStateRef.current === 'channel_loading') {
    //    console.log("Effect 4: Detecting channel loading state change, marking auto-load complete.");
        initialLoadStateRef.current = 'complete'; // 标记完成
    }
  }, [channels, loadVideoStream, selectedChannelUrl]); // 添加 selectedChannelUrl 依赖以处理清除状态

  // --- 计算过滤后的频道列表 - 保持不变 ---
  const filteredChannels = channels.filter(channel => {
    const query = channelSearchQuery.toLowerCase().trim();
    if (!query) return true;
    const nameMatch = channel.name?.toLowerCase().includes(query);
    const groupMatch = channel.group?.toLowerCase().includes(query);
    return nameMatch || groupMatch;
  });

  // --- 定义组件内部使用的样式 - 保持不变 ---
  const styles = {
    searchInput: { width: 'calc(100% - 20px)', padding: '8px 10px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    channelLogo: { width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle', flexShrink: 0, objectFit: 'contain' },
    channelName: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '5px' }
  };

  // --- JSX 结构渲染 - 保持不变 ---
  return (
    <div className="app-root">
      <header className="app-header"> <h2 className="app-title">看看讲究将就看看</h2> <ThemeSwitcher /> </header>
      {/* <SmallNote /> */}
      <div className="main-flex">
        <div id="sidebar">
          <div id="addSubscriptionArea"> <h3>添加自定义订阅</h3> <AddSubscription addSubscription={handleAddUserSubscription} /> </div>
          <div id="subscriptionArea"> <h3>订阅源列表</h3> <SubscriptionList subscriptions={mergedSubscriptions} removeSubscription={handleDeleteUserSubscription} selectSubscription={(url) => fetchAndParseM3u(url, false)} selectedSubscriptionUrl={selectedSubscriptionUrl} /> </div>
          <div id="channelArea">
            <h3>频道列表</h3>
            {selectedSubscriptionUrl && channels.length > 0 && (<input type="search" placeholder="搜索频道名称或分组..." value={channelSearchQuery} onChange={(e) => setChannelSearchQuery(e.target.value)} style={styles.searchInput} aria-label="搜索频道" />)}
            <ul id="channelList" aria-live="polite">
              {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (<li className="list-placeholder">请先选择订阅源</li>)}
              {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && (<li className="list-placeholder">加载频道中...</li>)}
              {selectedSubscriptionUrl && channels.length === 0 && status.type !== 'loading' && status.type !== 'error' && (<li className="list-placeholder">无可用频道或解析失败</li>)}
              {selectedSubscriptionUrl && channels.length > 0 && filteredChannels.length === 0 && channelSearchQuery && (<li className="list-placeholder">无匹配 "{channelSearchQuery}"</li>)}
              {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && (<li className="list-placeholder error-message">加载频道列表失败</li>)}
              {filteredChannels.map((channel) => (
                <li key={channel.id} className={`channel-item ${selectedChannelUrl === channel.url ? 'selected' : ''}`} onClick={() => loadVideoStream(channel.url, false)} title={`${channel.name || '未知'}\n组: ${channel.group || '无'}\nURL: ${channel.url || '无'}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadVideoStream(channel.url, false); }} >
                  {channel.logo && (<img src={channel.logo} alt="" style={styles.channelLogo} onError={(e) => { e.target.style.display = 'none'; }} loading="lazy"/>)}
                  <span style={styles.channelName}> {channel.group ? `[${channel.group}] ` : ''}{channel.name || '未知频道'} </span>
                </li>
              ))}
            </ul>
          </div>
          <div id="status" className={status.type} role="status" aria-live="assertive"> {status.message} </div>
        </div>
        <div id="main">
          <div id="videoArea"> <div id="videoContainer"> <video ref={videoRef} id="videoPlayer" controls playsInline style={{backgroundColor: '#000', width: '100%', height: '100%'}} aria-label="视频播放器"> 浏览器不支持 HTML5 视频。 </video> </div> </div>
        </div>
      </div>
    </div>
  );
}

export default App;
