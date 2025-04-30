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
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入 m3u 订阅链接"
        required
        style={styles.input}
      />
      <button type="submit" style={styles.button}>
        添加
      </button>
    </form>
  );
};

const styles = {
  form: {
    display: 'flex',
    marginBottom: '20px',
  },
  input: {
    flex: '1',
    padding: '10px',
    fontSize: '16px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    marginLeft: '10px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
  },
};

export default AddSubscription;
