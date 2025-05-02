// frontend/src/App.jsx
// --- 导入 React 核心库和钩子 ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- 导入 HLS.js 库 ---
import Hls from 'hls.js';

// --- 导入子组件 ---
import SubscriptionList from './components/SubscriptionList'; // 导入列表组件
import AddSubscription from './components/AddSubscription';   // 导入添加组件

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

// --- 常量定义 ---
const USER_SUBS_LOCALSTORAGE_KEY = 'm3uPlayerUserSubscriptions'; // LocalStorage 键名, 用于存储用户自定义订阅

// --- 主应用组件 App ---
function App() {
  // --- 状态定义 (State) ---
  // 这些变量存储应用的数据，当它们改变时，React 会自动更新界面

  // 订阅列表相关状态
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);     // 固定订阅列表 (从后台 Worker 获取)
  const [userSubscriptions, setUserSubscriptions] = useState([]);       // 用户自定义订阅列表 (从浏览器 LocalStorage 获取)
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]); // 固定和用户列表合并后的完整列表，用于界面显示

  // 频道和播放相关状态
  const [channels, setChannels] = useState([]);                         // 当前选中的订阅解析出的频道列表
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null); // 当前选中的 *订阅源* 的 URL (用于高亮和加载频道)
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);       // 当前选中的 *频道* 的 URL (用于高亮和播放)

  // 界面状态和消息
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' }); // 向用户显示的操作状态和消息 (类型包括: info, success, error, warning, loading)

  // --- ★★★ 新增状态：频道搜索查询 ★★★ ---
  const [channelSearchQuery, setChannelSearchQuery] = useState(''); // 用于存储用户输入的搜索词
  // --- ★★★ -------------------------- ★★★ ---

  // --- Refs ---
  // Refs 用来直接访问 DOM 元素 (如 video 播放器) 或存储不直接参与渲染的对象 (如 HLS 实例)
  const videoRef = useRef(null);  // 指向 HTML 中的 <video> 元素
  const hlsRef = useRef(null);    // 存储 HLS.js 的实例对象

  // --- API 地址 ---
  // 获取后端 Worker 的基础 URL。优先使用环境变量 VITE_API_BASE_URL，如果未设置，则默认为相对路径 '/api'
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 辅助函数: 获取可播放 URL (处理 HTTP in HTTPS 代理) ---
  // 使用 useCallback 优化，只有当 apiBaseUrl 变化时，这个函数才会重新创建
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
        // console.log(`需要代理 HTTP URL: ${originalUrl}`); // 可以取消注释来调试
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
  // useEffect 里的代码会在组件加载后、或其依赖的状态/变量变化时执行

  // Effect 1: 初始化 HLS.js 播放器、加载本地用户订阅、获取远程固定订阅 (只在组件首次加载时运行)
  useEffect(() => {
    // --- 初始化 HLS.js ---
    // 检查浏览器是否支持 HLS.js (依赖 Media Source Extensions)
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("浏览器支持 HLS.js，正在初始化...");
      // 创建 HLS.js 实例，可传入配置项优化
      const hls = new Hls({
        // 示例配置: 增加加载失败时的重试次数
        manifestLoadErrorMaxRetry: 3, // M3U8 清单加载重试
        levelLoadErrorMaxRetry: 5,   // 视频层级列表加载重试
        fragLoadErrorMaxRetry: 5,     // 单个视频片段加载重试
      });
      // 将 HLS.js 实例附加到 <video> 元素上
      if (videoRef.current) {
          hls.attachMedia(videoRef.current);
          console.log("HLS.js 已附加到 video 元素。");
      } else {
          console.error("HLS.js 初始化时 video ref 不可用！");
      }
      // 将 HLS.js 实例保存到 ref 中，方便后续使用
      hlsRef.current = hls;

      // --- 监听 HLS.js 的关键事件 ---

      // 错误事件监听
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS 播放错误详情:', data); // 打印详细错误信息
         let errorMessage = `播放错误 (${data.type}): ${data.details || '未知详情'}`;
         if (data.fatal) { errorMessage += " (严重)"; } // 标记严重错误
         if (data.response) { // 尝试获取 HTTP 状态码
             errorMessage += ` - HTTP 状态: ${data.response.code || data.response.status || '未知'}`;
         }
         if (data.url) { // 显示出错的 URL
             errorMessage += ` - URL: ${data.url.length > 80 ? data.url.substring(0, 80) + '...' : data.url}`;
         }
         // 针对常见错误给出更具体的提示
         if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
            errorMessage += ` - 清单加载失败/超时。请检查网络、代理或源地址是否可用。`;
         } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
             errorMessage += ` - 视频片段加载失败/超时。可能是网络波动或源不稳定。`;
         } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
             errorMessage += ` - 网络错误。请检查您的网络连接。`;
         } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
             errorMessage += ` - 媒体缓冲错误。可能视频流格式不受支持或已损坏。`;
         }
         // 更新状态栏显示错误信息
         setStatus({ message: errorMessage, type: 'error' });
         // 可选的恢复逻辑 (根据错误类型)
         if (data.fatal) {
             switch (data.type) {
                 case Hls.ErrorTypes.NETWORK_ERROR:
                     console.log('尝试恢复网络错误...');
                     hls.startLoad(); // 尝试重新加载
                     break;
                 case Hls.ErrorTypes.MEDIA_ERROR:
                     console.log('尝试恢复媒体错误...');
                     hls.recoverMediaError(); // 尝试恢复媒体错误
                     break;
                 default:
                     console.log('无法自动恢复的严重错误，考虑销毁 HLS 实例。');
                     break;
             }
         }
      });

      // M3U8 清单成功解析事件
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log("HLS.js: M3U8 清单已成功解析。级别数量:", data.levels.length);
            setStatus({ message: "准备播放...", type: 'loading' });
            // 仅在暂停状态下尝试播放，防止干扰用户手动暂停
            if(videoRef.current?.paused) {
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

        // 视频片段缓冲成功事件
        hls.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
            // 当有数据成功缓冲，可以认为加载/播放正常
            if (status.type === 'loading' || status.message === "准备播放...") {
                 setStatus({ message: "正在播放...", type: 'info' });
            }
        });

        // 缓冲停滞事件 (卡顿)
        hls.on(Hls.Events.BUFFER_STALLED, () => {
           console.warn("HLS.js: 视频缓冲停滞...");
           setStatus({ message: "缓冲中...", type: 'warning' });
        });

        // 缓冲恢复事件
         hls.on(Hls.Events.BUFFER_APPENDED, () => {
            // 数据追加成功后，如果之前是缓冲状态，可以改回播放状态
            if (status.message === "缓冲中...") {
                setStatus({ message: "正在播放...", type: 'info' });
            }
         });

        console.log("HLS.js 初始化完成。");

    // --- 浏览器原生 HLS 支持判断 ---
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("浏览器原生支持 HLS (如 Safari)。");
        const videoElement = videoRef.current;
        // 定义原生事件处理器
        const errorHandler = (e) => {
             console.error('原生 HLS 播放错误:', e, videoElement.error);
             let errorMessage = "播放错误";
             if (videoElement.error) { /* ... 错误码判断 ... */ }
             setStatus({ message: errorMessage, type: 'error' });
        };
        const canPlayHandler = () => {
            console.log("原生 HLS: 视频可以开始播放。");
            if (status.type === 'loading' || status.message === "准备播放...") { setStatus({ message: "正在播放...", type: 'info' }); }
        };
        const waitingHandler = () => {
            console.warn("原生 HLS: 视频缓冲中...");
            setStatus({ message: "缓冲中...", type: 'warning' });
        };
        const playingHandler = () => {
             console.log("原生 HLS: 视频正在播放。");
             if (status.message !== "正在播放...") { setStatus({ message: "正在播放...", type: 'info' }); }
        };
        const stalledHandler = () => {
             console.warn("原生 HLS: 视频缓冲停滞...");
             setStatus({ message: "缓冲中...", type: 'warning' });
        };
        // 添加事件监听
        videoElement.addEventListener('error', errorHandler);
        videoElement.addEventListener('canplay', canPlayHandler);
        videoElement.addEventListener('waiting', waitingHandler);
        videoElement.addEventListener('playing', playingHandler);
        videoElement.addEventListener('stalled', stalledHandler);
        // 返回清理函数，移除原生监听器
         return () => {
             if (videoElement) {
                 console.log("移除原生 HLS 事件监听器。");
                 videoElement.removeEventListener('error', errorHandler);
                 videoElement.removeEventListener('canplay', canPlayHandler);
                 videoElement.removeEventListener('waiting', waitingHandler);
                 videoElement.removeEventListener('playing', playingHandler);
                 videoElement.removeEventListener('stalled', stalledHandler);
             }
         };

    // --- 浏览器不支持 HLS ---
    } else {
        console.error("浏览器不支持 HLS 播放。");
        setStatus({ message: "抱歉，您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }

    // --- 加载本地存储的用户订阅 ---
    try {
        const storedUserSubs = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY);
        const initialUserSubs = storedUserSubs ? JSON.parse(storedUserSubs) : [];
        // 基本验证
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
      setStatus(prev => ({ ...prev, message: "正在获取固定订阅列表..." })); // 更新消息，保留类型
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) {
          throw new Error(`获取固定列表失败: HTTP ${response.status}`);
        }
        const data = await response.json();
        // 基本验证
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
        if (hlsRef.current) {
            hlsRef.current.destroy();
            console.log("HLS instance destroyed on unmount.");
        }
        // (原生 HLS 的监听器清理已在其判断分支中返回)
    };
  }, [apiBaseUrl]); // 依赖项: apiBaseUrl

  // Effect 2: 合并固定列表和用户列表，生成用于显示的 mergedSubscriptions
  // 这个 Effect 会在 fixedSubscriptions 或 userSubscriptions 状态变化时运行
  useEffect(() => {
    const merged = [
      // 固定列表项，添加 isFixed: true 标记和唯一 id
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true, id: `fixed_${sub.url}` })),
      // 用户列表项，添加 isFixed: false 标记 (用户列表本身应已有 id)
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并后的订阅列表:", merged.length, "个");

    // 智能更新状态消息：仅当应用刚加载完成，且之前是加载状态时，设置一个合适的初始提示
    if (status.message.includes("加载中") || status.message.includes("获取固定订阅列表")) {
        setStatus({ message: merged.length > 0 ? "请选择一个订阅源" : "请添加您的第一个自定义订阅", type: 'info'});
    }
  }, [fixedSubscriptions, userSubscriptions, status.message]); // 依赖项: fixedSubscriptions, userSubscriptions, status.message

  // --- 事件处理函数 (Event Handlers) ---

  // 处理添加用户自定义订阅
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData; // newSubData 应包含 name 和 url
    // 去重检查
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) ||
                       userSubscriptions.some(sub => sub.url === url);
    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${url}" 已存在 (固定或已自定义)，无法重复添加。`, type: 'warning' });
      return; // 阻止添加
    }
    // 生成唯一 ID
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url }; // 创建新订阅对象
    // 更新状态和 LocalStorage
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs);
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${name}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存到 LocalStorage:", updatedUserSubs.length, "个");
    } catch (error) {
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        setStatus({ message: `添加 "${name}" 成功，但保存到本地存储失败！`, type: 'warning' });
    }
  }, [userSubscriptions, fixedSubscriptions]); // 依赖项

  // 处理删除用户自定义订阅
  const handleDeleteUserSubscription = useCallback((idToDelete) => {
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete) {
           console.warn("尝试删除一个不存在的用户订阅 ID:", idToDelete);
           return;
      }
      if (!window.confirm(`确定要删除自定义订阅 "${subToDelete.name}" 吗？`)) {
          return; // 用户取消
      }
      // 从用户订阅列表中过滤掉要删除的项
      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs); // 更新 React State
      // 将更新后的列表保存回 LocalStorage
      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已成功删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage:", updatedUserSubs.length, "个");
          // 如果删除的是当前选中的订阅源，重置相关状态并重置播放器
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
              }
              setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' });
          }
      } catch (error) {
           console.error("从 LocalStorage 删除用户订阅失败:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 失败，无法更新本地存储！`, type: 'error' });
      }
  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项

  // 处理选择订阅源，获取并解析 M3U 列表
  const fetchAndParseM3u = useCallback(async (originalM3uUrl) => {
    if (!originalM3uUrl) {
        console.warn("fetchAndParseM3u 收到空 URL");
        return;
    }
    // 更新界面状态
    setSelectedSubscriptionUrl(originalM3uUrl);
    const selectedSub = mergedSubscriptions.find(sub => sub.url === originalM3uUrl);
    const subName = selectedSub?.name || originalM3uUrl.split('/').pop() || originalM3uUrl;
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]);
    setSelectedChannelUrl(null);

    // --- 重置频道搜索框 ---
    setChannelSearchQuery('');

    // --- 重置播放器 (切换订阅源时) ---
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) {
        console.log("fetchAndParseM3u: Stopping HLS load and detaching media.");
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia(); // 明确解绑
    }
    if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        // 移除这里的 videoRef.current.load()
    }

    // 获取最终请求 URL
    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
      setStatus({ message: `无法处理此订阅 URL: ${originalM3uUrl}`, type: 'error' });
      return;
    }
    console.log(`将从以下地址获取 M3U 内容: ${urlToFetch}`);

    // 发起 Fetch 请求获取 M3U
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
                  // 生成唯一 ID
                  currentChannelInfo.id = `ch_${currentChannelInfo.url}_${currentChannelInfo.name}_${parsedChannels.length}`;
                  parsedChannels.push(currentChannelInfo);
              } else {
                  console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine} (关联频道: ${currentChannelInfo.name})`);
              }
              currentChannelInfo = null; // 重置
          }
      }

      // 更新频道列表和状态
      setChannels(parsedChannels);
      setStatus({
           message: `"${subName}" 加载完成，共找到 ${parsedChannels.length} 个频道。`,
           type: parsedChannels.length > 0 ? 'info' : 'warning'
       });

    } catch (error) {
      console.error(`加载或解析 M3U (${originalM3uUrl}) 时出错:`, error);
      let errorMsg = `加载 "${subName}" 的频道列表时出错: ${error.message}`;
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) { errorMsg += ` - 请检查网络连接、代理服务(${apiBaseUrl})或目标源(${originalM3uUrl})是否可用或超时。`; }
      else if (error.message.includes('HTTP 404')) { errorMsg += ` - 目标地址未找到。`; }
      setStatus({ message: errorMsg, type: 'error'});
      setChannels([]);
    }
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]); // 依赖项

  // 处理选择频道，加载并播放视频流
  const loadVideoStream = useCallback((originalChannelUrl) => {
    if (!originalChannelUrl) {
        console.warn("loadVideoStream 收到空 URL");
        return;
    }
    // 更新状态
    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `正在加载频道...`, type: 'loading' });

    // 获取播放 URL
    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
      setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
      return;
    }
    console.log(`播放器将要加载的源: ${urlToPlay}`);

    // --- 根据播放方式执行加载 ---
    if (hlsRef.current) {
        // --- 使用 HLS.js ---
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        hlsRef.current.stopLoad(); // 先停止之前的加载
        hlsRef.current.detachMedia(); // 显式解绑
        if(videoRef.current) {
            console.log("HLS.js: Re-attaching media and loading source.");
            hlsRef.current.attachMedia(videoRef.current); // 重新绑定
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
             videoRef.current.load(); // 对于原生 HLS，需要调用 load()
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
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box',
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  channelLogo: {
    width: '20px',
    height: 'auto',
    marginRight: '8px',
    verticalAlign: 'middle',
    flexShrink: 0, // 防止 logo 被压缩
  },
  channelName: {
    flexGrow: 1, // 占据剩余空间
    overflow: 'hidden', // 隐藏溢出内容
    textOverflow: 'ellipsis', // 显示省略号
    whiteSpace: 'nowrap', // 不换行
  }
};

  
  // --- JSX 结构渲染 ---
  return (
      <div className="app-root">
        <h2>电视直播</h2>
        <SmallNote />
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
                selectSubscription={fetchAndParseM3u}
                selectedSubscriptionUrl={selectedSubscriptionUrl}
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
              style={styles.searchInput} // 应用样式
            />
          )}
          {/* --- 频道列表 UL --- */}
          <ul id="channelList">
             {/* 条件渲染: 提示信息 */}
            {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>请先选择一个订阅源</li>
             )}
             {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载频道中...</li>
             )}
             {selectedSubscriptionUrl && channels.length === 0 && (status.type === 'warning' || status.type === 'info') && !status.message.includes("加载中") && (
                 <li>此订阅源没有找到可用频道或解析失败</li>
             )}
             {selectedSubscriptionUrl && channels.length > 0 && filteredChannels.length === 0 && (
                <li>无匹配的频道</li> // 无搜索结果提示
             )}
             {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && (
                 <li>加载频道列表失败，请检查源或代理</li> // 加载错误提示
             )}

             {/* --- 渲染过滤后的频道列表 --- */}
             {filteredChannels.map((channel) => (
               <li
                 key={channel.id} // 使用唯一 ID
                 className={selectedChannelUrl === channel.url ? 'selected' : ''} // 高亮选中项
                 onClick={() => loadVideoStream(channel.url)} // 点击播放
                 title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`} // 鼠标悬停提示
               >
                  {/* 频道 Logo */}
                  {channel.logo && (
                     <img
                        src={channel.logo}
                        alt=""
                        style={styles.channelLogo}
                        onError={(e) => { e.target.style.display = 'none'; }} // 加载失败则隐藏
                     />
                   )}
                  {/* 频道名称和分组 */}
                  <span style={styles.channelName}>
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
      </div> {/* --- 左侧边栏结束 --- */}

      {/* --- 右侧主内容区域 --- */}
      <div id="main">
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer">
            {/* 视频播放器元素 */}
            <video
              ref={videoRef}
              id="videoPlayer"
              controls
              playsInline
              style={{backgroundColor: '#000', width: '100%', height: '100%'}}
            ></video>
          </div>
        </div>
      </div> {/* --- 右侧主内容结束 --- */}
    </div> {/* --- .main-flex 结束 --- */}
   </div> {/* --- .app-root 结束 --- */}
  );
}


// 导出 App 组件
export default App;
