// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
// 你可以将各部分拆分成子组件，但要确保它们最终渲染出带有正确 ID 的元素
// 例如: import AddSubscription from './AddSubscription'; // 这个组件需要渲染 <div id="addSubscriptionArea">...</div>

function App() {
  // --- State (你需要根据功能填充) ---
  const [subscriptions, setSubscriptions] = useState([]); // Example: [{id: '1', url: 'http://example.com/list.m3u'}]
  const [channels, setChannels] = useState([]); // Example: [{name: 'Channel 1', url: 'http://.../stream.m3u8', group: 'News', logo: '...'}]
  const [status, setStatus] = useState({ message: "请先添加或选择一个订阅", type: 'info' }); // type: 'info', 'success', 'error', 'loading', 'warning'
  const [subUrlInput, setSubUrlInput] = useState('');
  const [selectedSubscriptionUrl, setSelectedSubscriptionUrl] = useState(null);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(null);
  const [isAdding, setIsAdding] = useState(false); // For button disable state

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'; // Use env var


  // --- Effects and Functions (你需要实现这些逻辑) ---

  // Effect to setup HLS.js (simplified)
  useEffect(() => {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log("HLS.js is supported. Initializing...");
      const hls = new Hls();
      hls.attachMedia(videoRef.current);
      hlsRef.current = hls;
      // Add HLS event listeners here (error, manifest parsed, etc.) similar to vanilla JS
      hls.on(Hls.Events.ERROR, (event, data) => {
         console.error('HLS Error:', event, data);
         setStatus({ message: `播放错误: ${data.details || data.type}`, type: 'error'});
         // Add more detailed error handling if needed
      });
       hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log("Manifest parsed.");
            setStatus({ message: "准备播放...", type: 'loading' });
            videoRef.current?.play().catch(e => {
                console.error("Autoplay failed:", e);
                setStatus({ message: "播放器已加载，请手动点击播放按钮", type: 'info' });
            });
        });
        // ... other event listeners
    } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        console.log("Using native HLS support.");
        // Add native event listeners if needed
    } else {
        console.error("HLS not supported");
        setStatus({ message: "此浏览器不支持 HLS 播放。", type: 'error' });
    }

    // Cleanup on unmount
    return () => {
        hlsRef.current?.destroy();
    };
  }, []); // Runs once on mount

  // Effect to load subscriptions on mount
  useEffect(() => {
    const fetchSubs = async () => {
        setStatus({ message: "正在加载订阅列表...", type: 'loading'});
        try {
            const response = await fetch(`${apiBaseUrl}/subscriptions`);
            if (!response.ok) throw new Error(`获取订阅失败: ${response.status}`);
            const data = await response.json();
            setSubscriptions(data || []);
            setStatus({ message: data?.length ? "订阅列表加载成功。请选择一个订阅。" : "还没有添加任何订阅。", type: 'info' });
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            setStatus({ message: `加载订阅列表出错: ${error.message}`, type: 'error'});
            setSubscriptions([]); // Clear list on error
        }
    };
    fetchSubs();
  }, [apiBaseUrl]); // Re-run if apiBaseUrl changes (unlikely but good practice)

  // Function to handle adding subscription
  const handleAddSubscription = async () => {
    if (!subUrlInput || !subUrlInput.startsWith('http')) {
        setStatus({ message: "请输入有效的 M3U/M3U8 URL。", type: 'error'});
        return;
    }
    setIsAdding(true);
    setStatus({ message: "正在添加订阅...", type: 'loading'});
    try {
        const response = await fetch(`${apiBaseUrl}/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: subUrlInput }),
        });
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(`添加失败: ${response.status} ${errorData.error || ''}`);
        }
        const newSubscription = await response.json();
        setSubscriptions(prevSubs => [...prevSubs, newSubscription]); // Add to list
        setStatus({ message: `订阅 "${newSubscription.url.split('/').pop()}" 添加成功!`, type: 'success'});
        setSubUrlInput(''); // Clear input
    } catch (error) {
        console.error('Error adding subscription:', error);
        setStatus({ message: `添加订阅出错: ${error.message}`, type: 'error'});
    } finally {
        setIsAdding(false);
    }
  };

  // Function to handle deleting subscription
  const handleDeleteSubscription = async (id, url) => {
      if (!id || !confirm(`确定要删除订阅 "${url.split('/').pop() || url}" 吗？`)) return;
      setStatus({ message: `正在删除订阅 ${id}...`, type: 'loading'});
      try {
          const response = await fetch(`${apiBaseUrl}/subscriptions/${id}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 204) { // Allow 204 No Content
               const errorData = await response.json().catch(() => ({}));
               throw new Error(`删除失败: ${response.status} ${errorData.error || ''}`);
          }
          setStatus({ message: `订阅 ${id} 已删除。`, type: 'success'});
          setSubscriptions(prevSubs => prevSubs.filter(sub => sub.id !== id)); // Remove from list
          if (selectedSubscriptionUrl === url) { // If deleted selected sub
              setSelectedSubscriptionUrl(null);
              setChannels([]);
              setSelectedChannelUrl(null);
              // Stop video
              videoRef.current?.pause();
              if (hlsRef.current) hlsRef.current.stopLoad();
              videoRef.current.src = '';
          }
      } catch (error) {
           console.error(`Error deleting subscription ${id}:`, error);
           setStatus({ message: `删除订阅出错: ${error.message}`, type: 'error'});
      }
  };


  // Function to fetch and parse M3U (Needs implementation - CORS issues possible!)
   const fetchAndParseM3u = async (m3uUrl) => {
       if (!m3uUrl) return;
       setSelectedSubscriptionUrl(m3uUrl); // Mark as selected
       const subName = m3uUrl.split('/').pop();
       setStatus({ message: `正在加载 "${subName}" 的频道列表...`, type: 'loading'});
       setChannels([]); // Clear previous channels
       setSelectedChannelUrl(null); // Clear selected channel
       // Stop video
       videoRef.current?.pause();
       if (hlsRef.current) hlsRef.current.stopLoad();
       videoRef.current.src = '';

       try {
            console.log(`Fetching M3U content directly from: ${m3uUrl}`);
            // !!! THIS IS THE DIRECT BROWSER FETCH - MIGHT FAIL DUE TO CORS !!!
            const response = await fetch(m3uUrl, { mode: 'cors' });
            if (!response.ok) {
                 // Specific CORS error check
                 if (response.status === 0 || response.type === 'opaque') {
                    throw new Error(`网络或 CORS 错误。服务器 (${new URL(m3uUrl).hostname}) 可能需要设置 Access-Control-Allow-Origin 头。`);
                 }
                 throw new Error(`获取 M3U 文件失败: ${response.status}`);
            }
            const m3uText = await response.text();

            // --- Basic M3U Parser (Adapt from vanilla JS version) ---
            const parsedChannels = [];
            const lines = m3uText.split('\n');
            let currentChannelInfo = null;
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('#EXTINF:')) {
                    currentChannelInfo = { name: '', url: '', logo: '', group: '' };
                    const commaIndex = trimmedLine.indexOf(',');
                    if (commaIndex !== -1) {
                        currentChannelInfo.name = trimmedLine.substring(commaIndex + 1);
                        // Add simple attribute parsing if needed (tvg-logo, group-title)
                        const attributesPart = trimmedLine.substring(8, commaIndex);
                        const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
                         if (logoMatch) currentChannelInfo.logo = logoMatch[1];
                         const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
                         if (groupMatch) currentChannelInfo.group = groupMatch[1];
                    }
                } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
                    // Basic URL check
                    if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
                        currentChannelInfo.url = trimmedLine;
                        parsedChannels.push(currentChannelInfo);
                    }
                    currentChannelInfo = null;
                }
            }
            setChannels(parsedChannels);
            setStatus({ message: `"${subName}" 的频道列表加载成功。`, type: parsedChannels.length > 0 ? 'info' : 'warning' });

       } catch (error) {
            console.error('Error fetching or parsing M3U:', error);
            setStatus({ message: `加载频道列表出错: ${error.message}`, type: 'error'});
            setChannels([]); // Ensure channels are empty on error
       }
   };

   // Function to load video stream
   const loadVideoStream = (channelUrl) => {
        if (!channelUrl) return;
        setSelectedChannelUrl(channelUrl); // Mark as selected
        setStatus({ message: `正在加载频道...`, type: 'loading' });

        // Stop previous playback cleanly
        videoRef.current?.pause();
        videoRef.current.removeAttribute('src'); // For native HLS

        if (hlsRef.current) {
            hlsRef.current.stopLoad(); // Stop previous load
            // Sometimes detaching/reattaching helps clear state
            // hlsRef.current.detachMedia();
            // hlsRef.current.attachMedia(videoRef.current);
            console.log(`HLS.js loading source: ${channelUrl}`);
            hlsRef.current.loadSource(channelUrl);
             hlsRef.current.attachMedia(videoRef.current); // Ensure attached
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            console.log(`Native HLS loading source: ${channelUrl}`);
            videoRef.current.src = channelUrl;
            videoRef.current.load(); // Important for native HLS
             videoRef.current.play().catch(e => console.error("Autoplay failed:", e)); // Try to play
        } else {
            setStatus({ message: "无法播放：不支持 HLS", type: 'error' });
        }
   };


  // --- JSX Rendering ---
  // This structure MUST match the IDs used in index.css
  return (
    <> {/* Use Fragment to avoid extra div affecting flex layout */}
      <h2>M3U 播放器</h2>

      {/* Sidebar Section */}
      <div id="sidebar">

        {/* Add Subscription Area */}
        <div id="addSubscriptionArea">
          <h3>添加订阅</h3>
          <input
            type="url"
            id="subUrlInput" // CRITICAL: Match ID from CSS
            placeholder="输入 M3U/M3U8 订阅 URL"
            value={subUrlInput}
            onChange={(e) => setSubUrlInput(e.target.value)}
            disabled={isAdding}
            required
          />
          <button
            id="addSubscriptionBtn" // CRITICAL: Match ID from CSS
            onClick={handleAddSubscription}
            disabled={isAdding}
          >
            {isAdding ? '添加中...' : '添加'}
          </button>
        </div>

        {/* Subscription List Area */}
        <div id="subscriptionArea">
          <h3>我的订阅</h3>
          <ul id="subscriptionList"> {/* CRITICAL: Match ID from CSS */}
            {subscriptions.length === 0 && !status.type.includes('loading') && (
              <li>还没有添加订阅</li>
            )}
            {subscriptions.map((sub) => (
              <li
                key={sub.id}
                data-url={sub.url} // Store url for selection
                className={selectedSubscriptionUrl === sub.url ? 'selected' : ''} // Apply 'selected' class
                onClick={() => fetchAndParseM3u(sub.url)}
                title={sub.url}
              >
                {/* Wrap text in span for better flex control with button */}
                <span>{sub.url.substring(sub.url.lastIndexOf('/') + 1) || sub.url}</span>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteSubscription(sub.id, sub.url); }}>
                  删除
                </button>
              </li>
            ))}
             {status.type === 'loading' && status.message.includes("订阅列表") && (
                 <li>加载中...</li>
             )}
          </ul>
        </div>

        {/* Channel List Area */}
        <div id="channelArea">
          <h3>频道列表</h3>
          <ul id="channelList"> {/* CRITICAL: Match ID from CSS */}
            {!selectedSubscriptionUrl && status.type !== 'loading' && (
                 <li>请先选择一个订阅</li>
            )}
             {selectedSubscriptionUrl && channels.length === 0 && !status.type.includes('loading') && (
                 <li>此订阅没有频道或解析失败</li>
             )}
             {status.type === 'loading' && status.message.includes("频道列表") && (
                 <li>加载中...</li>
             )}
            {channels.map((channel) => (
              <li
                key={channel.url + channel.name} // Use a more unique key if possible
                data-url={channel.url} // Store url for selection
                className={selectedChannelUrl === channel.url ? 'selected' : ''} // Apply 'selected' class
                onClick={() => loadVideoStream(channel.url)}
                title={`${channel.name}\nURL: ${channel.url}`}
              >
                 {/* Optional: Add Logo */}
                 {channel.logo && (
                     <img
                         src={channel.logo}
                         alt="" // Decorative, leave alt empty or provide meaningful text
                         style={{ width: '20px', height: 'auto', marginRight: '8px', verticalAlign: 'middle' }}
                         onError={(e) => { e.target.style.display = 'none'; }} // Hide on error
                     />
                 )}
                 {/* Wrap text in span for ellipsis */}
                 <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {channel.group ? `[${channel.group}] ` : ''}{channel.name || '未知频道'}
                 </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Status Area */}
        <div id="status" className={status.type}> {/* CRITICAL: Match ID and apply status type as class */}
          {status.message}
        </div>

      </div> {/* End Sidebar */}


      {/* Main Content Section */}
      <div id="main">
        <div id="videoArea">
          <h3>播放器</h3>
          <div id="videoContainer"> {/* CRITICAL: Match ID from CSS */}
            <video
              ref={videoRef}
              id="videoPlayer" // CRITICAL: Match ID from CSS
              controls
              playsInline /* Important for mobile */
              style={{backgroundColor: '#000'}} // Ensure black background
            ></video>
          </div>
        </div>
      </div> {/* End Main */}

    </>
  );
}

export default App;

