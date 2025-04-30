import React from 'react';

const SubscriptionList = ({ subscriptions, removeSubscription }) => {
  if (subscriptions.length === 0) {
    return <p>暂无订阅</p>;
  }

  return (
    <div>
      <h2>订阅列表</h2>
      <ul style={styles.list}>
        {subscriptions.map((sub) => (
          <li key={sub.id} style={styles.listItem}>
            <a href={sub.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {sub.url}
            </a>
            <button onClick={() => removeSubscription(sub.id)} style={styles.button}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const styles = {
  list: {
    listStyleType: 'none',
    padding: 0,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
  },
  link: {
    flex: '1',
    textDecoration: 'none',
    color: '#007bff',
  },
  button: {
    padding: '5px 10px',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

export default SubscriptionList;
