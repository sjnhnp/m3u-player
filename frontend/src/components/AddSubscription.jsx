// frontend/src/components/AddSubscription.jsx
import React, { useState } from 'react';

// 修改 props，现在接收一个包含 name 和 url 的对象
const AddSubscription = ({ addSubscription }) => {
  const [name, setName] = useState(''); // 新增 name state
  const [url, setUrl] = useState('');
  // 底部通知条用的两条 state 
  const [statusMsg,  setStatusMsg]  = useState('');
  const [statusType, setStatusType] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl  = url.trim();

    /* --- 简单校验 --- */
    if (trimmedName === '') {
      setStatusMsg('请输入订阅名称');
      setStatusType('error');
      return;
    }
    if (
      trimmedUrl === '' ||
      !(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))
    ) {
      setStatusMsg('请输入有效的 M3U/M3U8 地址（以 http:// 或 https:// 开头）');
      setStatusType('error');
      return;
    }

    /* --- 真正提交 --- */
    addSubscription({ name: trimmedName, url: trimmedUrl });

    /* 成功提示 */
    setStatusMsg('订阅已添加！');
    setStatusType('success');

    /* 清空输入框 */
    setName('');
    setUrl('');
  };

  return (
    <>
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* 新增 Name 输入框 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="输入订阅名称"
        required
        onInvalid={(e) => e.target.setCustomValidity('请输入订阅名称')}
        onInput ={(e) => e.target.setCustomValidity('')}
        style={styles.inputName} // 可以用新的样式或复用 input 样式
      />
      <input
        type="url" // 改为 url 类型，浏览器可能提供基础验证
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入 m3u 订阅链接"
        required
        onInvalid={(e) =>
          e.target.setCustomValidity(
            '请输入有效的 M3U/M3U8 地址（必须以 http:// 或 https:// 开头）'
          )
        }
        onInput ={(e) => e.target.setCustomValidity('')}
        style={styles.inputUrl} // 可以用新的样式或复用 input 样式
      />
      <button type="submit" style={styles.button}>
        添加
      </button>
    </form>
      {statusMsg && (
        <div id="status" className={statusType}>
          {statusMsg}
        </div>
      )}
    </>
  );
};

const styles = {
  form: {
    display: 'flex',
    flexWrap: 'wrap', // 允许换行
    marginBottom: '20px',
    gap: '10px', // 添加间隙
  },
  inputName: { // 样式可以根据需要调整
    flex: '1 1 150px', // 允许收缩和增长，基础宽度 150px
    padding: '10px',
    fontSize: '16px',
    minWidth: '120px', // 最小宽度
  },
  inputUrl: { // 样式可以根据需要调整
    flex: '2 1 250px', // 占比更大，基础宽度 250px
    padding: '10px',
    fontSize: '16px',
    minWidth: '200px', // 最小宽度
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    flexBasis: '100%', // 在 flex 换行时占满整行，或者设置固定宽度
    '@media (min-width: 600px)': { // 在较宽屏幕上不占满整行
       flexBasis: 'auto',
    }
  },
};

export default AddSubscription;
