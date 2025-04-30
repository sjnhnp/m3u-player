import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

const Player = ({ subscriptions }) => {
  const videoRef = useRef(null);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    if (subscriptions.length > 0) {
      setCurrentUrl(subscriptions[0].url);
    } else {
      setCurrentUrl('');
    }
  }, [subscriptions]);

  useEffect(() => {
    if (currentUrl === '') return;

    const video = videoRef.current;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
      });
      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play();
      });
    }
  }, [currentUrl]);

  return (
    <div>
      <h2>播放器</h2>
      {currentUrl ? (
        <video
          ref={videoRef}
          controls
          width="600"
          height="400"
          autoPlay
          muted
          style={styles.video}
        ></video>
      ) : (
        <p>请添加一个 m3u 订阅链接以播放直播流。</p>
      )}
    </div>
  );
};

const styles = {
  video: {
    backgroundColor: '#000',
  },
};

export default Player;
