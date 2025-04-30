import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Hls from 'hls.js';
import AddSubscription from './components/AddSubscription';
import SubscriptionList from './components/SubscriptionList';
import Player from './components/Player';

const App = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  useEffect(() => {
    // 从环境变量获取 API 基础 URL
    const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8787/api';
    setApiBaseUrl(baseUrl);
    // 获取现有订阅
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const response = await axios.get(`${apiBaseUrl}/subscriptions`);
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    }
  };

  const addSubscription = async (url) => {
    try {
      const response = await axios.post(`${apiBaseUrl}/subscriptions`, { url });
      setSubscriptions([...subscriptions, response.data]);
    } catch (error) {
      console.error('Error adding subscription:', error);
      alert('添加订阅失败');
    }
  };

  const removeSubscription = async (id) => {
    try {
      await axios.delete(`${apiBaseUrl}/subscriptions/${id}`);
      setSubscriptions(subscriptions.filter(sub => sub.id !== id));
    } catch (error) {
      console.error('Error removing subscription:', error);
      alert('删除订阅失败');
    }
  };

  return (
    <div className="App">
      <h1>M3U 订阅播放器</h1>
      <AddSubscription addSubscription={addSubscription} />
      <SubscriptionList subscriptions={subscriptions} removeSubscription={removeSubscription} />
      <Player subscriptions={subscriptions} />
    </div>
  );
};

export default App;
