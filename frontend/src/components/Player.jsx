// frontend/src/components/Player.jsx
import React, { useEffect, useRef, useState } from 'react'; // <--- 添加 useState 到导入列表
import Hls from 'hls.js';

const Player = ({ subscriptions }) => {
  const videoRef = useRef(null);
  const [currentUrl, setCurrentUrl] = useState(''); // <--- 现在 useState 已经被定义

  useEffect(() => {
    if (subscriptions.length > 0 && subscriptions[0]?.url) { // 添加可选链以防万一
      setCurrentUrl(subscriptions[0].url);
    } else {
      setCurrentUrl('');
    }
  }, [subscriptions]);

  useEffect(() => {
    if (currentUrl === '' || !videoRef.current) return; // 添加 !videoRef.current 检查

    const video = videoRef.current;
    let hls = null; // 声明 hls 变量

    if (Hls.isSupported()) {
      hls = new Hls(); // 赋值给 hls
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.error("Error attempting to play video:", e)); // 添加播放错误捕获
      });
      // 可选：处理 HLS 错误
      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('fatal network error encountered, trying to recover', data);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('fatal media error encountered, trying to recover', data);
              hls.recoverMediaError();
              break;
            default:
              console.error('unrecoverable fatal error', data);
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentUrl;
      video.addEventListener('loadedmetadata', () => {
         video.play().catch(e => console.error("Error attempting to play video:", e)); // 添加播放错误捕获
      });
      // 注意：原生 HLS 可能没有简单的清理方法，但通常切换 src 即可
    }

    // 清理函数
    return () => {
      if (hls) { // 确保 hls 实例存在再销毁
        hls.destroy();
      }
      // 对于原生 HLS，可以考虑暂停和移除 src
      if (video && video.canPlayType('application/vnd.apple.mpegurl')) {
          video.pause();
          video.removeAttribute('src');
          video.load(); // 重置播放器状态
      }
    };
  }, [currentUrl]); // 依赖项保持不变

  return (
    <div>
      <h2>播放器</h2>
      {currentUrl ? (
        <video
          ref={videoRef}
          controls
          width="600"
          height="400"
          // autoPlay // 考虑移除自动播放，让用户控制或在 hls.on MANIFEST_PARSED 里触发
          muted // 静音可能需要，因为浏览器有时会阻止带声音的自动播放
          style={styles.video}
        ></video>
      ) : (
        <p>请添加一个 m3u 订阅链接或选择一个已有的链接来播放。</p> // 改进提示信息
      )}
    </div>
  );
};

const styles = {
  video: {
    backgroundColor: '#000',
    display: 'block', // 确保视频是块级元素
    margin: '10px auto', // 居中显示
  },
};

export default Player;
