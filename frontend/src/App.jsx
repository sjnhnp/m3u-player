// frontend/src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'; // 添加 useCallback
import Hls from 'hls.js';

// --- 组件导入 ---
// 注意：现在不需要导入 Player 和 AddSubscription 了，因为它们被直接用在 JSX 里
// import Player from './components/Player'; // Player 只需 video 标签即可
import SubscriptionList from './components/SubscriptionList'; // 导入列表组件
import AddSubscription from './components/AddSubscription';   // 导入添加组件

// --- 常量 ---
const USER_SUBS_LOCALSTORAGE_KEY = 'm3uPlayerUserSubscriptions'; // LocalStorage 键名

function App() {
  // --- 状态定义 (State) ---
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);     // 固定订阅列表 (来自 Worker)
  const [userSubscriptions, setUserSubscriptions] = useState([]);       // 用户自定义订阅列表 (来自 LocalStorage)
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]); // 合并后的列表，用于显示

  const [channels, setChannels] = useState([]);
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' });
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);

  // --- Refs ---
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // --- API 地址 ---
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 获取可播放 URL 的辅助函数 (getPlayableUrl) ---
  // 这个函数保持不变，依然重要
  const getPlayableUrl = useCallback((originalUrl) => { // 使用 useCallback 包裹
    if (!originalUrl) {
      console.warn("getPlayableUrl 函数收到了一个空的 URL");
      return null;
    }
    try {
      const isHttp = originalUrl.toLowerCase().startsWith('http://');
      const isPageHttps = window.location.protocol === 'https:';
      if (isHttp && isPageHttps) {
        // console.log(`需要代理 HTTP URL: ${originalUrl}`); // 减少日志
        return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`;
      }
      return originalUrl;
    } catch (error) {
      console.error(`处理 URL 时发生错误: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 时发生错误: ${originalUrl}`, type: 'error' });
      return null;
    }
  }, [apiBaseUrl]); // 依赖 apiBaseUrl

  // --- 副作用 (Effects) ---

  // Effect 1: 初始化 HLS 和加载固定/用户订阅列表 (只运行一次)
  useEffect(() => {
    // 初始化 HLS (代码与之前类似，保持不变)
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        // ... (之前的 HLS 初始化和事件监听代码) ...
         const hls = new Hls({ /* ... config ... */ });
         hls.attachMedia(videoRef.current);
         hlsRef.current = hls;
         hls.on(Hls.Events.ERROR, (event, data) => { /* ... error handling ... */ });
         hls.on(Hls.Events.MANIFEST_PARSED, () => { /* ... manifest parsed handling ... */ });
         // ... 其他 HLS 事件监听 ...
         console.log("HLS.js 初始化完成");
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // ... (之前的原生 HLS 事件监听代码) ...
        console.log("浏览器原生支持 HLS");
    } else {
        setStatus({ message: "抱歉，您的浏览器不支持 HLS 播放。", type: 'error' });
    }

    // 加载用户订阅列表 (从 LocalStorage)
    try {
        const storedUserSubs = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY);
        const initialUserSubs = storedUserSubs ? JSON.parse(storedUserSubs) : [];
        // 基本验证，确保是个数组
        if (Array.isArray(initialUserSubs)) {
             setUserSubscriptions(initialUserSubs);
             console.log("从 LocalStorage 加载用户订阅:", initialUserSubs.length, "个");
        } else {
             console.warn("LocalStorage 中的用户订阅数据格式不正确，已重置为空数组。");
             setUserSubscriptions([]);
             localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([])); // 清理无效数据
        }

    } catch (error) {
        console.error("从 LocalStorage 加载用户订阅失败:", error);
        setUserSubscriptions([]); // 出错时确保是空数组
        setStatus({ message: "加载本地订阅失败，请检查浏览器设置。", type: 'warning' });
    }


    // 获取固定订阅列表 (从 Worker)
    const fetchFixedSubs = async () => {
      setStatus({ message: "正在获取固定订阅列表...", type: 'loading' });
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) {
          throw new Error(`获取固定列表失败: HTTP ${response.status}`);
        }
        const data = await response.json();
        // 基本验证
        if (Array.isArray(data)) {
           setFixedSubscriptions(data);
           console.log("从 Worker 获取固定订阅:", data.length, "个");
           // 初始状态消息可以等合并后再设置
        } else {
           console.error("Worker 返回的固定订阅数据格式不正确。");
           setFixedSubscriptions([]);
           setStatus({ message: "获取固定订阅列表格式错误。", type: 'error' });
        }
      } catch (error) {
        console.error('获取固定订阅列表时出错:', error);
        setFixedSubscriptions([]); // 出错时确保是空数组
        setStatus({ message: `获取固定订阅列表出错: ${error.message}`, type: 'error' });
      }
    };

    fetchFixedSubs();

    // 清理函数
    return () => {
      hlsRef.current?.destroy();
      console.log("HLS instance destroyed on unmount.");
    };
  }, [apiBaseUrl]); // 依赖 apiBaseUrl (通常不变)

  // Effect 2: 合并固定和用户列表 (当 fixed 或 user 列表变化时运行)
  useEffect(() => {
    const merged = [
      // 固定列表项，标记 isFixed: true
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true })),
      // 用户列表项，标记 isFixed: false
      // 确保用户列表项有 id (在添加时生成)
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并后的订阅列表:", merged.length, "个");

    // 更新初始状态信息（仅当列表加载完成时）
    if(status.message === "正在获取固定订阅列表...") {
        setStatus({ message: merged.length > 0 ? "请选择一个订阅" : "请添加您的第一个订阅", type: 'info'});
    }

  }, [fixedSubscriptions, userSubscriptions, status.message]); // 当 fixed 或 user 列表更新后，重新合并


  // --- 事件处理函数 (Event Handlers) ---

  // 添加用户订阅 (操作 LocalStorage)
  const handleAddUserSubscription = useCallback((newSubData) => { // 使用 useCallback
    const { name, url } = newSubData;
    // 去重检查 (检查 URL 是否已存在于固定或用户列表中)
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) ||
                       userSubscriptions.some(sub => sub.url === url);

    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${url}" 已存在，无法重复添加。`, type: 'warning' });
      return;
    }

    // 生成唯一 ID (简单方式)
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url };

    // 更新状态和 LocalStorage
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs);
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${name}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存到 LocalStorage");
    } catch (error) {
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        setStatus({ message: "添加订阅成功，但保存到本地失败！", type: 'warning' });
        // 可选：回滚状态？ setUserSubscriptions(userSubscriptions);
    }
  }, [userSubscriptions, fixedSubscriptions]); // 依赖项


  // 删除用户订阅 (操作 LocalStorage)
  const handleDeleteUserSubscription = useCallback((idToDelete) => { // 使用 useCallback
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete) {
           console.warn("尝试删除一个不存在的用户订阅 ID:", idToDelete);
           return;
      }

      if (!window.confirm(`确定要删除自定义订阅 "${subToDelete.name}" 吗？`)) {
          return; // 用户取消
      }

      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs);
      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage");

          // 如果删除的是当前选中的订阅，重置相关状态
          if (selectedSubscriptionUrl === subToDelete.url) {
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null);
              // 停止播放器
              videoRef.current?.pause();
              if (hlsRef.current) {
                  hlsRef.current.stopLoad();
                  // hlsRef.current.detachMedia(); // loadSource 会处理
              }
              if (videoRef.current) {
                  videoRef.current.removeAttribute('src');
                  videoRef.current.load();
              }
               setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' });
          }
      } catch (error) {
           console.error("从 LocalStorage 删除用户订阅失败:", error);
           setStatus({ message: "删除订阅失败，无法更新本地存储！", type: 'error' });
           // 可选：回滚状态？ setUserSubscriptions(userSubscriptions);
      }

  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项

  // 获取和解析 M3U 列表 (fetchAndParseM3u) - 基本不变
  const fetchAndParseM3u = useCallback(async (originalM3uUrl) => {
    if (!originalM3uUrl) return;
    setSelectedSubscriptionUrl(originalM3uUrl);
    const subName = originalM3uUrl.split('/').pop() || originalM3uUrl;
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]);
    setSelectedChannelUrl(null);

    videoRef.current?.pause();
    if (hlsRef.current) hlsRef.current.stopLoad();
    if (videoRef.current) { videoRef.current.removeAttribute('src'); videoRef.current.load(); }

    const urlToFetch = getPlayableUrl(originalM3uUrl); // 使用 useCallback 包装的 getPlayableUrl
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
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('#EXTINF:')) {
              currentChannelInfo = { name: '', url: '', logo: '', group: '' };
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
                  // ★ 重要补充：给解析出的频道也加上唯一 ID，方便 React 渲染
                  currentChannelInfo.id = `ch_${currentChannelInfo.url}_${parsedChannels.length}`;
                  parsedChannels.push(currentChannelInfo);
              } else {
                  console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine}`);
              }
              currentChannelInfo = null;
          }
      }
      // --- M3U 解析逻辑结束 ---

      setChannels(parsedChannels);
      setStatus({
           message: `"${subName}" 加载完成，共找到 ${parsedChannels.length} 个频道。`,
           type: parsedChannels.length > 0 ? 'info' : 'warning'
       });

    } catch (error) {
      console.error('加载或解析 M3U 时出错:', error);
      let errorMsg = `加载 "${subName}" 的频道列表时出错: ${error.message}`;
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) {
           errorMsg += ` - 请检查网络连接或目标地址/代理(${urlToFetch})是否可用或超时。`;
      }
      setStatus({ message: errorMsg, type: 'error'});
      setChannels([]);
    }
  }, [getPlayableUrl]); // 依赖 getPlayableUrl

  // 加载并播放指定的视频流 (loadVideoStream) - 基本不变
  const loadVideoStream = useCallback((originalChannelUrl) => {
    if (!originalChannelUrl) return;
    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `正在加载频道...`, type: 'loading' });

    if(hlsRef.current) hlsRef.current.stopLoad();
    if (videoRef.current) videoRef.current.removeAttribute('src');

    const urlToPlay = getPlayableUrl(originalChannelUrl); // 使用 useCallback 包装的 getPlayableUrl
    if (!urlToPlay) {
      setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
      return;
    }
    console.log(`播放器将要加载的源: ${urlToPlay}`);

    if (hlsRef.current) {
      hlsRef.current.attachMedia(videoRef.current);
      hlsRef.current.loadSource(urlToPlay);
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = urlToPlay;
      videoRef.current.load();
      videoRef.current.play().catch(e => {
        console.error("原生 HLS 自动播放失败:", e);
        setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
      });
    } else {
      setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }
  }, [getPlayableUrl]); // 依赖 getPlayableUrl

  // --- JSX 渲染 ---
  return (
    <>
      <h2>M3U 播放器</h2>

      <div id="sidebar">
        {/* --- 添加订阅区域 (使用 AddSubscription 组件) --- */}
        <div id="addSubscriptionArea">
            <h3>添加自定义订阅</h3>
            {/* 将 handleAddUserSubscription 函数传递给子组件 */}
            <AddSubscription addSubscription={handleAddUserSubscription} />
        </div>


        {/* --- 我的订阅列表区域 (使用 SubscriptionList 组件) --- */}
        <div id="subscriptionArea">
          <h3>订阅源列表</h3>
           {/* 将合并后的列表、删除函数、选择函数、选中URL 传递给子组件 */}
           <SubscriptionList
                subscriptions={mergedSubscriptions}
                removeSubscription={handleDeleteUserSubscription}
                selectSubscription={fetchAndParseM3u}
                selectedSubscriptionUrl={selectedSubscriptionUrl}
           />
        </div>

        {/* 频道列表区域 (逻辑不变) */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList">
             {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>请先选择一个订阅源</li>
             )}
             {/* ... 其他条件渲染 ... */}
            {channels.map((channel) => ( // 使用解析时添加的 channel.id
              <li
                key={channel.id} // ★ 使用解析时生成的唯一 ID
                className={selectedChannelUrl === channel.url ? 'selected' : ''}
                onClick={() => loadVideoStream(channel.url)}
                title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`}
              >
                 {channel.logo && ( <img src={channel.logo} alt="" style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle' }} onError={(e) => { e.target.style.display = 'none'; }} /> )}
                 <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {channel.group ? `[${channel.group}] ` : ''}
                    {channel.name || '未知频道'}
                 </span>
              </li>
            ))}
             {/* ... 加载提示 ... */}
              {status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载频道中...</li>
             )}
               {selectedSubscriptionUrl && channels.length === 0 && status.type === 'info' && status.message.includes("完成") && (
                 <li>此订阅没有可用频道或解析失败</li>
              )}
          </ul>
        </div>

        {/* 状态显示区域 (逻辑不变) */}
        <div id="status" className={status.type}>
          {status.message}
        </div>
      </div> {/* sidebar end */}


      {/* --- 右侧主内容区域 (播放器) --- */}
      <div id="main">
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer">
            {/* 播放器 video 标签保持不变 */}
            <video
              ref={videoRef}
              id="videoPlayer"
              controls
              playsInline
              style={{backgroundColor: '#000', width: '100%', height: '100%'}}
            ></video>
          </div>
        </div>
      </div> {/* main end */}
    </>
  );
}

export default App;
