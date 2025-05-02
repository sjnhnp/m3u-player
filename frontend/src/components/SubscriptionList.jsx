// frontend/src/components/SubscriptionList.jsx
import React from 'react';

// 更新 props
const SubscriptionList = ({
    subscriptions,      // 这是合并后的列表
    removeSubscription, // 删除用户订阅的函数
    selectSubscription, // 选择订阅加载频道的函数
    selectedSubscriptionUrl // 当前选中的订阅 URL，用于高亮
}) => {
  if (subscriptions.length === 0) {
    return <p>暂无订阅</p>;
  }

  return (
    <div>
      {/* 可以保留标题或移除 */}
      {/* <h2>订阅列表</h2> */}
      <ul style={styles.list} id="subscriptionList"> {/* 添加 ID 以匹配 CSS */}
        {subscriptions.map((sub) => (
          <li
            // 使用 URL 作为 key (假设 URL 在合并列表中是唯一的)
            // 如果不唯一，需要确保 fixed 和 user 都有唯一 id
            key={sub.url}
            style={styles.listItem}
            // 添加高亮样式
            className={selectedSubscriptionUrl === sub.url ? 'selected' : ''}
            // 点击列表项选择订阅
            onClick={() => selectSubscription(sub.url)}
            title={sub.url} // 鼠标悬停显示 URL
          >
            {/* 显示名称 */}
            <span style={styles.nameSpan}>
                {sub.name}
                {/* 如果是固定项，显示标记 */}
                {sub.isFixed && <span style={styles.fixedLabel}> (固定)</span>}
            </span>

            {/* 条件渲染删除按钮：只对非固定项显示 */}
            {!sub.isFixed && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // 阻止触发 li 的 onClick
                  removeSubscription(sub.id); // 使用 ID 删除用户订阅
                }}
                style={styles.deleteButton} // 使用特定样式
                title="删除此订阅"
              >
                删除
              </button>
            )}
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
    margin: 0, // 移除默认 margin
    maxHeight: '250px', /* 从 CSS 移入或保持 CSS 控制 */
    overflowY: 'auto',
    border: '1px solid #eee',
    borderRadius: '4px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between', // 让按钮靠右
    padding: '8px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #eee',
    whiteSpace: 'nowrap',
    overflow: 'hidden', // 隐藏溢出
    transition: 'background-color 0.2s ease',
  },
  listItemHover: { // CSS :hover 效果更好
    // backgroundColor: '#f0f0f0',
  },
  selectedItem: { // CSS .selected 效果更好
    // backgroundColor: '#d0e0ff',
    // fontWeight: 'bold',
  },
  nameSpan: { // 让名称部分占据主要空间
    flexGrow: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis', // 超长显示省略号
    marginRight: '10px', // 和按钮之间留点空隙
  },
  fixedLabel: { // 固定标签样式
      fontSize: '0.8em',
      color: 'grey',
      marginLeft: '5px',
  },
  deleteButton: { // 删除按钮样式 (可以复用之前的 button 样式)
    padding: '2px 5px',
    fontSize: '0.8em',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    flexShrink: 0, // 防止按钮被压缩
    transition: 'background-color 0.3s ease',
  },
   deleteButtonHover: { // CSS :hover
    // backgroundColor: '#c82333',
   }
};

export default SubscriptionList;

