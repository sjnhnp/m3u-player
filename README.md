##### 2025.05.04.18.07
- 浏览器记住：上次播放频道列表+订阅源、自定义订阅源、主题选择
- 主题：去除了自动，只保留手动选择白天和黑夜
- 重写了index.css
- 双栏布局，
  - 双栏高度一致。
  - 左边sidebar滚动条不影响右边播放器（垂直居中）
  - sidebar桌面顺序：频道列表、通知栏、订阅列表、自定义添加订阅
  - 移动端顺序：播放器、频道列表、通知栏、订阅列表、自定义添加订阅
- 两个版本：
  - 完全部署在cloudflare pages+ cf workers（后端）
  - cloudflare pages+vps作为后端，见[分支vps](https://github.com/sjnhnp/m3u-player/blob/vps)

##### 部署方法
1、前端 cf pages+ 后端 cf workers
- 新建cf workers，然后把后端worker/m3u-worker.js的代码全部复制粘贴，发布即可。拿到后端地址
- 新建cloudflare pages，连接github fork了的这个项目，
  - building configuration
    - Framework preset：none
    - Build command：npm ci && npm run build
    - Build output directory：frontend/dist
  - 环境变量 Variables and Secrets
    - type：text
    - Variable name：VITE_API_BASE_URL
    - Value：填入cf workers的后端地址+'+api', 比如拿到的后端地址是 https://yours.workers.dev，那么这里就需要填入https://yours.workers.dev/api


2、前端cf pages+后端 vps docker方式
- pages 的VITE_API_BASE_URL 需要修改成，vps的反代地址+'/api'。
- vps 需要的文件范例，都在分支/vps

3、修改/添加订阅连接固定 
- 打开 worker/m3u-worker.js，在 `const fixedSubscriptions = [ `，添加如下格式 m3u8订阅地址
```
    {
      name: " ",
      url: ""
    },
```
