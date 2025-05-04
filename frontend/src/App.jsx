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
// ★★★ 新增：存储最后选中频道 URL 的键名 ★★★
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

  // 订阅列表相关状态
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]);

  // ★★★ 修改：selectedSubscriptionUrl 的初始状态从 localStorage 读取 ★★★
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(() => {
    try {
      return localStorage.getItem(LAST_SELECTED_SUB_URL_KEY) || null;
    } catch (error) {
      console.error("读取上次选中的订阅 URL 失败:", error);
      return null;
    }
  });

  // 频道和播放相关状态
  const [channels, setChannels] = useState([]);
  // ★★★ 修改：selectedChannelUrl 的初始状态从 localStorage 读取 ★★★
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(() => {
      try {
          // 注意：这里只是读取了值，但它的有效性需要在频道列表加载后确认
          return localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY) || null;
      } catch (error) {
          console.error("读取上次选中的频道 URL 失败:", error);
          return null;
      }
  });

  // 界面状态和消息
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' });

  // 频道搜索查询
  const [channelSearchQuery, setChannelSearchQuery] = useState('');

  // --- Refs ---
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  // ★★★ 修改：用一个 Ref 标记初始加载流程的状态 ★★★
  // 'pending': 初始加载未开始或正在进行
  // 'subscription_loading': 开始加载订阅
  // 'subscription_loaded': 订阅已自动加载，等待频道
  // 'channel_loading': 开始加载频道
  // 'complete': 初始自动加载流程结束 (成功或失败)
  const initialLoadStateRef = useRef('pending');


  // --- API 地址 ---
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 辅助函数: 获取可播放 URL (处理 HTTP in HTTPS 代理) ---
  const getPlayableUrl = useCallback((originalUrl) => {
    // 健壮性检查: 如果传入的 URL 是空的或无效的，直接返回 null
    if (!originalUrl) {
      console.warn("getPlayableUrl 函数收到了一个空的 URL");
      return null;
    }

    try {
      // 判断原始 URL 是否以 "http://" 开头 (忽略大小写)
      const isHttp = originalUrl.toLowerCase().startsWith('http://');
      // 判断当前网页是否通过 "https://" 加载的
      const isPageHttps = window.location.protocol === 'https:';

      // *** 核心判断逻辑 ***
      // 如果：原始 URL 是 HTTP，并且 当前页面是 HTTPS (混合内容场景)
      // 那么：通过 Cloudflare Worker 代理加载
      if (isHttp && isPageHttps) {
        // 构建代理 URL: Worker 地址 + /proxy?url= + 编码后的原始 URL
        return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`;
      }

      // 其他情况 (原始 URL 是 HTTPS 或整个页面是 HTTP)，直接使用原始 URL
      return originalUrl;

    } catch (error) {
      // 如果 URL 格式不正确导致解析错误
      console.error(`处理 URL 时发生错误: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 时发生错误，请检查链接格式: ${originalUrl}`, type: 'error' });
      return null; // 返回 null 表示无法处理
    }
  }, [apiBaseUrl]); // 依赖项: apiBaseUrl

  // --- 副作用钩子 (Effects) ---

  // Effect 1: 初始化 HLS.js、加载用户订阅、获取固定订阅 (只在组件首次加载时运行)
  useEffect(() => {
    let hlsInstance = null; // 用于存储 HLS 实例，以便在清理函数中访问
    let nativeListenersAttached = false; // 标记是否添加了原生事件监听器
    const videoElement = videoRef.current; // 获取 video 元素引用

    // --- 初始化 HLS.js ---
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("浏览器支持 HLS.js，正在初始化...");
      const hls = new Hls({
        manifestLoadErrorMaxRetry: 3,
        levelLoadErrorMaxRetry: 5,
        fragLoadErrorMaxRetry: 5,
      });
      hlsInstance = hls; // 保存实例

      if (videoElement) {
          hls.attachMedia(videoElement);
          console.log("HLS.js 已附加到 video 元素。");
      } else {
          console.error("HLS.js 初始化时 video ref 不可用！");
      }
      hlsRef.current = hls; // 保存到 ref

      // --- 监听 HLS.js 的关键事件 ---
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS 播放错误详情:', data);
         let errorMessage = `播放错误 (${data.type}): ${data.details || '未知详情'}`;
         if (data.fatal) { errorMessage += " (严重)"; }
         if (data.response) { errorMessage += ` - HTTP 状态: ${data.response.code || data.response.status || '未知'}`; }
         if (data.url) { errorMessage += ` - URL: ${data.url.length > 80 ? data.url.substring(0, 80) + '...' : data.url}`; }
         if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) { errorMessage += ` - 清单加载失败/超时。请检查网络、代理或源地址。`; }
         else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) { errorMessage += ` - 视频片段加载失败/超时。可能是网络波动或源不稳定。`; }
         else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { errorMessage += ` - 网络错误。请检查网络。`; }
         else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR) { errorMessage += ` - 媒体缓冲错误。可能视频流格式不受支持。`; }
         setStatus({ message: errorMessage, type: 'error' });
         if (data.fatal) {
             switch (data.type) {
                 case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                 case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                 default: break;
             }
         }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log("HLS.js: 清单已解析。");
            setStatus({ message: "准备播放...", type: 'loading' });
            if(videoElement?.paused) {
                videoElement?.play().then(() => {
                    console.log("HLS.js: 视频开始播放。");
                    setStatus({ message: "正在播放...", type: 'info' });
                }).catch(e => {
                    console.warn("HLS.js: 自动播放失败:", e.message);
                    setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
                });
            } else {
                 if (!videoElement?.paused) { setStatus({ message: "正在播放...", type: 'info' }); }
            }
        });
        hls.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
            if (status.type === 'loading' || status.message === "准备播放...") {
                 setStatus({ message: "正在播放...", type: 'info' });
            }
        });
        hls.on(Hls.Events.BUFFER_STALLED, () => {
           console.warn("HLS.js: 缓冲停滞...");
           setStatus({ message: "缓冲中...", type: 'warning' });
        });
         hls.on(Hls.Events.BUFFER_APPENDED, () => {
            if (status.message === "缓冲中...") {
                setStatus({ message: "正在播放...", type: 'info' });
            }
         });
        console.log("HLS.js 初始化完成。");

    // --- 浏览器原生 HLS 支持判断 ---
    } else if (videoElement?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("浏览器原生支持 HLS (如 Safari)。");
        const errorHandler = (e) => {
             console.error('原生 HLS 播放错误:', e, videoElement.error);
             setStatus({ message: `播放错误: ${videoElement.error?.message || '未知错误'}`, type: 'error' });
        };
        const canPlayHandler = () => {
            console.log("原生 HLS: 可以播放。");
            if (status.type === 'loading' || status.message === "准备播放...") { setStatus({ message: "正在播放...", type: 'info' }); }
        };
        const waitingHandler = () => {
            console.warn("原生 HLS: 缓冲中...");
            setStatus({ message: "缓冲中...", type: 'warning' });
        };
        const playingHandler = () => {
             console.log("原生 HLS: 播放中。");
             if (status.message !== "正在播放...") { setStatus({ message: "正在播放...", type: 'info' }); }
        };
        const stalledHandler = () => {
             console.warn("原生 HLS: 缓冲停滞...");
             setStatus({ message: "缓冲中...", type: 'warning' });
        };
        // 添加事件监听
        videoElement.addEventListener('error', errorHandler);
        videoElement.addEventListener('canplay', canPlayHandler);
        videoElement.addEventListener('waiting', waitingHandler);
        videoElement.addEventListener('playing', playingHandler);
        videoElement.addEventListener('stalled', stalledHandler);
        nativeListenersAttached = true; // 标记已添加
        // 保存处理器引用以便移除
        videoElement._nativeHlsHandlers = { errorHandler, canPlayHandler, waitingHandler, playingHandler, stalledHandler };

    // --- 浏览器不支持 HLS ---
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
             if(storedUserSubs) { console.warn("LocalStorage 用户订阅数据格式不正确，已重置。"); }
             setUserSubscriptions([]);
             localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([]));
        }
    } catch (error) {
        console.error("从 LocalStorage 加载用户订阅失败:", error);
        setUserSubscriptions([]);
        setStatus({ message: "加载本地订阅失败，请检查浏览器设置。", type: 'warning' });
    }

    // --- 获取后台配置的固定订阅列表 ---
    const fetchFixedSubs = async () => {
      // 避免覆盖已有的错误或加载状态
      // setStatus(prev => ({ ...prev, message: "正在获取固定订阅列表..." }));
      console.log("正在获取固定订阅列表...");
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) {
          throw new Error(`获取固定列表失败: HTTP ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data) && data.every(item => item && item.name && item.url)) {
           setFixedSubscriptions(data);
           console.log("从 Worker 获取固定订阅:", data.length, "个");
        } else {
           console.error("Worker 返回的固定订阅数据格式不正确。");
           setFixedSubscriptions([]);
           setStatus({ message: "获取固定订阅列表格式错误。", type: 'error' });
        }
      } catch (error) {
        console.error('获取固定订阅列表时出错:', error);
        setFixedSubscriptions([]);
        setStatus({ message: `获取固定订阅列表出错: ${error.message}`, type: 'error' });
      }
    };

    fetchFixedSubs(); // 调用获取函数

    // --- 组件卸载时的清理函数 ---
    return () => {
        // 销毁 HLS 实例
        if (hlsInstance) { // 使用局部变量 hlsInstance
            hlsInstance.destroy();
            console.log("HLS instance destroyed on unmount.");
        }
        // 移除原生 HLS 的监听器
        if (nativeListenersAttached && videoElement && videoElement._nativeHlsHandlers) {
             console.log("移除原生 HLS 事件监听器。");
             const handlers = videoElement._nativeHlsHandlers;
             videoElement.removeEventListener('error', handlers.errorHandler);
             videoElement.removeEventListener('canplay', handlers.canPlayHandler);
             videoElement.removeEventListener('waiting', handlers.waitingHandler);
             videoElement.removeEventListener('playing', handlers.playingHandler);
             videoElement.removeEventListener('stalled', handlers.stalledHandler);
             delete videoElement._nativeHlsHandlers; // 清理自定义属性
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
    console.log("合并后的订阅列表:", merged.length, "个");

    // 初始状态消息设置 (在Effect 3中处理更佳)
    // 确保在合并完成且非加载状态时，有个基本提示
    if (initialLoadStateRef.current === 'pending' && status.type !== 'loading' && status.type !== 'error') {
       // 等待 Effect 3 判断
    } else if (initialLoadStateRef.current === 'complete' && status.type !== 'error' && status.type !== 'warning') {
       // 如果自动加载流程已完成且没有错误/警告，可以设置一个默认消息
       // setStatus({ message: "准备就绪", type: 'info'});
    }

  }, [fixedSubscriptions, userSubscriptions]); // 依赖项：固定和用户订阅列表


  // ★★★ Effect 3: 尝试自动加载上次选择的订阅源 ★★★
  useEffect(() => {
    // 条件：合并列表已生成，且初始加载状态为 'pending'
    if (mergedSubscriptions.length > 0 && initialLoadStateRef.current === 'pending') {
        const lastSubUrl = localStorage.getItem(LAST_SELECTED_SUB_URL_KEY);
        console.log("Effect 3: 检查上次订阅 URL:", lastSubUrl);

        if (lastSubUrl) {
            const subscriptionExists = mergedSubscriptions.some(sub => sub.url === lastSubUrl);
            if (subscriptionExists) {
                console.log("Effect 3: 上次订阅有效，调用 fetchAndParseM3u");
                initialLoadStateRef.current = 'subscription_loading'; // 标记开始加载订阅
                // 调用 fetchAndParseM3u，它会设置 selectedSubscriptionUrl 并加载频道
                fetchAndParseM3u(lastSubUrl, true); // true 表示这是初始自动加载
            } else {
                console.warn("Effect 3: 上次订阅 URL 无效，清除 localStorage");
                localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
                localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); // 订阅无效，频道也无效
                setSelectedSubscriptionUrl(null);
                setSelectedChannelUrl(null);
                initialLoadStateRef.current = 'complete'; // 无有效订阅，自动加载流程结束
                setStatus({ message: "上次选择的订阅源已失效", type: 'warning'});
            }
        } else {
            console.log("Effect 3: 没有找到上次选择的订阅 URL");
            initialLoadStateRef.current = 'complete'; // 无记录，自动加载流程结束
             if (status.message.includes("加载中")) { // 设置初始提示
                 setStatus({ message: "请选择一个订阅源", type: 'info'});
            }
        }
    }
    // 如果 mergedSubscriptions 为空，也认为初始加载无法进行
    else if (mergedSubscriptions.length === 0 && initialLoadStateRef.current === 'pending' && fixedSubscriptions.length > 0) {
        // 固定列表加载了，但合并后为空（可能用户列表未加载完？或都为空）
        // 暂时认为无法自动加载
        console.log("Effect 3: 列表为空，无法自动加载");
        initialLoadStateRef.current = 'complete';
        if (status.message.includes("加载中")) {
            setStatus({ message: "无可用订阅源", type: 'warning' });
        }
    }
  }, [mergedSubscriptions, fetchAndParseM3u, fixedSubscriptions.length, status.message]); // 依赖项


  // ★★★ Effect 4: 尝试自动加载上次选择的频道 ★★★
  useEffect(() => {
    // 条件：
    // 1. 频道列表 (`channels`) 已加载完成 (更新了，且不是空数组)
    // 2. 初始加载状态是 'subscription_loaded' (表示订阅已加载，等待频道)
    if (channels.length > 0 && initialLoadStateRef.current === 'subscription_loaded') {
        const lastChannelUrl = localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY);
        console.log("Effect 4: 检查上次频道 URL:", lastChannelUrl);

        if (lastChannelUrl) {
            const channelExists = channels.some(ch => ch.url === lastChannelUrl);
            if (channelExists) {
                console.log("Effect 4: 上次频道有效，调用 loadVideoStream");
                initialLoadStateRef.current = 'channel_loading'; // 标记开始加载频道
                loadVideoStream(lastChannelUrl, true); // true 表示这是初始自动加载
                // loadVideoStream 会设置 selectedChannelUrl
                // 标记 'complete' 由 loadVideoStream 内部或后续状态变化处理更佳
                // 但为简单起见，可以在这里假设调用后即完成流程发起
                // initialLoadStateRef.current = 'complete'; // 移到后面处理
            } else {
                console.warn("Effect 4: 上次频道 URL 在当前订阅中无效，清除 localStorage");
                localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
                setSelectedChannelUrl(null); // 清除状态中的频道选择
                initialLoadStateRef.current = 'complete'; // 频道无效，自动加载流程结束
            }
        } else {
             console.log("Effect 4: 没有找到上次选择的频道 URL");
            initialLoadStateRef.current = 'complete'; // 无记录，自动加载流程结束
        }
    // 条件：订阅加载完成，但频道列表为空 (channels 更新为空数组，且状态不是加载中)
    } else if (initialLoadStateRef.current === 'subscription_loaded' && channels.length === 0 && status.type !== 'loading') {
        console.log("Effect 4: 订阅加载完成但无频道，结束自动加载流程");
        localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); // 清除可能残留的频道记录
        setSelectedChannelUrl(null);
        initialLoadStateRef.current = 'complete';
    }

    // 如果状态变为 channel_loading 后，又变回 loading/info/error/warning (表示加载有结果)
    // 则认为本次自动加载频道流程结束
    if (initialLoadStateRef.current === 'channel_loading' && status.type !== 'channel_loading') {
         console.log("Effect 4: 检测到频道加载状态变化，自动加载流程标记完成");
         initialLoadStateRef.current = 'complete';
    }

  }, [channels, loadVideoStream, status.type]); // 依赖项


  // --- 事件处理函数 (Event Handlers) ---

  // 处理添加用户自定义订阅
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData;
    if (!name || !url) {
        setStatus({ message: "订阅名称和 URL 不能为空", type: 'warning' });
        return;
    }
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) ||
                       userSubscriptions.some(sub => sub.url === url);
    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${url}" 已存在`, type: 'warning' });
      return;
    }
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url };
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs);
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${name}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存");
    } catch (error) {
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        setStatus({ message: `添加 "${name}" 成功，但保存失败！`, type: 'warning' });
    }
  }, [userSubscriptions, fixedSubscriptions]);


  // ★★★ 修改：处理删除用户自定义订阅 ★★★
  const handleDeleteUserSubscription = useCallback((idToDelete) => {
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete) {
           console.warn("尝试删除一个不存在的用户订阅 ID:", idToDelete);
           return;
      }
      if (!window.confirm(`确定要删除自定义订阅 "${subToDelete.name}" 吗？`)) {
          return; // 用户取消
      }

      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs); // 更新 React State

      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已成功删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage");

          // 如果删除的是当前选中的订阅源
          if (selectedSubscriptionUrl === subToDelete.url) {
              console.log("删除了当前选中的订阅源，重置状态并清除本地存储。");
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null); // 重置频道选择状态
              // --- 重置播放器 ---
              if (videoRef.current) videoRef.current.pause();
              if (hlsRef.current) {
                  hlsRef.current.stopLoad();
                  hlsRef.current.detachMedia(); // 确保解绑
              }
              if (videoRef.current) {
                  videoRef.current.removeAttribute('src');
                  videoRef.current.load(); // 尝试清除可能残留的缓冲
              }

              // ★★★ 清除订阅和频道的本地存储记录 ★★★
              localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
              localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);

              setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' });
          }
      } catch (error) {
           console.error("删除用户订阅或清除 localStorage 时出错:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 时出错！`, type: 'error' });
      }
  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项


  // ★★★ 修改：处理选择订阅源，获取并解析 M3U 列表 ★★★
  // 添加 isInitialLoad 参数
  const fetchAndParseM3u = useCallback(async (originalM3uUrl, isInitialLoad = false) => {
    if (!originalM3uUrl) {
        console.warn("fetchAndParseM3u 收到空 URL");
        return;
    }

    console.log(`fetchAndParseM3u 调用: URL=${originalM3uUrl}, isInitialLoad=${isInitialLoad}`);

    // 仅在用户手动选择时（非初始加载）清除旧的频道选择和 localStorage
    if (!isInitialLoad) {
        console.log("手动选择新订阅，清除旧频道选择和 localStorage");
        setSelectedChannelUrl(null); // 清除内存中的频道选择
        try {
            localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); // 清除本地存储的频道
        } catch (error) {
            console.error("清除旧频道 URL localStorage 失败:", error);
        }
         // 手动选择时，将 initialLoadStateRef 设为 complete，停止自动加载流程
        initialLoadStateRef.current = 'complete';
    }

    // 尝试保存新选择的订阅 URL (无论是否初始加载)
    // 但仅在 URL 实际改变时保存，减少写入
    if (localStorage.getItem(LAST_SELECTED_SUB_URL_KEY) !== originalM3uUrl) {
        try {
            localStorage.setItem(LAST_SELECTED_SUB_URL_KEY, originalM3uUrl);
            console.log(`保存订阅 URL 到 localStorage: ${originalM3uUrl}`);
        } catch (error) {
            console.error("保存订阅 URL 到 localStorage 失败:", error);
        }
    }

    // 更新界面状态
    setSelectedSubscriptionUrl(originalM3uUrl); // ★★★ 设置当前选中的订阅URL ★★★
    const selectedSub = mergedSubscriptions.find(sub => sub.url === originalM3uUrl);
    const subName = selectedSub?.name || originalM3uUrl.split('/').pop() || '订阅';
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]); // 清空旧频道列表
    setChannelSearchQuery(''); // 重置搜索框

    // 重置播放器 (切换订阅源时)
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); }
    if (videoRef.current) {
         videoRef.current.removeAttribute('src');
         videoRef.current.load(); // 尝试清除缓冲
    }

    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
      setStatus({ message: `无法处理订阅 URL: ${originalM3uUrl}`, type: 'error' });
      // 如果是初始加载失败，需要更新 initialLoadStateRef
       if (isInitialLoad) {
            console.error("fetchAndParseM3u (Initial): 无效的 URL，标记完成");
            initialLoadStateRef.current = 'complete';
            localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY); // 清除无效的 key
            setSelectedSubscriptionUrl(null); // 清除状态
       }
      return;
    }
    console.log(`开始获取 M3U: ${urlToFetch}`);

    try {
      const response = await fetch(urlToFetch);
      if (!response.ok) {
        throw new Error(`获取 M3U 文件失败: HTTP ${response.status} ${response.statusText}`);
      }
      const m3uText = await response.text();

      // --- M3U 解析逻辑 ---
      const parsedChannels = [];
      const lines = m3uText.split('\n');
      let currentChannelInfo = null;
      for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('#EXTINF:')) {
              // 开始一个新的频道信息块
              currentChannelInfo = { id: '', name: '', url: '', logo: '', group: '' };
              const commaIndex = trimmedLine.indexOf(',');
              if (commaIndex !== -1) {
                  // 提取名称和属性
                  currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
                  const attributesPart = trimmedLine.substring(8, commaIndex); // #EXTINF:之后到逗号之前的部分
                  // 尝试提取 tvg-logo
                  const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
                  if (logoMatch && logoMatch[1]) {
                    currentChannelInfo.logo = logoMatch[1];
                  }
                  // 尝试提取 group-title
                  const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
                  if (groupMatch && groupMatch[1]) {
                    currentChannelInfo.group = groupMatch[1];
                  }
              } else {
                  // 如果没有逗号，则 #EXTINF: 后面的所有内容都视为名称
                  currentChannelInfo.name = trimmedLine.substring(8).trim();
              }
          } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
              // 这应该是一个 URL 行，关联到上一个 #EXTINF
              if (trimmedLine.includes('://')) { // 简单的 URL 检查
                  currentChannelInfo.url = trimmedLine;
                  // 生成一个相对唯一的 ID，结合 URL 和一点随机性
                  currentChannelInfo.id = `ch_${currentChannelInfo.url}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
                  parsedChannels.push(currentChannelInfo);
              } else {
                  console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine} (关联频道: ${currentChannelInfo.name})`);
              }
              // 重置 currentChannelInfo，等待下一个 #EXTINF
              currentChannelInfo = null;
          }
      }
      // --- 解析结束 ---

      setChannels(parsedChannels); // ★★★ 更新频道列表状态 ★★★
      setStatus({
           message: `"${subName}" 加载完成: ${parsedChannels.length} 个频道`,
           type: parsedChannels.length > 0 ? 'info' : 'warning' // 如果列表为空，显示警告
       });

      // ★★★ 如果是初始加载且成功，更新加载状态，让 Effect 4 接手 ★★★
      if (isInitialLoad) {
          console.log("fetchAndParseM3u: 初始加载订阅成功，状态更新为 subscription_loaded");
          initialLoadStateRef.current = 'subscription_loaded';
          // 不需要在这里直接加载频道，Effect 4 会处理
      }

    } catch (error) {
      console.error(`加载或解析 M3U (${originalM3uUrl}) 出错:`, error);
      let errorMsg = `加载 "${subName}" 频道列表出错: ${error.message}`;
      // 添加更具体的错误提示
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) {
         errorMsg += ` - 请检查网络连接、代理服务(${apiBaseUrl})或目标源(${originalM3uUrl})是否可用或超时。`;
      } else if (error.message.includes('HTTP 404')) {
         errorMsg += ` - 目标地址未找到。`;
      } else if (error.message.includes('HTTP 403')) {
         errorMsg += ` - 访问被禁止，可能需要授权或来源限制。`;
      }
      setStatus({ message: errorMsg, type: 'error'});
      setChannels([]); // 确保清空频道

      // ★★★ 如果是初始加载失败，清除相关 localStorage 并结束流程 ★★★
      if (isInitialLoad) {
          console.error("fetchAndParseM3u: 初始加载订阅失败");
          localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
          localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY);
          setSelectedSubscriptionUrl(null);
          setSelectedChannelUrl(null);
          initialLoadStateRef.current = 'complete';
      }
       // 对于手动加载失败，是否清除 localStorage？(倾向于保留用户的选择意图)
       // localStorage.removeItem(LAST_SELECTED_SUB_URL_KEY);
       // setSelectedSubscriptionUrl(null);
    }
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]); // 依赖项


  // ★★★ 修改：处理选择频道，加载并播放视频流 ★★★
  // 添加 isInitialLoad 参数
  const loadVideoStream = useCallback((originalChannelUrl, isInitialLoad = false) => {
    if (!originalChannelUrl) {
        console.warn("loadVideoStream 收到空 URL");
        return;
    }
    console.log(`loadVideoStream 调用: URL=${originalChannelUrl}, isInitialLoad=${isInitialLoad}`);

     // 手动选择时，将 initialLoadStateRef 设为 complete
     if (!isInitialLoad) {
         initialLoadStateRef.current = 'complete';
     }

    // ★★★ 保存选中的频道 URL 到 localStorage ★★★
    // 仅当 URL 变化时保存
    if (localStorage.getItem(LAST_SELECTED_CHANNEL_URL_KEY) !== originalChannelUrl) {
        try {
            localStorage.setItem(LAST_SELECTED_CHANNEL_URL_KEY, originalChannelUrl);
            console.log(`保存频道 URL 到 localStorage: ${originalChannelUrl}`);
        } catch (error) {
            console.error("保存频道 URL 到 localStorage 失败:", error);
        }
    }

    // 更新状态
    setSelectedChannelUrl(originalChannelUrl); // ★★★ 设置当前选中的频道URL ★★★
    setStatus({ message: `加载频道中...`, type: 'loading' }); // 使用 'loading' 区分于 'channel_loading'

    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
      setStatus({ message: `无法处理频道 URL: ${originalChannelUrl}`, type: 'error' });
      // 如果是初始加载失败，也标记完成
      if (isInitialLoad) {
           console.error("loadVideoStream (Initial): 无效的 URL，标记完成");
           initialLoadStateRef.current = 'complete';
           localStorage.removeItem(LAST_SELECTED_CHANNEL_URL_KEY); // 清除无效 key
           setSelectedChannelUrl(null); // 清除状态
      }
      return;
    }
    console.log(`播放器加载源: ${urlToPlay}`);

    // --- 根据播放方式执行加载 ---
    const videoElement = videoRef.current;
    if (!videoElement) {
        console.error("播放器 video 元素无效！");
        setStatus({ message: "播放器元素丢失，无法加载视频。", type: 'error' });
        if (isInitialLoad) initialLoadStateRef.current = 'complete';
        return;
    }

    if (hlsRef.current) {
        // --- 使用 HLS.js ---
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        const hls = hlsRef.current;
        hls.stopLoad(); // 先停止之前的加载
        hls.detachMedia(); // 显式解绑
        hls.attachMedia(videoElement); // 重新绑定
        hls.loadSource(urlToPlay); // 加载新源
        // 播放通常由 HLS.Events.MANIFEST_PARSED 事件触发，或者需要手动调用 play()
        // 这里不直接调用 play()，依赖 HLS 事件或用户操作
        console.log("HLS.js: 已请求加载源，等待解析...");

    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // --- 使用浏览器原生 HLS ---
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        videoElement.pause(); // 先暂停
        videoElement.src = urlToPlay; // 设置新源
        videoElement.load(); // 对于原生 HLS，需要调用 load()
        videoElement.play().then(() => {
            console.log("原生 HLS：尝试播放成功。");
            // 状态更新由 playing 事件处理
        }).catch(e => {
            console.error("原生 HLS 自动播放失败:", e.message);
            // 用户可能需要手动点击播放
            setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
        });
    } else {
        // --- 不支持 HLS ---
        setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
        if (isInitialLoad) initialLoadStateRef.current = 'complete';
    }

    // 不在此处立即标记 complete，等待 Effect 4 或用户交互来判断流程结束

  }, [getPlayableUrl]); // 依赖项


  // --- 计算过滤后的频道列表 ---
  const filteredChannels = channels.filter(channel => {
    const query = channelSearchQuery.toLowerCase().trim(); // 获取小写、去空格的搜索词
    if (!query) {
      return true; // 如果搜索词为空，不过滤，显示所有频道
    }
    // 检查频道名称或分组名称是否包含搜索词 (忽略大小写)
    const nameMatch = channel.name && channel.name.toLowerCase().includes(query);
    const groupMatch = channel.group && channel.group.toLowerCase().includes(query);
    return nameMatch || groupMatch; // 匹配其一即可
  });


  // --- 定义组件内部使用的样式 ---
  const styles = {
    searchInput: {
      width: 'calc(100% - 20px)', // 宽度适应容器，留边距
      padding: '8px 10px',
      marginBottom: '10px',
      border: '1px solid #ccc', // 添加边框以便看清
      borderRadius: '4px',
      boxSizing: 'border-box',
      display: 'block',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    channelLogo: {
      width: '20px',
      height: 'auto', // 保持比例
      marginRight: '8px',
      verticalAlign: 'middle',
      flexShrink: 0, // 防止 logo 被压缩
      objectFit: 'contain', // 图片内容适应容器
    },
    channelName: {
      flexGrow: 1, // 占据剩余空间
      overflow: 'hidden', // 隐藏溢出内容
      textOverflow: 'ellipsis', // 显示省略号
      whiteSpace: 'nowrap', // 不换行
      marginLeft: '5px', // 与 Logo 间距 (如果 Logo 存在)
    }
  };


  // --- JSX 结构渲染 ---
  return (
    <div className="app-root">
      <header className="app-header">
        <h2 className="app-title">看看讲究将就看看</h2>
        <ThemeSwitcher />
      </header>
      {/* 可以取消注释显示提示 <SmallNote /> */}
      <div className="main-flex">
        {/* --- 左侧边栏 --- */}
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
              selectSubscription={(url) => fetchAndParseM3u(url, false)} // 明确手动调用
              selectedSubscriptionUrl={selectedSubscriptionUrl} // 传递用于高亮
            />
          </div>
          {/* 频道列表区域 */}
          <div id="channelArea">
            <h3>频道列表</h3>
            {/* --- 频道搜索框 --- */}
            {selectedSubscriptionUrl && channels.length > 0 && (
              <input
                type="search"
                placeholder="搜索频道名称或分组..."
                value={channelSearchQuery}
                onChange={(e) => setChannelSearchQuery(e.target.value)}
                style={styles.searchInput}
                aria-label="搜索频道" // 增加可访问性
              />
            )}
            {/* --- 频道列表 UL --- */}
            <ul id="channelList" aria-live="polite"> {/* aria-live 用于屏幕阅读器 */}
              {/* 条件渲染列表内容 */}
              {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                <li className="list-placeholder">请先选择一个订阅源</li>
              )}
              {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && (
                <li className="list-placeholder">加载频道中...</li>
              )}
               {selectedSubscriptionUrl && channels.length === 0 && (status.type === 'warning' || status.type === 'info') && !status.message.includes("加载中") && !status.message.includes("加载频道中") && (
                <li className="list-placeholder">此订阅源没有找到可用频道或解析失败</li>
              )}
              {selectedSubscriptionUrl && channels.length > 0 && filteredChannels.length === 0 && channelSearchQuery && (
                <li className="list-placeholder">无匹配 "{channelSearchQuery}" 的频道</li>
              )}
              {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && (
                <li className="list-placeholder error-message">加载频道列表失败，请检查源或代理</li>
              )}
              {/* 渲染过滤后的频道 */}
              {filteredChannels.map((channel) => (
                <li
                  key={channel.id} // 使用生成的唯一 ID
                  className={`channel-item ${selectedChannelUrl === channel.url ? 'selected' : ''}`} // 使用 state 高亮
                  onClick={() => loadVideoStream(channel.url, false)} // 明确手动调用
                  title={`${channel.name || '未知频道'}\n分组: ${channel.group || '无'}\nURL: ${channel.url || '无'}`}
                  tabIndex={0} // 使列表项可以通过键盘聚焦
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadVideoStream(channel.url, false); }} // 允许键盘操作
                >
                  {channel.logo && (
                    <img
                      src={channel.logo}
                      alt="" // Logo 通常是装饰性的，alt 为空
                      style={styles.channelLogo}
                      // 隐藏加载失败的 logo
                      onError={(e) => { e.target.style.display = 'none'; }}
                      loading="lazy" // 懒加载 logo
                    />
                  )}
                  <span style={styles.channelName}>
                    {channel.group ? `[${channel.group}] ` : ''}
                    {channel.name || '未知频道'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* 状态显示区域 */}
          <div id="status" className={status.type} role="status" aria-live="assertive"> {/* role和aria-live用于辅助技术 */}
            {status.message}
          </div>
        </div>
        {/* --- 右侧主内容区域 --- */}
        <div id="main">
          <div id="videoArea">
            <div id="videoContainer">
               <video
                 ref={videoRef}
                 id="videoPlayer"
                 controls
                 playsInline
                 style={{backgroundColor: '#000', width: '100%', height: '100%'}}
                 aria-label="视频播放器" // 增加可访问性
               >
                  您的浏览器不支持 HTML5 视频。
               </video>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 导出 App 组件
export default App;
