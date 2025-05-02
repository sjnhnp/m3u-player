// frontend/src/App.jsx
// --- 导入 React 核心库和钩子 ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- 导入 HLS.js 库 ---
import Hls from 'hls.js';

// --- 导入子组件 ---
import SubscriptionList from './components/SubscriptionList';
import AddSubscription from './components/AddSubscription';

// --- 常量定义 ---
const USER_SUBS_LOCALSTORAGE_KEY = 'm3uPlayerUserSubscriptions';

// --- 主应用组件 App ---
function App() {
  // --- 状态定义 (State) ---
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' });

  // --- Refs ---
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // --- API 地址 ---
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 辅助函数: 获取可播放 URL (处理 HTTP in HTTPS 代理) ---
  const getPlayableUrl = useCallback((originalUrl) => {
    if (!originalUrl) {
      console.warn("getPlayableUrl 函数收到了一个空的 URL");
      return null;
    }
    try {
      const isHttp = originalUrl.toLowerCase().startsWith('http://');
      const isPageHttps = window.location.protocol === 'https:';
      if (isHttp && isPageHttps) {
        return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`;
      }
      return originalUrl;
    } catch (error) {
      console.error(`处理 URL 时发生错误: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 时发生错误，请检查链接格式: ${originalUrl}`, type: 'error' });
      return null;
    }
  }, [apiBaseUrl]);

  // --- 副作用钩子 (Effects) ---

  // Effect 1: 初始化 HLS.js 播放器、加载本地用户订阅、获取远程固定订阅 (只在组件首次加载时运行)
  useEffect(() => {
    // --- 初始化 HLS.js ---
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("浏览器支持 HLS.js，正在初始化...");
      const hls = new Hls({
        manifestLoadErrorMaxRetry: 3,
        levelLoadErrorMaxRetry: 5,
        fragLoadErrorMaxRetry: 5,
      });
      if (videoRef.current) {
          hls.attachMedia(videoRef.current);
          console.log("HLS.js 已附加到 video 元素。");
      } else {
          console.error("HLS.js 初始化时 video ref 不可用！");
      }
      hlsRef.current = hls;

      // --- HLS 事件监听 ---
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS 播放错误详情:', data);
         let errorMessage = `播放错误 (${data.type}): ${data.details || '未知详情'}`;
         // ... (之前的详细错误信息构建逻辑保持不变) ...
          if (data.fatal) { errorMessage += " (严重)"; }
          if (data.response) { errorMessage += ` - HTTP 状态: ${data.response.code || data.response.status || '未知'}`; }
          if (data.url) { errorMessage += ` - URL: ${data.url.length > 80 ? data.url.substring(0, 80) + '...' : data.url}`; }
          if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) { errorMessage += ` - 清单加载失败/超时。请检查网络、代理或源地址是否可用。`; }
          // ... 其他错误提示 ...
         setStatus({ message: errorMessage, type: 'error' });
         // ... (之前的错误恢复逻辑保持不变) ...
         if (data.fatal) { /* ... */ }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log("HLS.js: M3U8 清单已成功解析。");
            setStatus({ message: "准备播放...", type: 'loading' });
            if(videoRef.current?.paused) { // 仅在暂停状态下尝试播放，防止干扰用户手动暂停
                videoRef.current?.play().then(() => {
                    console.log("HLS.js: 视频开始播放。");
                    setStatus({ message: "正在播放...", type: 'info' });
                }).catch(e => {
                    console.warn("HLS.js: 自动播放失败:", e.message);
                    setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
                });
            } else {
                 console.log("HLS.js: 视频已在播放中或非暂停状态，MANIFEST_PARSED 不再触发 play()。");
                 // 如果已在播放，确保状态是“正在播放”
                 if (!videoRef.current?.paused) {
                     setStatus({ message: "正在播放...", type: 'info' });
                 }
            }
        });

      hls.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
            if (status.type === 'loading' || status.message === "准备播放...") {
                 setStatus({ message: "正在播放...", type: 'info' });
            }
      });

      hls.on(Hls.Events.BUFFER_STALLED, () => {
           console.warn("HLS.js: 视频缓冲停滞...");
           setStatus({ message: "缓冲中...", type: 'warning' });
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
            if (status.message === "缓冲中...") {
                setStatus({ message: "正在播放...", type: 'info' });
            }
      });

    // --- 浏览器原生 HLS 支持判断 ---
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("浏览器原生支持 HLS (如 Safari)。");
        const videoElement = videoRef.current;
        const errorHandler = (e) => { /* ... 原生错误处理 ... */ };
        const canPlayHandler = () => { /* ... 原生 canplay 处理 ... */ };
        const waitingHandler = () => { /* ... 原生 waiting 处理 ... */ };
        const playingHandler = () => { /* ... 原生 playing 处理 ... */ };
        const stalledHandler = () => { /* ... 原生 stalled 处理 ... */ };
        // ... (添加原生事件监听器) ...
         videoElement.addEventListener('error', errorHandler);
         videoElement.addEventListener('canplay', canPlayHandler);
         videoElement.addEventListener('waiting', waitingHandler);
         videoElement.addEventListener('playing', playingHandler);
         videoElement.addEventListener('stalled', stalledHandler);
         // --- 返回清理函数，移除原生监听器 ---
         return () => {
             if (videoElement) { // 确保 videoElement 存在
                 console.log("移除原生 HLS 事件监听器。");
                 videoElement.removeEventListener('error', errorHandler);
                 videoElement.removeEventListener('canplay', canPlayHandler);
                 videoElement.removeEventListener('waiting', waitingHandler);
                 videoElement.removeEventListener('playing', playingHandler);
                 videoElement.removeEventListener('stalled', stalledHandler);
             }
         };
    } else {
        console.error("浏览器不支持 HLS 播放。");
        setStatus({ message: "抱歉，您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }

    // --- 加载本地存储的用户订阅 ---
    try {
        const storedUserSubs = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY);
        const initialUserSubs = storedUserSubs ? JSON.parse(storedUserSubs) : [];
        if (Array.isArray(initialUserSubs) && initialUserSubs.every(item => item && item.id && item.name && item.url)) {
             setUserSubscriptions(initialUserSubs);
             console.log("从 LocalStorage 加载用户订阅:", initialUserSubs.length, "个");
        } else {
            // ... (处理无效本地数据) ...
             if(storedUserSubs) { console.warn("LocalStorage 用户订阅数据格式不正确，已重置。"); }
             setUserSubscriptions([]);
             localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([]));
        }
    } catch (error) {
        // ... (处理加载本地数据错误) ...
         console.error("从 LocalStorage 加载用户订阅失败:", error);
         setUserSubscriptions([]);
         setStatus({ message: "加载本地订阅失败，请检查浏览器设置。", type: 'warning' });
    }

    // --- 获取后台配置的固定订阅列表 ---
    const fetchFixedSubs = async () => {
      setStatus(prev => ({ ...prev, message: "正在获取固定订阅列表..." }));
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) throw new Error(`获取固定列表失败: HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data) && data.every(item => item && item.name && item.url)) {
           setFixedSubscriptions(data);
           console.log("从 Worker 获取固定订阅:", data.length, "个");
        } else {
           // ... (处理无效远程数据) ...
             console.error("Worker 返回的固定订阅数据格式不正确。");
             setFixedSubscriptions([]);
             setStatus({ message: "获取固定订阅列表格式错误。", type: 'error' });
        }
      } catch (error) {
        // ... (处理获取远程数据错误) ...
         console.error('获取固定订阅列表时出错:', error);
         setFixedSubscriptions([]);
         setStatus({ message: `获取固定订阅列表出错: ${error.message}`, type: 'error' });
      }
    };

    fetchFixedSubs();

    // --- 组件卸载时的清理函数 ---
    return () => {
        // 销毁 HLS 实例
        if (hlsRef.current) {
            hlsRef.current.destroy();
            console.log("HLS instance destroyed on unmount.");
        }
        // (原生 HLS 的监听器清理已在其判断分支中返回)
    };
  }, [apiBaseUrl]); // 依赖项: apiBaseUrl

  // Effect 2: 合并固定列表和用户列表
  useEffect(() => {
    const merged = [
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true, id: `fixed_${sub.url}` })),
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并后的订阅列表:", merged.length, "个");
    if (status.message.includes("加载中") || status.message.includes("获取固定订阅列表")) {
        setStatus({ message: merged.length > 0 ? "请选择一个订阅源" : "请添加您的第一个自定义订阅", type: 'info'});
    }
  }, [fixedSubscriptions, userSubscriptions, status.message]); // 添加 status.message 依赖确保状态更新及时

  // --- 事件处理函数 (Event Handlers) ---

  // 处理添加用户自定义订阅
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData;
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) || userSubscriptions.some(sub => sub.url === url);
    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${url}" 已存在，无法重复添加。`, type: 'warning' });
      return;
    }
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url };
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs);
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${name}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存到 LocalStorage");
    } catch (error) {
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        setStatus({ message: `添加 "${name}" 成功，但保存到本地存储失败！`, type: 'warning' });
    }
  }, [userSubscriptions, fixedSubscriptions]);

  // 处理删除用户自定义订阅
  const handleDeleteUserSubscription = useCallback((idToDelete) => {
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete || !window.confirm(`确定要删除自定义订阅 "${subToDelete.name}" 吗？`)) {
          return;
      }
      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs);
      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已成功删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage");
          if (selectedSubscriptionUrl === subToDelete.url) {
              console.log("删除了当前选中的订阅源，重置频道列表和播放器。");
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null);
              // --- 重置播放器 ---
              if (videoRef.current) videoRef.current.pause();
              if (hlsRef.current) {
                  hlsRef.current.stopLoad();
                  hlsRef.current.detachMedia(); // 确保解绑
              }
              if (videoRef.current) {
                  videoRef.current.removeAttribute('src');
                  // 不需要 videoRef.current.load();
              }
              setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' });
          }
      } catch (error) {
           console.error("从 LocalStorage 删除用户订阅失败:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 失败，无法更新本地存储！`, type: 'error' });
      }
  }, [userSubscriptions, selectedSubscriptionUrl]);

  // 处理选择订阅源，获取并解析 M3U 列表
  const fetchAndParseM3u = useCallback(async (originalM3uUrl) => {
    if (!originalM3uUrl) return;
    setSelectedSubscriptionUrl(originalM3uUrl);
    const selectedSub = mergedSubscriptions.find(sub => sub.url === originalM3uUrl);
    const subName = selectedSub?.name || originalM3uUrl.split('/').pop() || originalM3uUrl;
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]);
    setSelectedChannelUrl(null);

    // --- ★★★ 重置播放器 (切换订阅源时) ★★★ ---
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) {
        console.log("fetchAndParseM3u: Stopping HLS load and detaching media.");
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia(); // 明确解绑
    }
    if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        // --- ★ 移除这里的 videoRef.current.load() ---
        // try { videoRef.current.load(); } catch(e) {/* Ignore */}
    }
    // --- ★★★ 重置结束 ★★★ ---

    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
      setStatus({ message: `无法处理此订阅 URL: ${originalM3uUrl}`, type: 'error' });
      return;
    }
    console.log(`将从以下地址获取 M3U 内容: ${urlToFetch}`);

    try {
      const response = await fetch(urlToFetch);
      if (!response.ok) throw new Error(`获取 M3U 文件失败: HTTP ${response.status} ${response.statusText}`);
      const m3uText = await response.text();

      // --- M3U 解析逻辑 (保持不变) ---
      const parsedChannels = [];
      const lines = m3uText.split('\n');
      let currentChannelInfo = null;
      for (const line of lines) {
        // ... (解析 #EXTINF, URL, logo, group, 生成 channel.id 的逻辑不变) ...
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('#EXTINF:')) {
              currentChannelInfo = { id: '', name: '', url: '', logo: '', group: '' };
              const commaIndex = trimmedLine.indexOf(',');
              if (commaIndex !== -1) {
                  currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
                  const attributesPart = trimmedLine.substring(8, commaIndex);
                  const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
                  if (logoMatch) currentChannelInfo.logo = logoMatch[1];
                  const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
                  if (groupMatch) currentChannelInfo.group = groupMatch[1];
              } else {
                  currentChannelInfo.name = trimmedLine.substring(8).trim();
              }
          } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
              if (trimmedLine.includes('://')) {
                  currentChannelInfo.url = trimmedLine;
                  currentChannelInfo.id = `ch_${currentChannelInfo.url}_${currentChannelInfo.name}_${parsedChannels.length}`;
                  parsedChannels.push(currentChannelInfo);
              } else {
                  console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine} (关联频道: ${currentChannelInfo.name})`);
              }
              currentChannelInfo = null;
          }
      }

      setChannels(parsedChannels);
      setStatus({
           message: `"${subName}" 加载完成，共找到 ${parsedChannels.length} 个频道。`,
           type: parsedChannels.length > 0 ? 'info' : 'warning'
       });

    } catch (error) {
      // ... (错误处理逻辑不变) ...
        console.error(`加载或解析 M3U (${originalM3uUrl}) 时出错:`, error);
        let errorMsg = `加载 "${subName}" 的频道列表时出错: ${error.message}`;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) { errorMsg += ` - 请检查网络连接、代理服务(${apiBaseUrl})或目标源(${originalM3uUrl})是否可用或超时。`; }
        else if (error.message.includes('HTTP 404')) { errorMsg += ` - 目标地址未找到。`; }
        setStatus({ message: errorMsg, type: 'error'});
        setChannels([]);
    }
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]);

  // 处理选择频道，加载并播放视频流
  const loadVideoStream = useCallback((originalChannelUrl) => {
    if (!originalChannelUrl) {
        console.warn("loadVideoStream 收到空 URL");
        return;
    }
    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `正在加载频道...`, type: 'loading' });

    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
      setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
      return;
    }
    console.log(`播放器将要加载的源: ${urlToPlay}`);

    // --- ★★★ 根据播放方式执行加载 ★★★ ---
    if (hlsRef.current) {
        // --- 使用 HLS.js ---
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        hlsRef.current.stopLoad(); // 先停止之前的加载
        hlsRef.current.detachMedia(); // ★ 显式解绑
        if(videoRef.current) {
            console.log("HLS.js: Re-attaching media and loading source.");
            hlsRef.current.attachMedia(videoRef.current); // ★ 重新绑定
            hlsRef.current.loadSource(urlToPlay); // 加载新源
            // 播放由 MANIFEST_PARSED 事件触发
        } else {
            console.error("HLS.js: Video element ref is not available for attachMedia");
            setStatus({ message: "播放器元素丢失，无法加载视频。", type: 'error' });
        }
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // --- 使用浏览器原生 HLS ---
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        if(videoRef.current) {
             videoRef.current.pause(); // 先暂停
             videoRef.current.src = urlToPlay; // 设置新源
             videoRef.current.load(); // ★ 对于原生 HLS，需要调用 load()
             videoRef.current.play().catch(e => { // 尝试播放
                console.error("原生 HLS 播放失败:", e.message);
                setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
             });
        } else {
             console.error("Native HLS: Video element ref is not available");
             setStatus({ message: "播放器元素丢失，无法加载视频。", type: 'error' });
        }
    } else {
        // --- 不支持 HLS ---
        setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }
    // --- ★★★ 加载逻辑结束 ★★★ ---

  }, [getPlayableUrl]);

  // --- JSX 结构渲染 ---
  return (
    <>
      <h2>M3U 播放器</h2>
      <div id="sidebar">
        {/* 添加自定义订阅区域 */}
        <div id="addSubscriptionArea">
            <h3>添加自定义订阅</h3>
            <AddSubscription addSubscription={handleAddUserSubscription} />
        </div>
        {/* 订阅源列表区域 */}
        <div id="subscriptionArea">
          <h3>订阅源列表</h3>
           <SubscriptionList
                subscriptions={mergedSubscriptions}
                removeSubscription={handleDeleteUserSubscription}
                selectSubscription={fetchAndParseM3u}
                selectedSubscriptionUrl={selectedSubscriptionUrl}
           />
        </div>
        {/* 频道列表区域 */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList">
             {/* ... (条件渲染和频道列表 map 逻辑不变) ... */}
             {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && ( <li>请先选择一个订阅源</li> )}
             {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && ( <li>加载频道中...</li> )}
             {selectedSubscriptionUrl && channels.length === 0 && status.type === 'warning' && status.message.includes("找到 0 个频道") && ( <li>此订阅源没有找到可用频道或解析失败</li> )}
             {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && status.message.includes("频道列表时出错") && ( <li>加载频道列表失败，请检查源或代理</li> )}
             {channels.map((channel) => (
               <li key={channel.id} className={selectedChannelUrl === channel.url ? 'selected' : ''} onClick={() => loadVideoStream(channel.url)} title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`}>
                  {channel.logo && ( <img src={channel.logo} alt="" style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} /> )}
                  <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                     {channel.group ? `[${channel.group}] ` : ''}
                     {channel.name || '未知频道'}
                  </span>
               </li>
             ))}
          </ul>
        </div>
        {/* 状态显示区域 */}
        <div id="status" className={status.type}>
          {status.message}
        </div>
      </div> {/* sidebar end */}
      {/* 右侧主内容区域 */}
      <div id="main">
        {/* 视频播放区域 */}
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer">
            <video ref={videoRef} id="videoPlayer" controls playsInline style={{backgroundColor: '#000', width: '100%', height: '100%'}}></video>
          </div>
        </div>
      </div> {/* main end */}
    </>
  );
}

export default App;
