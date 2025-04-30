import React, { useState } from 'react';

const AddSubscription = ({ addSubscription }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() === '') {
      alert('请输入有效的 URL');
      return;
    }
    addSubscription(url);
    setUrl('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
