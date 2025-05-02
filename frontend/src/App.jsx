// frontend/src/App.jsx
// --- 导入 React 核心库和钩子 ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- 导入 HLS.js 库 ---
import Hls from 'hls.js';

// --- 导入子组件 ---
import SubscriptionList from './components/SubscriptionList'; // 导入列表组件
import AddSubscription from './components/AddSubscription';   // 导入添加组件

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
        // 开启调试模式可以在控制台看到更多 HLS.js 的内部日志
        // debug: true,
      });
      // 将 HLS.js 实例附加到 <video> 元素上
      if (videoRef.current) { // 确保 video 元素已存在
          hls.attachMedia(videoRef.current);
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
                     // hls.destroy(); // 在某些情况下可能需要销毁并重新创建
                     break;
             }
         }
      });

      // M3U8 清单成功解析事件
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log("M3U8 清单已成功解析。级别数量:", data.levels.length);
            setStatus({ message: "准备播放...", type: 'loading' });
            // 尝试自动播放 (注意浏览器策略限制)
            videoRef.current?.play().then(() => {
                console.log("视频开始播放。");
                setStatus({ message: "正在播放...", type: 'info' }); // 播放成功后更新状态
            }).catch(e => {
                console.warn("自动播放失败:", e.message);
                // 提示用户手动播放
                setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
                if (videoRef.current) videoRef.current.muted = false; // 如果是静音导致，尝试取消静音
            });
        });

        // 视频片段缓冲成功事件
        hls.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
             // 当有数据成功缓冲，可以认为加载/播放正常
             // 如果状态还是 loading 或 info，可以更新为更具体的“正在播放”
             // 为避免频繁更新，可以只在状态为 loading 时更新
            if (status.type === 'loading' || status.message === "准备播放...") {
                 setStatus({ message: "正在播放...", type: 'info' });
            }
            // console.log("Fragment buffered:", data.frag.relurl); // 调试日志
        });

        // 缓冲停滞事件 (卡顿)
        hls.on(Hls.Events.BUFFER_STALLED, () => {
           console.warn("视频缓冲停滞...");
           setStatus({ message: "缓冲中...", type: 'warning' }); // 用 warning 或 loading 提示
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
        // 对于原生 HLS，需要直接监听 video 元素的事件
        const videoElement = videoRef.current;

        const errorHandler = (e) => {
             console.error('原生 HLS 播放错误:', e, videoElement.error);
             let errorMessage = "播放错误";
             if (videoElement.error) {
                 switch (videoElement.error.code) {
                     case MediaError.MEDIA_ERR_ABORTED: errorMessage = '播放被用户中止'; break;
                     case MediaError.MEDIA_ERR_NETWORK: errorMessage = '网络错误导致视频下载失败'; break;
                     case MediaError.MEDIA_ERR_DECODE: errorMessage = '视频解码错误'; break;
                     case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMessage = '视频资源格式不支持或无法访问'; break;
                     default: errorMessage = `发生未知播放错误 (Code: ${videoElement.error.code})`;
                 }
             }
             setStatus({ message: errorMessage, type: 'error' });
        };
        const canPlayHandler = () => {
            console.log("原生 HLS: 视频可以开始播放。");
            // 如果之前是加载状态，可以更新
            if (status.type === 'loading' || status.message === "准备播放...") {
                setStatus({ message: "正在播放...", type: 'info' });
            }
        };
        const waitingHandler = () => {
            console.warn("原生 HLS: 视频缓冲中...");
            setStatus({ message: "缓冲中...", type: 'warning' });
        };
        const playingHandler = () => {
             console.log("原生 HLS: 视频正在播放。");
             // 确保状态是“正在播放”
             if (status.message !== "正在播放...") {
                 setStatus({ message: "正在播放...", type: 'info' });
             }
        };
        const stalledHandler = () => {
             console.warn("原生 HLS: 视频缓冲停滞...");
             setStatus({ message: "缓冲中...", type: 'warning' });
        };

        videoElement.addEventListener('error', errorHandler);
        videoElement.addEventListener('canplay', canPlayHandler); // 数据加载足够，可以播放了
        videoElement.addEventListener('waiting', waitingHandler); // 需要缓冲
        videoElement.addEventListener('playing', playingHandler); // 真正开始/恢复播放时
        videoElement.addEventListener('stalled', stalledHandler); // 下载停滞

        // 在组件卸载时移除这些监听器
        return () => {
             console.log("移除原生 HLS 事件监听器。");
             videoElement.removeEventListener('error', errorHandler);
             videoElement.removeEventListener('canplay', canPlayHandler);
             videoElement.removeEventListener('waiting', waitingHandler);
             videoElement.removeEventListener('playing', playingHandler);
             videoElement.removeEventListener('stalled', stalledHandler);
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
        // 基本验证，确保是数组且结构大致正确 (包含 id, name, url)
        if (Array.isArray(initialUserSubs) && initialUserSubs.every(item => item && item.id && item.name && item.url)) {
             setUserSubscriptions(initialUserSubs);
             console.log("从 LocalStorage 加载用户订阅:", initialUserSubs.length, "个");
        } else {
             if(storedUserSubs) { // 仅当 LocalStorage 中确实有数据但格式不对时才警告
                console.warn("LocalStorage 中的用户订阅数据格式不正确或不完整，已重置为空数组。");
             }
             setUserSubscriptions([]);
             localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([])); // 清理或初始化
        }
    } catch (error) {
        console.error("从 LocalStorage 加载用户订阅失败:", error);
        setUserSubscriptions([]); // 出错时确保是空数组
        setStatus({ message: "加载本地订阅失败，请检查浏览器设置。", type: 'warning' });
    }

    // --- 获取后台配置的固定订阅列表 ---
    const fetchFixedSubs = async () => {
      setStatus(prev => ({ ...prev, message: "正在获取固定订阅列表..." })); // 保留类型，更新消息
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) {
          throw new Error(`获取固定列表失败: HTTP ${response.status}`);
        }
        const data = await response.json();
        // 基本验证，确保是数组且结构大致正确 (包含 name, url)
        if (Array.isArray(data) && data.every(item => item && item.name && item.url)) {
           setFixedSubscriptions(data);
           console.log("从 Worker 获取固定订阅:", data.length, "个");
           // 初始状态消息等合并后再设置
        } else {
           console.error("Worker 返回的固定订阅数据格式不正确或不完整。");
           setFixedSubscriptions([]);
           setStatus({ message: "获取固定订阅列表格式错误。", type: 'error' });
        }
      } catch (error) {
        console.error('获取固定订阅列表时出错:', error);
        setFixedSubscriptions([]); // 出错时确保是空数组
        setStatus({ message: `获取固定订阅列表出错: ${error.message}`, type: 'error' });
      }
    };

    fetchFixedSubs(); // 调用获取函数

    // --- 组件卸载时的清理函数 ---
    return () => {
        // 销毁 HLS 实例，释放资源
        if (hlsRef.current) {
            hlsRef.current.destroy();
            console.log("HLS instance destroyed on unmount.");
        }
        // (原生 HLS 的监听器清理已在上面单独返回)
    };
  }, [apiBaseUrl]); // 依赖项: apiBaseUrl。这个 Effect 只在组件首次挂载时运行（因为 apiBaseUrl 通常不变）

  // Effect 2: 合并固定列表和用户列表，生成用于显示的 mergedSubscriptions
  // 这个 Effect 会在 fixedSubscriptions 或 userSubscriptions 状态变化时运行
  useEffect(() => {
    const merged = [
      // 固定列表项，添加 isFixed: true 标记
      ...fixedSubscriptions.map(sub => ({ ...sub, isFixed: true, id: `fixed_${sub.url}` })), // 添加唯一 id
      // 用户列表项，添加 isFixed: false 标记 (用户列表本身应已有 id)
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并后的订阅列表:", merged.length, "个");

    // 智能更新状态消息：仅当应用刚加载完成，且之前是加载状态时，设置一个合适的初始提示
    if (status.message.includes("加载中") || status.message.includes("获取固定订阅列表")) {
        setStatus({ message: merged.length > 0 ? "请选择一个订阅源" : "请添加您的第一个自定义订阅", type: 'info'});
    }
    // 注意：不要在这里无条件覆盖 status，否则会覆盖掉错误或成功消息

  }, [fixedSubscriptions, userSubscriptions]); // 依赖项: fixedSubscriptions, userSubscriptions


  // --- 事件处理函数 (Event Handlers) ---
  // 使用 useCallback 包装事件处理函数可以进行性能优化，
  // 防止在子组件重渲染时不必要地重新创建这些函数，特别是当它们作为 props 传递下去时。

  // 处理添加用户自定义订阅
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData; // newSubData 应包含 name 和 url

    // 去重检查 (URL 在固定列表或用户列表中是否已存在)
    const isDuplicate = fixedSubscriptions.some(sub => sub.url === url) ||
                       userSubscriptions.some(sub => sub.url === url);

    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${url}" 已存在 (固定或已自定义)，无法重复添加。`, type: 'warning' });
      return; // 阻止添加
    }

    // 为新订阅生成一个唯一的 ID (这里用时间戳+随机数)
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name, url }; // 创建包含 id, name, url 的新订阅对象

    // 更新用户订阅列表状态
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    setUserSubscriptions(updatedUserSubs); // 更新 React State

    // 将更新后的列表保存到 LocalStorage
    try {
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${name}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存到 LocalStorage:", updatedUserSubs.length, "个");
    } catch (error) {
        // LocalStorage 写入失败处理 (可能是空间不足或浏览器限制)
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        setStatus({ message: `添加 "${name}" 成功，但保存到本地存储失败！`, type: 'warning' });
        // 可选：考虑是否回滚状态？ (通常不需要，让用户知道添加成功但未保存)
        // setUserSubscriptions(userSubscriptions);
    }
  }, [userSubscriptions, fixedSubscriptions]); // 依赖项: userSubscriptions, fixedSubscriptions (用于去重检查)

  // 处理删除用户自定义订阅
  const handleDeleteUserSubscription = useCallback((idToDelete) => {
      // 找到要删除的订阅信息，以便显示名称
      const subToDelete = userSubscriptions.find(sub => sub.id === idToDelete);
      if (!subToDelete) {
           console.warn("尝试删除一个不存在的用户订阅 ID:", idToDelete);
           return; // 找不到则不处理
      }

      // 弹出确认框，防止误删
      if (!window.confirm(`确定要删除自定义订阅 "${subToDelete.name}" 吗？`)) {
          return; // 用户点击了“取消”
      }

      // 从用户订阅列表中过滤掉要删除的项
      const updatedUserSubs = userSubscriptions.filter(sub => sub.id !== idToDelete);
      setUserSubscriptions(updatedUserSubs); // 更新 React State

      // 将更新后的列表保存回 LocalStorage
      try {
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已成功删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage:", updatedUserSubs.length, "个");

          // **重要**: 如果删除的是当前正在播放或已选中的订阅源，需要清空相关状态并重置播放器
          if (selectedSubscriptionUrl === subToDelete.url) {
              console.log("删除了当前选中的订阅源，重置频道列表和播放器。");
              setSelectedSubscriptionUrl(null); // 清空选中的订阅 URL
              setChannels([]);                 // 清空频道列表
              setSelectedChannelUrl(null);     // 清空选中的频道 URL
              // 停止并重置播放器
              if (videoRef.current) {
                  videoRef.current.pause(); // 暂停播放
              }
              if (hlsRef.current) { // 如果在使用 HLS.js
                  hlsRef.current.stopLoad();     // 停止加载数据
                  hlsRef.current.detachMedia(); // 从 video 元素解绑 HLS 实例
                  // 可能需要重新 attachMedia 才能播放下一个源，或者在 loadVideoStream 中处理
              }
              if (videoRef.current) { // 清理 video 标签
                  videoRef.current.removeAttribute('src'); // 移除 src 属性 (对原生 HLS 很重要)
                  videoRef.current.load(); // 尝试让 video 元素重置到初始状态
              }
               setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' }); // 更新状态提示
          }
      } catch (error) {
           console.error("从 LocalStorage 删除用户订阅失败:", error);
           setStatus({ message: `删除 "${subToDelete.name}" 失败，无法更新本地存储！`, type: 'error' });
           // 可选：考虑是否回滚状态？
           // setUserSubscriptions(userSubscriptions);
      }

  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项: userSubscriptions, selectedSubscriptionUrl (用于判断是否删除了当前选中项)

  // 处理选择订阅源，获取并解析 M3U 列表
  const fetchAndParseM3u = useCallback(async (originalM3uUrl) => {
    if (!originalM3uUrl) {
        console.warn("fetchAndParseM3u 收到空 URL");
        return; // 无效 URL，不处理
    }

    // 1. 更新界面状态: 记录选中的原始订阅 URL，显示加载信息，清空旧数据
    setSelectedSubscriptionUrl(originalM3uUrl);
    // 从合并列表中找到对应项以获取名称 (或者直接从 URL 提取)
    const selectedSub = mergedSubscriptions.find(sub => sub.url === originalM3uUrl);
    const subName = selectedSub?.name || originalM3uUrl.split('/').pop() || originalM3uUrl;
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]);                 // 清空之前的频道列表
    setSelectedChannelUrl(null);     // 清空之前选中的频道

    // 2. 停止并重置播放器（如果之前有在播放的话）
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) {
        hlsRef.current.stopLoad(); // 停止 HLS.js 加载
        // 不需要 detachMedia，因为 loadSource 会自动处理或在播放下一个流时重新 attach
    }
    if (videoRef.current) {
        videoRef.current.removeAttribute('src'); // 清理原生播放器的 src
        try { videoRef.current.load(); } catch(e) {/* Ignore load errors here */} // 尝试重置
    }

    // 3. 获取最终要请求的 URL (可能经过代理)
    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
        setStatus({ message: `无法处理此订阅 URL: ${originalM3uUrl}`, type: 'error' });
        return; // 无法获取可播放 URL，停止执行
    }
    console.log(`将从以下地址获取 M3U 内容: ${urlToFetch}`);

    // 4. 发起 Fetch 请求获取 M3U 文件内容
    try {
        // 使用最终得到的 URL (原始的或代理的)
        const response = await fetch(urlToFetch);

        // 检查网络请求是否成功
        if (!response.ok) {
            throw new Error(`获取 M3U 文件失败: HTTP ${response.status} ${response.statusText}`);
        }
        // 读取响应内容为文本
        const m3uText = await response.text();

        // --- M3U 解析逻辑 (与之前版本一致) ---
        const parsedChannels = [];
        const lines = m3uText.split('\n');
        let currentChannelInfo = null;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('#EXTINF:')) {
                currentChannelInfo = { id: '', name: '', url: '', logo: '', group: '' }; // 初始化，准备接收信息
                const commaIndex = trimmedLine.indexOf(',');
                if (commaIndex !== -1) {
                    currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
                    const attributesPart = trimmedLine.substring(8, commaIndex);
                    const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
                    if (logoMatch) currentChannelInfo.logo = logoMatch[1];
                    const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
                    if (groupMatch) currentChannelInfo.group = groupMatch[1];
                } else {
                    currentChannelInfo.name = trimmedLine.substring(8).trim(); // 简化处理无逗号的情况
                }
            } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
                // 假定这一行是 URL
                if (trimmedLine.includes('://')) { // 基本 URL 格式检查
                    currentChannelInfo.url = trimmedLine;
                    // 为解析出的频道生成唯一 ID，用于 React 列表渲染
                    currentChannelInfo.id = `ch_${currentChannelInfo.url}_${currentChannelInfo.name}_${parsedChannels.length}`;
                    parsedChannels.push(currentChannelInfo); // 添加到结果数组
                } else {
                    console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine} (关联频道: ${currentChannelInfo.name})`);
                }
                currentChannelInfo = null; // 重置，等待下一个 #EXTINF
            }
        } // M3U 文件行遍历结束

        // 5. 解析完成，更新频道列表状态
        setChannels(parsedChannels);
        // 6. 更新状态栏，告知用户结果
        setStatus({
             message: `"${subName}" 加载完成，共找到 ${parsedChannels.length} 个频道。`,
             type: parsedChannels.length > 0 ? 'info' : 'warning' // 如果没有频道，用 warning 类型
         });

    } catch (error) {
        // 捕获 Fetch 或解析过程中的错误
        console.error(`加载或解析 M3U (${originalM3uUrl}) 时出错:`, error);
        let errorMsg = `加载 "${subName}" 的频道列表时出错: ${error.message}`;
        // 对常见网络或代理错误添加提示
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) {
             errorMsg += ` - 请检查网络连接、代理服务(${apiBaseUrl})或目标源(${originalM3uUrl})是否可用或超时。`;
        } else if (error.message.includes('HTTP 404')) {
             errorMsg += ` - 目标地址未找到。`;
        }
        setStatus({ message: errorMsg, type: 'error'});
        setChannels([]); // 确保出错时频道列表是空的
    }
  }, [mergedSubscriptions, getPlayableUrl, apiBaseUrl]); // 依赖项: mergedSubscriptions (用于找名称), getPlayableUrl, apiBaseUrl

  // 处理选择频道，加载并播放视频流
  const loadVideoStream = useCallback((originalChannelUrl) => {
    if (!originalChannelUrl) {
        console.warn("loadVideoStream 收到空 URL");
        return; // 无效 URL 不处理
    }

    // 1. 更新界面状态：记录选中的原始频道 URL，显示加载状态
    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `正在加载频道...`, type: 'loading' });

    // 2. 停止上一个视频流的加载（如果 HLS.js 在加载的话）
    if(hlsRef.current) {
        hlsRef.current.stopLoad(); // 告诉 HLS.js 停止下载
    }
    // 清理 video 标签的 src，这对原生 HLS 很重要
    if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        try { videoRef.current.load(); } catch(e) {/* Ignore */} // 尝试重置 video 元素
    }

    // 3. 获取最终要播放的 URL (可能经过代理)
    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
        setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
        return; // 无法获取可播放 URL，停止执行
    }
    console.log(`播放器将要加载的源: ${urlToPlay}`);

    // 4. 根据浏览器支持情况，选择用 HLS.js 还是原生方式播放
    if (hlsRef.current) {
        // --- 使用 HLS.js 播放 ---
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        // 确保 video 元素已附加到 HLS 实例 (如果之前 detach 了需要重新 attach)
        if(videoRef.current && !hlsRef.current.media) { // 检查是否已解绑
             hlsRef.current.attachMedia(videoRef.current);
             console.log("HLS.js 重新附加到 video 元素。");
        }
        // 调用 loadSource 方法加载新的视频流 URL
        hlsRef.current.loadSource(urlToPlay);
        // 播放通常在 MANIFEST_PARSED 事件后自动触发 (见 Effect 1 中的监听器)
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // --- 使用浏览器原生 HLS 播放 ---
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        // 直接设置 <video> 标签的 src 属性
        videoRef.current.src = urlToPlay;
        // 对于原生 HLS，需要手动调用 load() 和 play()
        videoRef.current.load(); // 告诉 video 元素去加载新的 src
        videoRef.current.play().catch(e => { // 尝试播放
            console.error("原生 HLS 播放失败:", e.message);
            setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
        });
    } else {
        // --- 两种方式都不支持 ---
        setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }
  }, [getPlayableUrl]); // 依赖项: getPlayableUrl


  // --- JSX 结构渲染 ---
  // 定义页面的 HTML 结构和内容，它会根据上面的状态 (State) 来动态显示
  return (
    // 使用 React Fragment (<> </>) 避免在最外层产生多余的 div
    <>
      <h2>M3U 播放器</h2>

      {/* --- 左侧边栏区域 --- */}
      <div id="sidebar">

        {/* 添加自定义订阅区域 (使用 AddSubscription 组件) */}
        <div id="addSubscriptionArea">
            <h3>添加自定义订阅</h3>
            {/* 将 handleAddUserSubscription 函数作为 prop 传递给子组件 */}
            <AddSubscription addSubscription={handleAddUserSubscription} />
        </div>

        {/* 订阅源列表区域 (使用 SubscriptionList 组件) */}
        <div id="subscriptionArea">
          <h3>订阅源列表</h3>
           {/* 将 mergedSubscriptions (合并后的列表), 删除函数, 选择函数, 当前选中的 URL 作为 props 传递 */}
           <SubscriptionList
                subscriptions={mergedSubscriptions}                // 合并后的完整列表
                removeSubscription={handleDeleteUserSubscription}  // 删除用户订阅的函数
                selectSubscription={fetchAndParseM3u}            // 选择订阅源加载频道的函数
                selectedSubscriptionUrl={selectedSubscriptionUrl}  // 当前选中的订阅源 URL (用于高亮)
           />
        </div>

        {/* 频道列表区域 */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList">
             {/* 条件渲染: 各种提示信息 */}
            {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>请先选择一个订阅源</li> // 初始提示
            )}
             {selectedSubscriptionUrl && status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载频道中...</li> // 正在加载提示
             )}
             {selectedSubscriptionUrl && channels.length === 0 && status.type === 'warning' && status.message.includes("找到 0 个频道") && (
                 <li>此订阅源没有找到可用频道或解析失败</li> // 加载完成但无频道
             )}
              {selectedSubscriptionUrl && channels.length === 0 && status.type === 'error' && status.message.includes("频道列表时出错") && (
                 <li>加载频道列表失败，请检查源或代理</li> // 加载出错提示
             )}

             {/* 遍历频道列表 (channels state)，为每个频道创建一个列表项 */}
            {channels.map((channel) => (
              <li
                key={channel.id} // 使用解析时生成的唯一 ID
                // 如果当前频道是选中的，添加 'selected' 类 (用于 CSS 高亮)
                className={selectedChannelUrl === channel.url ? 'selected' : ''}
                // 点击列表项时，调用 loadVideoStream 函数，传入该频道的原始 URL
                onClick={() => loadVideoStream(channel.url)}
                // 鼠标悬停时显示频道名称和 URL
                title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`}
              >
                 {/* 可选：显示频道 Logo (如果 M3U 中提供了 tvg-logo) */}
                 {channel.logo && (
                     <img
                         // 注意：Logo 的 URL 可能也需要代理！这里简化处理，暂不代理 Logo URL
                         src={channel.logo}
                         alt="" // Logo 通常是装饰性的，alt 可以为空
                         style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle', flexShrink: 0 }} // 设置样式
                         // 如果 Logo 图片加载失败，就隐藏它，避免显示破图图标
                         onError={(e) => { e.target.style.display = 'none'; }}
                     />
                 )}
                 {/* 显示频道名称，用 span 包裹并设置 CSS 处理长文本溢出 */}
                 <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {/* 如果有分组信息 (group-title)，显示在名称前面 */}
                    {channel.group ? `[${channel.group}] ` : ''}
                    {/* 显示频道名称，如果没有名称则显示“未知频道” */}
                    {channel.name || '未知频道'}
                 </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 状态显示区域 */}
        <div id="status" className={status.type}> {/* 将状态类型 (info, success, error 等) 作为 CSS 类名应用 */}
          {status.message} {/* 显示状态消息 */}
        </div>

      </div> {/* --- 左侧边栏结束 --- */}


      {/* --- 右侧主内容区域 --- */}
      <div id="main">
        {/* 视频播放区域 */}
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer"> {/* 用于包裹 video 元素，方便控制样式和宽高比 */}
            {/* HTML5 video 播放器标签 */}
            <video
              ref={videoRef} // 将 ref 关联到这个 video 元素，以便在 JS 中操作
              id="videoPlayer" // CSS ID
              controls // 显示浏览器自带的播放控件 (播放/暂停, 音量, 全屏等)
              playsInline // 在 iOS Safari 上，视频会在当前位置播放，而不是强制全屏
              // autoPlay // 最好不由 autoplay 属性控制，而是由 HLS 事件或用户点击触发播放
              // muted // 如果需要自动播放，通常需要静音启动，但这里由 HLS 事件处理更好
              style={{backgroundColor: '#000', width: '100%', height: '100%'}} // 让 video 元素填满其容器，背景设为黑色
            ></video>
          </div>
        </div>
      </div> {/* --- 右侧主内容结束 --- */}

    </> // React Fragment 结束
  );
}

// 导出 App 组件，以便在 main.jsx 中导入和渲染
export default App;
