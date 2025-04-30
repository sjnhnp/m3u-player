import React, { useState, useEffect } from 'react';
import axios from 'axios';
// Hls.js import in Player.jsx is sufficient if only used there
// import Hls from 'hls.js';
import AddSubscription from './components/AddSubscription';
import SubscriptionList from './components/SubscriptionList';
import Player from './components/Player';
// import './index.css'; 

// 从 Vite 环境变量获取 API 基础 URL
// 在本地开发时会读取 .env 文件，在 Cloudflare Pages 会读取 Pages 的环境变量设置
// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'; // 提供备用 '/api'
//   const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
// const API_BASE_URL = 'https://m3u-worker.pigpig.workers.dev/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
console.log('API Base URL used:', API_BASE_URL); // 添加日志
if (!API_BASE_URL) {
     console.error("FATAL: VITE_API_BASE_URL is not defined during build!");
     // 可以在这里抛出错误或显示一个明显的错误消息给用户
}

const App = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  // const [apiBaseUrl, setApiBaseUrl] = useState(''); // 不再需要 state 来存储 base url

  useEffect(() => {
    // 组件挂载时获取现有订阅
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      console.log(`Fetching subscriptions from: ${API_BASE_URL}/subscriptions`); // Debug log
      const response = await axios.get(`${API_BASE_URL}/subscriptions`);
      setSubscriptions(response.data || []); // 确保是数组
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      // 可以在这里添加用户提示，例如使用 alert 或者 UI 消息
      // alert('加载订阅列表失败，请检查网络或服务端状态。');
      setSubscriptions([]); // 出错时清空列表
    }
  };

  const addSubscription = async (url) => {
    try {
      console.log(`Adding subscription: ${url} via ${API_BASE_URL}/subscriptions`); // Debug log
      // 发送 POST 请求到 worker
      const response = await axios.post(`${API_BASE_URL}/subscriptions`, { url });
      // Cloudflare Worker 返回的数据格式是 { id, url }
      if (response.data && response.data.id) {
         setSubscriptions([...subscriptions, response.data]);
      } else {
         console.error("Invalid response data from add subscription:", response.data);
         alert('添加订阅失败，服务端返回格式错误。');
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
      alert(`添加订阅失败: ${error.response?.data?.error || error.message}`);
    }
  };

  const removeSubscription = async (id) => {
    try {
      console.log(`Removing subscription: ${id} via ${API_BASE_URL}/subscriptions/${id}`); // Debug log
      await axios.delete(`${API_BASE_URL}/subscriptions/${id}`);
      setSubscriptions(subscriptions.filter(sub => sub.id !== id));
    } catch (error) {
      console.error('Error removing subscription:', error);
      alert(`删除订阅失败: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className="App">
      <h1>M3U 订阅播放器</h1>
      <AddSubscription addSubscription={addSubscription} />
      <SubscriptionList subscriptions={subscriptions} removeSubscription={removeSubscription} />
      {/* Player 现在直接从 subscriptions 获取第一个 URL */}
      <Player subscriptions={subscriptions} />
    </div>
  );
};

export default App;
