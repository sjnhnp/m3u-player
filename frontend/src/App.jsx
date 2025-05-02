// frontend/src/App.jsx
// --- 导入 ---
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js'; // 确保导入 HLS 库
import SubscriptionList from './components/SubscriptionList'; // 导入列表组件
import AddSubscription from './components/AddSubscription';   // 导入添加组件

// --- 常量 ---
const USER_SUBS_LOCALSTORAGE_KEY = 'm3uPlayerUserSubscriptions'; // LocalStorage 键名

function App() {
  // --- 状态定义 (State) ---
  const [fixedSubscriptions, setFixedSubscriptions] = useState([]);     // 固定订阅列表 (来自 Worker)
  const [userSubscriptions, setUserSubscriptions] = useState([]);       // 用户自定义订阅列表 (来自 LocalStorage)
  const [mergedSubscriptions, setMergedSubscriptions] = useState([]); // 合并后的列表，用于显示

  const [channels, setChannels] = useState([]);                         // 当前选定订阅的频道列表
  const [status, setStatus] = useState({ message: "应用加载中...", type: 'loading' }); // 状态信息
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null); // 当前选中的订阅源 URL
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);       // 当前选中的频道 URL

  // --- Refs ---
  const videoRef = useRef(null);  // 指向 <video> 标签
  const hlsRef = useRef(null);    // 存储 HLS.js 的实例对象

  // --- API 地址 ---
  // 获取后端 Worker 的基础 URL，优先使用环境变量，否则使用相对路径 '/api'
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 获取可播放 URL 的辅助函数 (getPlayableUrl) ---
  // 处理 HTTP in HTTPS (混合内容) 的代理逻辑
  const getPlayableUrl = useCallback((originalUrl) => {
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
      // 如果不需要代理，直接返回原始 URL
      return originalUrl;
    } catch (error) {
      console.error(`处理 URL 时发生错误: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 时发生错误，请检查链接格式: ${originalUrl}`, type: 'error' });
      return null;
    }
  }, [apiBaseUrl]); // 依赖 apiBaseUrl

  // --- 副作用 (Effects) ---

  // Effect 1: 初始化 HLS 和加载固定/用户订阅列表 (只运行一次)
  useEffect(() => {
    // --- 初始化 HLS.js 播放器 ---
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("浏览器支持 HLS.js，正在初始化...");
      const hls = new Hls({
        // --- HLS 配置 (从你原始代码中合并) ---
        manifestLoadErrorMaxRetry: 3, // M3U8 清单加载重试次数
        levelLoadErrorMaxRetry: 5,   // 视频分片列表加载重试次数
        fragLoadErrorMaxRetry: 5,     // 单个视频片段加载重试次数
        // 你可以根据需要添加更多 HLS.js 配置项
      });
      hls.attachMedia(videoRef.current);
      hlsRef.current = hls; // 保存 HLS 实例

      // --- HLS.js 事件监听器 (从你原始代码中合并，并加入自动播放逻辑) ---

      // 错误处理
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS 播放错误详情:', data);
         let errorMessage = `播放错误 (${data.type}): ${data.details || '未知详情'}`;
         if (data.fatal) { errorMessage += " (严重)"; }
         if (data.response && data.response.status) { errorMessage += ` - HTTP 状态: ${data.response.status}`; }
         if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
            errorMessage += ` - 请检查网络连接、代理 Worker 或源地址 (${data.url || '未知'}) 是否可用。`;
         }
         setStatus({ message: errorMessage, type: 'error' });
         // 这里可以根据错误类型决定是否需要做一些恢复操作
         // 例如: if (data.fatal) { hls.startLoad(); } or hls.recoverMediaError();
      });

      // 清单解析完成事件 (包含自动播放尝试)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log("M3U8 清单已成功解析，尝试自动播放...");
            videoRef.current?.play().then(() => {
                console.log("HLS.js 自动播放成功启动。");
                if (status.type === 'loading' || status.message.includes("加载")) {
                    setStatus({ message: "正在播放...", type: 'info' });
                }
            }).catch(e => {
                console.error("HLS.js 自动播放失败:", e);
                if (e.name === 'NotAllowedError') {
                    setStatus({ message: "浏览器阻止了自动播放，请点击播放按钮。", type: 'warning' });
                } else {
                    setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
                }
            });
        });

      // 视频片段缓冲成功
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
           if (status.type === 'loading' || status.message === "缓冲中...") {
                setStatus({ message: "正在播放...", type: 'info' });
           }
      });

      // 缓冲停滞
      hls.on(Hls.Events.BUFFER_STALLED, () => {
           setStatus({ message: "缓冲中...", type: 'loading' });
      });

      // 数据追加到缓冲区后
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
           if (status.message === "缓冲中...") {
               setStatus({ message: "正在播放...", type: 'info' });
           }
      });

      // 可选: 监听真正开始播放的事件 (video 元素事件)
      // videoRef.current?.addEventListener('playing', () => {
      //     if (status.message !== "正在播放...") {
      //         setStatus({ message: "正在播放...", type: 'info' });
      //     }
      // });

    // --- 处理原生 HLS (例如 Safari) ---
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("浏览器原生支持 HLS。");
        const videoElement = videoRef.current;

        // --- 原生 HLS 事件监听器 (从你原始代码中合并) ---
        const errorHandler = (e) => {
             console.error('原生 HLS 播放错误:', e, videoElement.error);
             let errorMessage = "播放错误";
             if (videoElement.error) {
                 switch (videoElement.error.code) {
                     case MediaError.MEDIA_ERR_ABORTED: errorMessage = '播放被用户中止'; break;
                     case MediaError.MEDIA_ERR_NETWORK: errorMessage = '网络错误导致视频下载失败'; break;
                     case MediaError.MEDIA_ERR_DECODE: errorMessage = '视频解码错误'; break;
                     case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMessage = '视频资源格式不支持或无法访问'; break;
                     default: errorMessage = '发生未知播放错误';
                 }
             }
             setStatus({ message: errorMessage, type: 'error' });
        };
        const canPlayHandler = () => { // 仅仅表示可以播放，不代表正在播放
             // 自动播放在 loadVideoStream 中处理
             // if (status.type === 'loading') {
             //   setStatus({ message: "准备就绪", type: 'info' });
             // }
        };
        const waitingHandler = () => { // 需要缓冲时
            setStatus({ message: "缓冲中...", type: 'loading' });
        };
        const playingHandler = () => { // 真正开始播放时
             if (status.message !== "正在播放...") {
                setStatus({ message: "正在播放...", type: 'info' });
            }
        };

        videoElement.addEventListener('error', errorHandler);
        videoElement.addEventListener('canplay', canPlayHandler);
        videoElement.addEventListener('waiting', waitingHandler);
        videoElement.addEventListener('playing', playingHandler);

        // 组件卸载时移除原生 HLS 监听器
        // (这个 return 会被下面的主 return 覆盖，所以移到主 return 里)
        // return () => {
        //      videoElement.removeEventListener('error', errorHandler);
        //      // ... remove other listeners ...
        // };

    // --- 浏览器不支持 HLS ---
    } else {
        console.error("浏览器不支持 HLS 播放。");
        setStatus({ message: "抱歉，您的浏览器不支持 HLS 播放。", type: 'error' });
    }

    // --- 加载用户自定义订阅列表 (从 LocalStorage) ---
    try {
        const storedUserSubs = localStorage.getItem(USER_SUBS_LOCALSTORAGE_KEY);
        const initialUserSubs = storedUserSubs ? JSON.parse(storedUserSubs) : [];
        if (Array.isArray(initialUserSubs)) {
             // 基本的数据验证（确保有 id, name, url）
             const validatedUserSubs = initialUserSubs.filter(sub => sub && sub.id && sub.name && sub.url);
             setUserSubscriptions(validatedUserSubs);
             console.log("从 LocalStorage 加载用户订阅:", validatedUserSubs.length, "个");
             if (validatedUserSubs.length !== initialUserSubs.length) {
                 console.warn("部分本地订阅数据格式无效已被过滤。");
                 localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(validatedUserSubs)); // 保存清理后的数据
             }
        } else {
             console.warn("LocalStorage 中的用户订阅数据格式不正确，已重置为空数组。");
             setUserSubscriptions([]);
             localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify([]));
        }
    } catch (error) {
        console.error("从 LocalStorage 加载用户订阅失败:", error);
        setUserSubscriptions([]); // 出错时确保是空数组
        setStatus({ message: "加载本地订阅失败，请检查浏览器设置。", type: 'warning' });
    }

    // --- 获取固定订阅列表 (从 Worker) ---
    const fetchFixedSubs = async () => {
      // 只有在应用刚加载时才显示“正在获取固定列表”
      if (status.message === "应用加载中...") {
           setStatus({ message: "正在获取固定订阅列表...", type: 'loading' });
      }
      try {
        const response = await fetch(`${apiBaseUrl}/fixed-subscriptions`);
        if (!response.ok) {
          throw new Error(`获取固定列表失败: HTTP ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
           // 基本验证（确保有 name, url）
           const validatedFixedSubs = data.filter(sub => sub && sub.name && sub.url);
           setFixedSubscriptions(validatedFixedSubs);
           console.log("从 Worker 获取固定订阅:", validatedFixedSubs.length, "个");
            if (validatedFixedSubs.length !== data.length) {
                 console.warn("部分固定订阅数据格式无效已被过滤。");
            }
           // 不在这里设置状态，等合并后再说
        } else {
           console.error("Worker 返回的固定订阅数据格式不正确。");
           setFixedSubscriptions([]);
           if (status.message.includes("获取固定订阅")) { // 只有在明确获取时才报错
                setStatus({ message: "获取固定订阅列表格式错误。", type: 'error' });
           }
        }
      } catch (error) {
        console.error('获取固定订阅列表时出错:', error);
        setFixedSubscriptions([]);
        if (status.message.includes("获取固定订阅")) { // 只有在明确获取时才报错
            setStatus({ message: `获取固定订阅列表出错: ${error.message}`, type: 'error' });
        }
      }
    };

    fetchFixedSubs();

    // --- 清理函数：在组件卸载时执行 ---
    return () => {
        // 销毁 HLS 实例
        hlsRef.current?.destroy();
        console.log("HLS instance destroyed on unmount.");

        // 移除原生 HLS 监听器 (如果 videoRef.current 存在)
        const videoElement = videoRef.current;
        if (videoElement && videoElement.canPlayType('application/vnd.apple.mpegurl')) {
             // 这里需要重新获取 handler 函数的引用，或者在 useEffect 外部定义它们
             // 为了简单起见，这里不移除，因为组件卸载时元素也会消失
             // 如果需要严格清理，需要将 handler 定义在 useEffect 外部或用 useCallback 包裹
             console.log("Native HLS listeners cleanup skipped for simplicity on unmount.");
        }
    };
  }, [apiBaseUrl, status.message]); // 依赖 apiBaseUrl 和 status.message (用于控制初始加载文本)

  // Effect 2: 合并固定和用户列表 (当 fixed 或 user 列表变化时运行)
  useEffect(() => {
    const merged = [
      // 固定列表项，标记 isFixed: true
      // 固定列表没有 id，可以用 url 作为临时 key (假设 url 唯一)
      ...fixedSubscriptions.map(sub => ({ ...sub, id: `fixed_${sub.url}`, isFixed: true })),
      // 用户列表项，标记 isFixed: false (用户列表应该有 id)
      ...userSubscriptions.map(sub => ({ ...sub, isFixed: false }))
    ];
    setMergedSubscriptions(merged);
    console.log("合并后的订阅列表:", merged.length, "个");

    // 更新初始状态信息（仅当列表加载完成且状态还是加载中时）
    if (status.message === "正在获取固定订阅列表..." || status.message === "应用加载中...") {
        setStatus({ message: merged.length > 0 ? "请选择一个订阅源" : "请添加您的第一个订阅", type: 'info'});
    }

  }, [fixedSubscriptions, userSubscriptions, status.message]); // 依赖项


  // --- 事件处理函数 (Event Handlers) ---

  // 添加用户订阅 (操作 LocalStorage)
  const handleAddUserSubscription = useCallback((newSubData) => {
    const { name, url } = newSubData;
    const trimmedUrl = url.trim();
    const trimmedName = name.trim() || trimmedUrl.split('/').pop() || '未命名订阅'; // 提供默认名称

    // 去重检查 (URL 不区分 http/https)
    const normalizeUrl = (u) => u.replace(/^https?:\/\//, '');
    const targetUrlNormalized = normalizeUrl(trimmedUrl);
    const isDuplicate = mergedSubscriptions.some(sub => normalizeUrl(sub.url) === targetUrlNormalized);

    if (isDuplicate) {
      setStatus({ message: `订阅地址 "${trimmedUrl}" 已存在或非常相似，无法重复添加。`, type: 'warning' });
      return;
    }

    // 生成唯一 ID
    const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubscription = { id: newId, name: trimmedName, url: trimmedUrl };

    // 更新状态和 LocalStorage
    const updatedUserSubs = [...userSubscriptions, newSubscription];
    try {
       setUserSubscriptions(updatedUserSubs); // 先更新状态触发合并
       localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
       setStatus({ message: `自定义订阅 "${trimmedName}" 添加成功!`, type: 'success' });
       console.log("用户订阅已更新并保存到 LocalStorage");
    } catch (error) {
        console.error("保存用户订阅到 LocalStorage 失败:", error);
        // 如果保存失败，回滚状态
        setUserSubscriptions(userSubscriptions);
        setStatus({ message: "添加订阅时保存到本地失败！请检查浏览器存储空间或权限。", type: 'error' });
    }
  }, [userSubscriptions, mergedSubscriptions]); // 依赖 userSubscriptions 和 mergedSubscriptions (用于去重)


  // 删除用户订阅 (操作 LocalStorage)
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

      try {
          setUserSubscriptions(updatedUserSubs); // 更新状态触发合并
          localStorage.setItem(USER_SUBS_LOCALSTORAGE_KEY, JSON.stringify(updatedUserSubs));
          setStatus({ message: `自定义订阅 "${subToDelete.name}" 已删除。`, type: 'success' });
          console.log("用户订阅已更新并保存到 LocalStorage");

          // 如果删除的是当前选中的订阅，重置相关状态
          if (selectedSubscriptionUrl === subToDelete.url) {
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null);
              // 停止并重置播放器
              videoRef.current?.pause();
              if (hlsRef.current) {
                  hlsRef.current.stopLoad();
                  hlsRef.current.detachMedia(); // 解绑 HLS
              }
              if (videoRef.current) {
                  videoRef.current.removeAttribute('src'); // 清理 src
                  videoRef.current.load(); // 重置播放器状态
              }
               setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' });
          }
      } catch (error) {
           console.error("从 LocalStorage 删除用户订阅失败:", error);
            // 如果保存失败，回滚状态
           setUserSubscriptions(userSubscriptions);
           setStatus({ message: "删除订阅时更新本地存储失败！", type: 'error' });
      }

  }, [userSubscriptions, selectedSubscriptionUrl]); // 依赖项


  // 获取和解析 M3U 列表 (fetchAndParseM3u)
  const fetchAndParseM3u = useCallback(async (originalM3uUrl) => {
    if (!originalM3uUrl || !mergedSubscriptions.some(s => s.url === originalM3uUrl)) {
        console.warn("尝试加载一个无效或不存在的订阅 URL:", originalM3uUrl);
        return;
    }

    // 找到对应的订阅名称
    const currentSub = mergedSubscriptions.find(s => s.url === originalM3uUrl);
    const subName = currentSub?.name || originalM3uUrl.split('/').pop() || originalM3uUrl;

    // 1. 更新界面状态
    setSelectedSubscriptionUrl(originalM3uUrl);
    setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
    setChannels([]);                 // 清空旧频道
    setSelectedChannelUrl(null);     // 清空旧选中频道

    // 2. 停止并重置播放器
    videoRef.current?.pause();
    if (hlsRef.current) {
        hlsRef.current.stopLoad(); // 停止 HLS.js 加载
        // loadSource 会自动 detach/attach，无需手动调用
    }
    if (videoRef.current) {
        videoRef.current.removeAttribute('src'); // 清理原生播放器的 src
        videoRef.current.load(); // 尝试重置 video 元素状态
    }

    // 3. 获取实际要请求的 URL (可能经过代理)
    const urlToFetch = getPlayableUrl(originalM3uUrl);
    if (!urlToFetch) {
        setStatus({ message: `无法处理此订阅 URL: ${originalM3uUrl}`, type: 'error' });
        return;
    }
    console.log(`将从以下地址获取 M3U 内容: ${urlToFetch}`);

    // 4. 发起请求并解析
    try {
        const response = await fetch(urlToFetch);
        if (!response.ok) {
            throw new Error(`获取 M3U 文件失败: HTTP ${response.status} ${response.statusText}`);
        }
        const m3uText = await response.text();

        // --- M3U 解析逻辑 (与之前版本一致) ---
        const parsedChannels = [];
        const lines = m3uText.split('\n');
        let currentChannelInfo = null;
        let channelIndex = 0; // 用于生成唯一 Key

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
                // 如果解析不出名字，给个默认值
                if (!currentChannelInfo.name) {
                   currentChannelInfo.name = "未命名频道";
                }
            } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
                // 基本 URL 格式验证
                if (trimmedLine.includes('://')) {
                    currentChannelInfo.url = trimmedLine;
                    // ★ 添加唯一 ID，用于 React 列表渲染
                    currentChannelInfo.id = `ch_${channelIndex++}_${currentChannelInfo.url.substring(currentChannelInfo.url.length - 10)}`;
                    parsedChannels.push(currentChannelInfo);
                } else {
                    console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine}`);
                }
                currentChannelInfo = null; // 重置，处理下一组 #EXTINF 和 URL
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
        let errorMsg = `加载 "${subName}" 频道列表时出错: ${error.message}`;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('HTTP 504') || error.message.includes('HTTP 502')) {
             errorMsg += ` - 请检查网络连接或目标地址/代理(${urlToFetch})是否可用或超时。`;
        } else if (error.message.includes('HTTP 404')) {
            errorMsg += ` - 订阅地址 (${urlToFetch}) 不存在。`;
        }
        setStatus({ message: errorMsg, type: 'error'});
        setChannels([]); // 确保出错时频道列表是空的
    }
  }, [getPlayableUrl, mergedSubscriptions]); // 依赖 getPlayableUrl 和 mergedSubscriptions (用于查找名称)


  // 加载并播放指定的视频流 (loadVideoStream)
  const loadVideoStream = useCallback((originalChannelUrl) => {
    if (!originalChannelUrl) {
        console.warn("loadVideoStream 收到空 URL");
        return;
    }

    // 1. 更新状态
    setSelectedChannelUrl(originalChannelUrl);
    setStatus({ message: `正在加载频道...`, type: 'loading' });

    // 2. 停止上一个流 (如果 HLS.js 在用)
    if(hlsRef.current) {
        hlsRef.current.stopLoad(); // 停止下载
    }
    // 清理 video 标签的 src (对原生 HLS 很重要)
    if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        videoRef.current.pause(); // 也暂停一下
        // videoRef.current.load(); // load 可能不需要，由后续操作触发
    }

    // 3. 获取播放 URL (可能代理)
    const urlToPlay = getPlayableUrl(originalChannelUrl);
    if (!urlToPlay) {
        setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
        return;
    }
    console.log(`播放器将要加载的源: ${urlToPlay}`);

    // 4. 根据支持情况播放
    if (hlsRef.current) {
        // --- 使用 HLS.js 播放 ---
        console.log(`使用 HLS.js 加载: ${urlToPlay}`);
        // 确保 video 元素已附加 (通常初始化时已做)
        if (videoRef.current && !hlsRef.current.media) { // 检查是否未附加或被解绑
             hlsRef.current.attachMedia(videoRef.current);
        }
        // 加载新源 (HLS.js 会在 MANIFEST_PARSED 后尝试自动播放)
        hlsRef.current.loadSource(urlToPlay);
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // --- 使用原生 HLS 播放 ---
        console.log(`使用原生 HLS 加载: ${urlToPlay}`);
        videoRef.current.src = urlToPlay;
        videoRef.current.load(); // 告诉 video 元素去加载新的 src

        // --- 尝试原生 HLS 自动播放 ---
        // 注意：这里的 play() 可能在数据未完全准备好时调用，但通常是必要的触发
        videoRef.current.play().then(() => {
            console.log("原生 HLS 自动播放尝试成功启动。");
             if (status.type === 'loading' || status.message.includes("加载")) {
                setStatus({ message: "正在播放...", type: 'info' });
            }
        }).catch(e => {
            console.error("原生 HLS 自动播放尝试失败:", e);
            if (e.name === 'NotAllowedError') {
                setStatus({ message: "浏览器阻止了自动播放，请点击播放按钮。", type: 'warning' });
            } else {
                 // 保持“加载中”或提示点击，而不是直接说失败
                 // setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
                 if (status.type === 'loading') {
                     setStatus({ message: "加载完成，请点击播放。", type: 'info' });
                 }
            }
        });
    } else {
        // 浏览器不支持 HLS
        setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
    }
   }, [getPlayableUrl, status.type, status.message]); // 依赖 getPlayableUrl 和 status (用于播放成功/失败时更新状态)


  // --- JSX 渲染 ---
  return (
    <>
      <h2>M3U 播放器</h2>

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
                subscriptions={mergedSubscriptions} // 传递合并后的列表
                removeSubscription={handleDeleteUserSubscription} // 传递删除函数
                selectSubscription={fetchAndParseM3u} // 传递选择函数
                selectedSubscriptionUrl={selectedSubscriptionUrl} // 传递当前选中的 URL 用于高亮
           />
           {/* 加载固定列表时的提示 */}
           {status.type === 'loading' && status.message.includes("获取固定订阅") && (
               <p style={{textAlign: 'center', fontStyle: 'italic', marginTop: '10px'}}>加载固定源...</p>
            )}
        </div>

        {/* 频道列表区域 */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList">
             {/* 初始或未选择订阅时的提示 */}
            {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>请先选择一个订阅源</li>
             )}
             {/* 正在加载频道列表的提示 */}
             {status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载频道中...</li>
             )}
             {/* 加载完成但列表为空的提示 */}
             {selectedSubscriptionUrl && channels.length === 0 && status.type !== 'loading' && !status.message.includes("频道列表") && !status.message.includes("出错") && (
                 <li>此订阅源没有可用频道或解析失败</li>
             )}
             {/* 遍历并显示频道 */}
            {channels.map((channel) => (
              <li
                key={channel.id} // ★ 使用解析时生成的唯一 ID
                className={selectedChannelUrl === channel.url ? 'selected' : ''} // 高亮选中项
                onClick={() => loadVideoStream(channel.url)} // 点击加载播放
                title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`} // 鼠标悬停提示
              >
                 {/* 显示 Logo (如果存在) */}
                 {channel.logo && (
                     <img
                         src={channel.logo}
                         alt="" // Logo 通常是装饰性的
                         style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle', flexShrink: 0 }}
                         // 如果 Logo 加载失败，隐藏它
                         onError={(e) => { e.target.style.display = 'none'; }}
                     />
                 )}
                 {/* 显示频道名称和分组 */}
                 <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {channel.group ? `[${channel.group}] ` : ''}
                    {channel.name}
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


      {/* --- 右侧主内容区域 (播放器) --- */}
      <div id="main">
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer">
            {/* HTML5 video 播放器标签 */}
            <video
              ref={videoRef}
              id="videoPlayer"
              controls // 显示浏览器自带的播放控件
              playsInline // 在 iOS Safari 上内联播放
              // muted // 如果自动播放仍有问题，可以取消注释此行进行静音播放测试
              style={{backgroundColor: '#000', width: '100%', height: '100%', display: 'block'}} // 确保是块级元素
            ></video>
          </div>
        </div>
      </div> {/* main end */}

    </> // React Fragment 结束
  );
}

// 导出 App 组件
export default App;

