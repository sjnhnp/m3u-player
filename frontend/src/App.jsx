// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js'; // 确保导入 HLS 库

// App 组件定义
function App() {
  // --- 状态定义 (State) ---
  // 这些是用来存储应用数据的变量，当它们改变时，界面会更新
  const [subscriptions, setSubscriptions] = useState([]); // 存储用户添加的订阅列表，初始为空数组
  const [channels, setChannels] = useState([]);         // 存储从 M3U 文件解析出来的频道列表，初始为空数组
  const [status, setStatus] = useState({ message: "请先添加或选择一个订阅", type: 'info' }); // 显示给用户的状态信息和类型 (info, success, error, loading, warning)
  const [subUrlInput, setSubUrlInput] = useState('');   // 输入框中用户输入的订阅 URL
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null); // 记录当前用户点击选中的是哪个 *原始* 订阅 URL
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);       // 记录当前用户点击选中的是哪个 *原始* 频道 URL
  const [isAdding, setIsAdding] = useState(false);      // 标记是否正在添加订阅（用于禁用按钮）

  // --- Refs ---
  // Refs 用来直接访问 DOM 元素（比如 video 播放器）或存储 HLS 实例
  const videoRef = useRef(null);  // 指向 <video> 标签
  const hlsRef = useRef(null);    // 存储 HLS.js 的实例对象

  // --- API 地址 ---
  // 获取后端 Worker 的基础 URL，优先使用环境变量，否则使用相对路径 '/api'
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

  // --- 新增：获取可播放 URL 的辅助函数 ---
  // 这个函数是解决 HTTP 在 HTTPS 页面播放问题的关键！
  // 它接收一个原始的 URL (可能是 HTTP 或 HTTPS)，然后决定最终应该用哪个 URL 去请求资源。
  const getPlayableUrl = (originalUrl) => {
    // 健壮性检查：如果传入的 URL 是空的或无效的，直接返回 null
    if (!originalUrl) {
      console.warn("getPlayableUrl 函数收到了一个空的 URL");
      return null;
    }

    try {
      // 判断原始 URL 是不是以 "http://" 开头 (忽略大小写)
      const isHttp = originalUrl.toLowerCase().startsWith('http://');
      // 判断当前网页是不是通过 "https://" 加载的
      const isPageHttps = window.location.protocol === 'https:';

      // *** 核心判断逻辑 ***
      // 如果：原始 URL 是 HTTP，并且 当前页面是 HTTPS (这就是典型的“混合内容”场景)
      // 那么：我们不能直接加载这个 HTTP 资源，需要通过我们的 Cloudflare Worker 代理来加载。
      if (isHttp && isPageHttps) {
        console.log(`需要代理 HTTP URL: ${originalUrl}`);
        // 构建代理 URL。格式是：你的 Worker 地址 + /proxy?url= + 经过编码的原始 URL
        // encodeURIComponent 非常重要，它会把原始 URL 中的特殊字符（比如 &、?、= 等）转换成安全的形式，
        // 防止它们破坏代理 URL 的结构。
        return `${apiBaseUrl}/proxy?url=${encodeURIComponent(originalUrl)}`;
      }

      // 如果不满足上面的条件 (比如原始 URL 本身就是 HTTPS，或者你的整个网页就是 HTTP)，
      // 那就不需要代理，直接使用原始的 URL。
      // 注意：如果以后你的 HTTPS 源也有跨域问题(CORS)，也可以在这里添加逻辑来代理 HTTPS。
      return originalUrl;

    } catch (error) {
      // 如果传入的 URL 格式不正确，导致上面的代码出错，记录错误并返回 null
      console.error(`处理 URL 时发生错误: ${originalUrl}`, error);
      setStatus({ message: `处理 URL 时发生错误，请检查链接格式: ${originalUrl}`, type: 'error' });
      return null; // 返回 null 表示这个 URL 无法处理
    }
  };


  // --- 副作用 (Effects) ---
  // useEffect 里的代码会在组件加载后、或依赖项变化时执行

  // 这个 useEffect 只在组件第一次加载时执行一次 (因为依赖项数组 [] 是空的)
  // 用来初始化 HLS.js 播放器
  useEffect(() => {
    // 检查浏览器是否支持 HLS.js (基于 MSE)
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("浏览器支持 HLS.js，正在初始化...");
      // 创建 HLS.js 实例，可以传入一些配置优化播放体验
      const hls = new Hls({
        // 例如：增加加载 M3U8 和视频片段失败时的重试次数
        manifestLoadErrorMaxRetry: 3, // M3U8 清单加载重试次数
        levelLoadErrorMaxRetry: 5,   // 视频分片列表加载重试次数
        fragLoadErrorMaxRetry: 5,     // 单个视频片段加载重试次数
      });
      // 将 HLS.js 实例附加到 <video> 元素上
      hls.attachMedia(videoRef.current);
      // 将 HLS.js 实例保存到 ref 中，方便其他地方使用
      hlsRef.current = hls;

      // --- 监听 HLS.js 的关键事件 ---

      // 监听错误事件
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS 播放错误详情:', data); // 在控制台打印详细错误信息
         // 准备一个用户友好的错误消息
         let errorMessage = `播放错误 (${data.type}): ${data.details || '未知详情'}`;
         if (data.fatal) { // 如果是严重错误，标记一下
             errorMessage += " (严重)";
         }
         // 尝试从错误数据中获取 HTTP 状态码，提供更多线索
         if (data.response && data.response.status) {
            errorMessage += ` - HTTP 状态: ${data.response.status}`;
         }
         // 如果是 M3U8 清单加载失败或超时，给出更具体的提示
         if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
            errorMessage += ` - 请检查网络连接、代理 Worker 或源地址 (${data.url}) 是否可用。`;
         }
         // 更新状态栏显示错误信息
         setStatus({ message: errorMessage, type: 'error' });
         // 这里可以根据错误类型决定是否需要做一些恢复操作，比如 hls.startLoad() 或销毁重建实例
      });

      // 监听 M3U8 清单成功解析事件
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log("M3U8 清单已成功解析。");
            setStatus({ message: "准备播放...", type: 'loading' });
            // 尝试自动播放（注意：很多浏览器会阻止无用户交互的自动播放）
            videoRef.current?.play().catch(e => {
                console.error("自动播放失败:", e);
                // 如果自动播放失败，或者需要用户交互才能播放，提示用户点击播放按钮
                setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
            });
        });

      // 可选：监听视频片段缓冲成功的事件
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
           // 当有数据成功缓冲时，可以认为加载正常，如果状态还是“加载中”，可以更新为“正在播放”
           if (status.type === 'loading') {
                setStatus({ message: "正在播放...", type: 'info' });
           }
      });

      // 可选：监听缓冲事件
      hls.on(Hls.Events.BUFFER_STALLED, () => {
           setStatus({ message: "缓冲中...", type: 'loading' });
      });
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
           // 数据追加成功后，如果之前是缓冲状态，可以改回播放状态
           if (status.message === "缓冲中...") {
               setStatus({ message: "正在播放...", type: 'info' });
           }
      });

    // 检查浏览器是否原生支持 HLS (比如 Safari)
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("浏览器原生支持 HLS。");
        // 对于原生 HLS，错误和状态事件需要直接监听 video 元素
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
                     default: errorMessage = '发生未知播放错误';
                 }
             }
             setStatus({ message: errorMessage, type: 'error' });
        };
        const canPlayHandler = () => {
            if (status.type === 'loading') {
                setStatus({ message: "正在播放...", type: 'info' });
            }
        };
        const waitingHandler = () => {
            setStatus({ message: "缓冲中...", type: 'loading' });
        };
        const playingHandler = () => { // 监听 playing 事件更可靠地表示正在播放
             if (status.message === "缓冲中..." || status.type === 'loading') {
                setStatus({ message: "正在播放...", type: 'info' });
            }
        };

        videoElement.addEventListener('error', errorHandler);
        videoElement.addEventListener('canplay', canPlayHandler); // 可以播放时
        videoElement.addEventListener('waiting', waitingHandler); // 需要缓冲时
        videoElement.addEventListener('playing', playingHandler); // 真正开始播放时

        // 在组件卸载时移除这些监听器
        return () => {
             videoElement.removeEventListener('error', errorHandler);
             videoElement.removeEventListener('canplay', canPlayHandler);
             videoElement.removeEventListener('waiting', waitingHandler);
             videoElement.removeEventListener('playing', playingHandler);
        };

    } else {
        // 如果两种方式都不支持
        console.error("浏览器不支持 HLS 播放。");
        setStatus({ message: "抱歉，您的浏览器不支持 HLS 播放。", type: 'error' });
    }

    // 清理函数：在组件卸载时执行，销毁 HLS 实例，释放资源
    return () => {
        hlsRef.current?.destroy();
        console.log("HLS instance destroyed on unmount.");
    };
  }, []); // 空数组表示这个 effect 只运行一次

  // 这个 useEffect 在组件加载后，或者 apiBaseUrl 变化时执行
  // 用来从后端加载已保存的订阅列表
  useEffect(() => {
    const fetchSubs = async () => {
        setStatus({ message: "正在加载订阅列表...", type: 'loading'});
        try {
            // 向 Worker 的 /api/subscriptions 发送 GET 请求
            const response = await fetch(`${apiBaseUrl}/subscriptions`);
            if (!response.ok) { // 检查请求是否成功
                throw new Error(`获取订阅列表失败: HTTP ${response.status}`);
            }
            const data = await response.json(); // 解析返回的 JSON 数据
            setSubscriptions(data || []); // 更新订阅列表状态
            // 根据是否有数据更新状态信息
            setStatus({ message: data?.length ? "订阅列表加载成功。请选择一个订阅。" : "您还没有添加任何订阅。", type: 'info' });
        } catch (error) {
            console.error('加载订阅列表时出错:', error);
            setStatus({ message: `加载订阅列表出错: ${error.message}`, type: 'error'});
            setSubscriptions([]); // 出错时清空列表
        }
    };
    fetchSubs(); // 执行加载函数
  }, [apiBaseUrl]); // 当 apiBaseUrl 变化时会重新运行 (虽然基本不会变)

  // --- 事件处理函数 (Event Handlers) ---
  // 这些函数会在用户进行操作（如点击按钮、输入）时被调用

  // 处理“添加”按钮点击事件
  const handleAddSubscription = async () => {
    // 简单验证输入的 URL
    if (!subUrlInput || !(subUrlInput.startsWith('http://') || subUrlInput.startsWith('https://'))) {
        setStatus({ message: "请输入一个有效的、以 http:// 或 https:// 开头的 M3U/M3U8 URL。", type: 'warning'});
        return; // 验证不通过，停止执行
    }
    setIsAdding(true); // 设置为“正在添加”状态，禁用按钮
    setStatus({ message: "正在添加订阅...", type: 'loading'});
    try {
        // 向 Worker 的 /api/subscriptions 发送 POST 请求
        const response = await fetch(`${apiBaseUrl}/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // 告诉后端发送的是 JSON
            body: JSON.stringify({ url: subUrlInput }), // 将输入的 URL 包装成 JSON 发送
        });
        if (!response.ok) { // 检查请求是否成功
             // 尝试解析错误信息，如果后端没返回标准 JSON 错误，给个通用提示
             const errorData = await response.json().catch(() => ({ error: '未知错误，请检查 Worker 日志'}));
             throw new Error(`添加失败: ${response.status} - ${errorData.error || response.statusText}`);
        }
        const newSubscription = await response.json(); // 解析成功添加的订阅信息
        // 更新前端的订阅列表状态，在现有列表后面追加新的订阅
        setSubscriptions(prevSubs => [...prevSubs, newSubscription]);
        // 显示成功信息
        setStatus({ message: `订阅 "${newSubscription.url.split('/').pop() || newSubscription.url}" 添加成功!`, type: 'success'});
        setSubUrlInput(''); // 清空输入框
    } catch (error) {
        console.error('添加订阅时出错:', error);
        setStatus({ message: `添加订阅出错: ${error.message}`, type: 'error'});
    } finally {
        // 无论成功还是失败，最后都取消“正在添加”状态，使按钮可用
        setIsAdding(false);
    }
  };

  // 处理“删除”按钮点击事件
  const handleDeleteSubscription = async (id, url) => {
      // 弹出确认框，防止误删
      if (!id || !window.confirm(`确定要删除订阅 "${url.split('/').pop() || url}" 吗？`)) {
          return; // 用户取消，则不执行删除
      }
      setStatus({ message: `正在删除订阅 ${id}...`, type: 'loading'});
      try {
          // 向 Worker 的 /api/subscriptions/{id} 发送 DELETE 请求
          const response = await fetch(`${apiBaseUrl}/subscriptions/${id}`, { method: 'DELETE' });
          // DELETE 成功通常返回 204 No Content，也要允许 200 OK
          if (!response.ok && response.status !== 204) {
               const errorData = await response.json().catch(() => ({ error: '未知错误' }));
               throw new Error(`删除失败: ${response.status} - ${errorData.error || response.statusText}`);
          }
          setStatus({ message: `订阅 ${id} 已成功删除。`, type: 'success'});
          // 从前端的订阅列表中移除被删除的项
          setSubscriptions(prevSubs => prevSubs.filter(sub => sub.id !== id));
          // **重要**：如果删除的是当前正在播放或显示的订阅，需要清空频道列表和播放器状态
          if (selectedSubscriptionUrl === url) {
              setSelectedSubscriptionUrl(null); // 清空选中的订阅 URL
              setChannels([]);                 // 清空频道列表
              setSelectedChannelUrl(null);     // 清空选中的频道 URL
              // 停止并重置播放器
              videoRef.current?.pause(); // 暂停播放
              if (hlsRef.current) { // 如果在使用 HLS.js
                  hlsRef.current.stopLoad();     // 停止加载数据
                  hlsRef.current.detachMedia(); // 从 video 元素解绑
              }
              if (videoRef.current) { // 清理 video 标签
                  videoRef.current.removeAttribute('src'); // 移除 src 属性
                  videoRef.current.load(); // 尝试让 video 元素重置到初始状态
              }
               setStatus({ message: "当前订阅已删除，播放器已重置。", type: 'info' }); // 更新状态提示
          }
      } catch (error) {
           console.error(`删除订阅 ${id} 时出错:`, error);
           setStatus({ message: `删除订阅出错: ${error.message}`, type: 'error'});
      }
  };


  // **修改后**：获取和解析 M3U 列表的函数
  // 当用户点击某个订阅时，这个函数会被调用
   const fetchAndParseM3u = async (originalM3uUrl) => { // 参数名改为 originalM3uUrl 更清晰
       // 健壮性检查
       if (!originalM3uUrl) {
           console.warn("fetchAndParseM3u 收到空 URL");
           return;
       }

       // 1. 更新界面状态：记录选中的是哪个原始订阅 URL，显示加载信息，清空旧数据
       setSelectedSubscriptionUrl(originalM3uUrl);
       const subName = originalM3uUrl.split('/').pop() || originalM3uUrl; // 提取 URL 最后一部分作为名称
       setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
       setChannels([]);                 // 清空之前的频道列表
       setSelectedChannelUrl(null);     // 清空之前选中的频道

       // 2. 停止并重置播放器（如果之前有在播放的话）
       videoRef.current?.pause();
       if (hlsRef.current) {
           hlsRef.current.stopLoad(); // 停止 HLS.js 加载
           // 不需要 detachMedia，因为 loadSource 会处理
       }
       if (videoRef.current) {
           videoRef.current.removeAttribute('src'); // 清理原生播放器的 src
           videoRef.current.load(); // 尝试重置
       }

       // --- 核心改动：调用 getPlayableUrl 获取最终要请求的 URL ---
       const urlToFetch = getPlayableUrl(originalM3uUrl);
       // 如果 getPlayableUrl 返回 null (表示 URL 有问题)
       if (!urlToFetch) {
           setStatus({ message: `无法处理此订阅 URL: ${originalM3uUrl}`, type: 'error' });
           return; // 停止执行
       }
       console.log(`将从以下地址获取 M3U 内容: ${urlToFetch}`);
       // --- 结束核心改动 ---

       try {
            // 3. 使用最终得到的 URL (可能是原始的，也可能是代理的) 发起 fetch 请求
            // 注意：请求我们自己的 Worker 代理时，不需要加 mode: 'cors'
            const response = await fetch(urlToFetch);

            // 4. 检查网络请求是否成功
            if (!response.ok) {
                 // 如果请求失败 (例如 404 Not Found, 500 Internal Server Error 等)
                 throw new Error(`获取 M3U 文件失败: HTTP ${response.status} ${response.statusText}`);
            }
            // 5. 读取响应内容为文本格式 (M3U 文件是文本)
            const m3uText = await response.text();

            // 6. 解析 M3U 文本内容 (这部分解析逻辑保持和你原来的一样)
            const parsedChannels = []; // 准备一个空数组来存放解析结果
            const lines = m3uText.split('\n'); // 按行分割 M3U 文本
            let currentChannelInfo = null; // 临时存储当前正在处理的频道信息

            for (const line of lines) {
                const trimmedLine = line.trim(); // 去掉行首行尾的空格

                // 如果这行以 #EXTINF: 开头，表示这是一个频道的信息行
                if (trimmedLine.startsWith('#EXTINF:')) {
                    // 初始化当前频道信息对象
                    currentChannelInfo = { name: '', url: '', logo: '', group: '' };
                    // 找到第一个逗号的位置，后面的内容是频道名称
                    const commaIndex = trimmedLine.indexOf(',');
                    if (commaIndex !== -1) {
                        // 获取频道名称
                        currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
                        // 尝试从 #EXTINF: 和逗号之间的部分提取属性 (logo, group)
                        const attributesPart = trimmedLine.substring(8, commaIndex);
                        const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i); // 匹配 tvg-logo="..."
                        if (logoMatch) currentChannelInfo.logo = logoMatch[1];
                        const groupMatch = attributesPart.match(/group-title="([^"]*)"/i); // 匹配 group-title="..."
                        if (groupMatch) currentChannelInfo.group = groupMatch[1];
                    } else {
                        // 如果没有逗号，可能格式比较简单，直接把 #EXTINF: 后面的内容作为名称
                        currentChannelInfo.name = trimmedLine.substring(8).trim();
                    }
                }
                // 如果这行不是注释 (# 开头)，并且我们刚刚处理过 #EXTINF 行 (currentChannelInfo 不为 null)，
                // 那么这行很可能就是频道的播放 URL
                else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
                    // 做一个基本的 URL 格式检查
                    if (trimmedLine.includes('://')) { // 简单检查是否包含 "://"
                        currentChannelInfo.url = trimmedLine; // 保存 URL
                        parsedChannels.push(currentChannelInfo); // 将完整的频道信息添加到结果数组中
                    } else {
                        console.warn(`忽略了一个看起来不像 URL 的行: ${trimmedLine}`);
                    }
                    // 不论这行是不是有效的 URL，处理完后都要重置 currentChannelInfo，
                    // 避免下一行的非 URL 内容被错误地关联
                    currentChannelInfo = null;
                }
            } // M3U 文件行遍历结束

            // 7. 解析完成，更新频道列表状态
            setChannels(parsedChannels);
            // 8. 更新状态栏，告诉用户加载结果
            setStatus({
                 message: `"${subName}" 加载完成，共找到 ${parsedChannels.length} 个频道。`,
                 // 如果一个频道都没找到，给个警告类型；否则是普通信息类型
                 type: parsedChannels.length > 0 ? 'info' : 'warning'
             });

       } catch (error) {
            // 捕获在 fetch 或解析过程中可能发生的任何错误
            console.error('加载或解析 M3U 时出错:', error);
            // 在界面上显示错误信息
            let errorMsg = `加载 "${subName}" 的频道列表时出错: ${error.message}`;
            // 如果是网络错误，添加更具体的提示
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                 errorMsg += ` - 请检查网络连接或目标地址/代理(${urlToFetch})是否可用。`;
            }
             setStatus({ message: errorMsg, type: 'error'});
            setChannels([]); // 确保出错时频道列表是空的
       }
   };

   // **修改后**：加载并播放指定的视频流函数
   // 当用户点击某个频道时，这个函数会被调用
   const loadVideoStream = (originalChannelUrl) => { // 参数名改为 originalChannelUrl
        // 健壮性检查
        if (!originalChannelUrl) {
            console.warn("loadVideoStream 收到空 URL");
            return;
        }

        // 1. 更新界面状态：记录选中的原始频道 URL，显示加载状态
        setSelectedChannelUrl(originalChannelUrl);
        setStatus({ message: `正在加载频道...`, type: 'loading' });

        // 2. 停止上一个视频流的加载（如果正在加载的话）
        if(hlsRef.current) {
            hlsRef.current.stopLoad(); // 告诉 HLS.js 停止下载
        }
        // 清理 video 标签的 src，这对原生 HLS 很重要
        if (videoRef.current) {
            videoRef.current.removeAttribute('src');
            // videoRef.current.load(); // load 可能不需要，由后续的 loadSource 或设置 src 触发
        }


        // --- 核心改动：调用 getPlayableUrl 获取最终要播放的 URL ---
        const urlToPlay = getPlayableUrl(originalChannelUrl);
        // 如果 getPlayableUrl 返回 null
        if (!urlToPlay) {
            setStatus({ message: `无法处理此频道 URL: ${originalChannelUrl}`, type: 'error' });
            return; // 停止执行
        }
        console.log(`播放器将要加载的源: ${urlToPlay}`);
        // --- 结束核心改动 ---


        // 3. 根据浏览器支持情况，选择用 HLS.js 还是原生方式播放
        if (hlsRef.current) {
            // 如果 HLS.js 实例存在 (表示浏览器支持 HLS.js)
            console.log(`使用 HLS.js 加载: ${urlToPlay}`);
            // 确保 video 元素已附加到 HLS 实例 (通常在初始化时已做，但再调用一次也无妨)
            hlsRef.current.attachMedia(videoRef.current);
            // 调用 loadSource 方法加载新的视频流 URL (可能是原始的或代理的)
            hlsRef.current.loadSource(urlToPlay);
            // HLS.js 会自动处理后续的下载和播放。播放通常在 MANIFEST_PARSED 事件后触发。
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            // 如果浏览器原生支持 HLS (如 Safari)
            console.log(`使用原生 HLS 加载: ${urlToPlay}`);
            // 直接设置 <video> 标签的 src 属性为要播放的 URL (可能是原始的或代理的)
            videoRef.current.src = urlToPlay;
            // 对于原生 HLS，需要手动调用 load() 和 play()
            videoRef.current.load(); // 告诉 video 元素去加载新的 src
            videoRef.current.play().catch(e => { // 尝试播放
                console.error("原生 HLS 自动播放失败:", e);
                // 提示用户需要手动点击播放
                setStatus({ message: "播放器已加载，请点击播放按钮。", type: 'info' });
            });
        } else {
            // 如果两种方式都不支持
            setStatus({ message: "无法播放：您的浏览器不支持 HLS 视频格式。", type: 'error' });
        }
   };


  // --- JSX 渲染 ---
  // 这部分代码定义了页面的结构和内容，它会根据上面的状态 (State) 来显示不同的东西
  // 这部分结构和你原来基本一致，主要是确保点击事件调用的是更新后的函数
  return (
    // 使用 React Fragment (<> </>) 避免在最外层产生多余的 div
    <>
      <h2>M3U 播放器</h2>

      {/* 左侧边栏区域 */}
      <div id="sidebar">

        {/* 添加订阅区域 */}
        <div id="addSubscriptionArea">
          <h3>添加订阅</h3>
          <input
            type="url" // 输入类型为 URL
            id="subUrlInput" // CSS ID
            placeholder="输入 M3U/M3U8 订阅 URL" // 输入提示
            value={subUrlInput} // 输入框的值绑定到 state
            onChange={(e) => setSubUrlInput(e.target.value)} // 输入变化时更新 state
            disabled={isAdding} // 如果正在添加，禁用输入框
            required // HTML5 表单验证，需要输入
          />
          <button
            id="addSubscriptionBtn" // CSS ID
            onClick={handleAddSubscription} // 点击时调用添加函数
            disabled={isAdding} // 如果正在添加，禁用按钮
          >
            {isAdding ? '添加中...' : '添加'} {/* 根据状态显示不同文本 */}
          </button>
        </div>

        {/* 我的订阅列表区域 */}
        <div id="subscriptionArea">
          <h3>我的订阅</h3>
          <ul id="subscriptionList"> {/* CSS ID */}
            {/* 条件渲染：如果订阅列表为空，且不在加载状态，显示提示 */}
            {subscriptions.length === 0 && status.type !== 'loading' && !status.message.includes("订阅列表") && (
              <li>还没有添加订阅</li>
            )}
            {/* 条件渲染：如果正在加载订阅列表，显示加载提示 */}
            {status.type === 'loading' && status.message.includes("订阅列表") && (
                 <li>加载中...</li>
             )}
             {/* 遍历订阅列表，为每个订阅创建一个列表项 */}
            {subscriptions.map((sub) => (
              <li
                key={sub.id} // React 需要唯一的 key 来高效更新列表
                // className 用于 CSS 样式，如果当前项是选中的，添加 'selected' 类
                className={selectedSubscriptionUrl === sub.url ? 'selected' : ''}
                // 点击列表项时，调用 fetchAndParseM3u 函数，传入该订阅的原始 URL
                onClick={() => fetchAndParseM3u(sub.url)}
                title={sub.url} // 鼠标悬停时显示完整的 URL
              >
                {/* 显示订阅名称 (通常是 URL 的最后一部分) */}
                <span>{sub.url.substring(sub.url.lastIndexOf('/') + 1) || sub.url}</span>
                {/* 删除按钮 */}
                <button
                  // 点击删除按钮时，调用 handleDeleteSubscription
                  // e.stopPropagation() 阻止点击事件继续冒泡到父元素 li 上，防止触发 li 的 onClick
                  onClick={(e) => { e.stopPropagation(); handleDeleteSubscription(sub.id, sub.url); }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 频道列表区域 */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList"> {/* CSS ID */}
             {/* 条件渲染：各种提示信息 */}
            {!selectedSubscriptionUrl && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>请先选择一个订阅</li>
            )}
             {selectedSubscriptionUrl && channels.length === 0 && status.type !== 'loading' && !status.message.includes("频道列表") && (
                 <li>此订阅没有可用频道或解析失败</li>
             )}
             {status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载频道中...</li>
             )}
             {/* 遍历频道列表，为每个频道创建一个列表项 */}
            {channels.map((channel, index) => ( // 添加 index 以防 url+name 不唯一
              <li
                // 尝试生成更唯一的 key，结合 URL, name 和索引
                key={`${channel.url || 'no_url'}-${channel.name || 'no_name'}-${index}`}
                // 如果当前频道是选中的，添加 'selected' 类
                className={selectedChannelUrl === channel.url ? 'selected' : ''}
                // 点击列表项时，调用 loadVideoStream 函数，传入该频道的原始 URL
                onClick={() => loadVideoStream(channel.url)}
                // 鼠标悬停时显示频道名称和 URL
                title={`${channel.name || '未知频道'}\n${channel.url || '无URL'}`}
              >
                 {/* 可选：显示频道 Logo (如果 M3U 中提供了) */}
                 {channel.logo && (
                     <img
                         // 注意：Logo 的 URL 可能也需要代理！这里简化处理，暂不代理 Logo
                         src={channel.logo}
                         alt="" // Logo 通常是装饰性的，alt 可以为空
                         style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle' }}
                         // 如果 Logo 图片加载失败，就隐藏它
                         onError={(e) => { e.target.style.display = 'none'; }}
                     />
                 )}
                 {/* 显示频道名称，用 span 包裹并设置 CSS 来处理长文本溢出显示省略号 */}
                 <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {/* 如果有分组信息，显示在前面 */}
                    {channel.group ? `[${channel.group}] ` : ''}
                    {/* 显示频道名称，如果没有名称则显示“未知频道” */}
                    {channel.name || '未知频道'}
                 </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 状态显示区域 */}
        <div id="status" className={status.type}> {/* CSS ID，并将状态类型作为类名应用 */}
          {status.message} {/* 显示状态消息 */}
        </div>

      </div> {/* 左侧边栏结束 */}


      {/* 右侧主内容区域 */}
      <div id="main">
        {/* 视频播放区域 */}
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer"> {/* CSS ID, 用于控制 video 元素的容器 */}
            {/* HTML5 video 播放器标签 */}
            <video
              ref={videoRef} // 将 ref 关联到这个 video 元素
              id="videoPlayer" // CSS ID
              controls // 显示浏览器自带的播放控件 (播放/暂停, 音量, 全屏等)
              playsInline // 在 iOS Safari 上，视频会在当前位置播放，而不是强制全屏
              style={{backgroundColor: '#000', width: '100%', height: '100%'}} // 让 video 元素填满其容器，背景设为黑色
            ></video>
          </div>
        </div>
      </div> {/* 右侧主内容结束 */}

    </> // React Fragment 结束
  );
}

// 导出 App 组件，以便在 main.jsx 中使用
export default App;
