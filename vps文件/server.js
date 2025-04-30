// m3u-proxy-node/server.js

// --- 使用 ES Modules (import) 语法 ---
import express from 'express';
import cors from 'cors';
// AbortController 是 Node.js v15+ 内建的, 无需额外导入 'node-abort-controller'
import { URL } from 'url';
import fs from 'fs/promises'; // 使用 fs 的 Promise 版本
import path from 'path';     // 用于处理文件路径
import { fileURLToPath } from 'url'; // 用于获取当前文件的路径 (ESM 标准方式)
import crypto from 'crypto'; // 用于生成唯一 ID

// --- 基本设置 ---
const app = express(); // 创建 Express 应用实例 (只需一次)
const port = 3000;     // 定义服务监听的端口

// --- 获取当前文件和目录路径 (ESM 标准方式) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data'); // 数据文件夹路径
const subscriptionsFilePath = path.join(dataDir, 'subscriptions.json'); // 订阅数据文件路径

// --- CORS (跨域资源共享) 配置 ---
// 定义允许访问你的 API 的前端域名列表
const allowedOrigins = [
    'https://m3pages.dev', // 你的 Cloudflare Pages 前端
    'https:/' // 你的 VPS 域名 (如果前端也部署在这里)
    // 如果有其他域名需要访问，也加到这里
];

// 配置 cors 中间件
app.use(cors({
    origin: function (origin, callback) {
        // 1. 允许来自 allowedOrigins 列表中的请求
        // 2. 允许非浏览器发出的请求 (例如 curl, Postman), 这些请求的 origin 是 undefined
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true); // 允许该源
        } else {
            // 如果 origin 不在允许列表中，则拒绝
            console.warn(`CORS blocked origin: ${origin}`); // 在服务器日志中记录被阻止的源
            callback(new Error(`Not allowed by CORS: Origin '${origin}' is not in the allowed list.`)); // 拒绝该源
        }
    },
    methods: "GET, POST, DELETE, OPTIONS", // 明确允许的 HTTP 方法
    allowedHeaders: "Content-Type, Range", // 允许前端发送的请求头 (例如 POST 时的 Content-Type)
    exposedHeaders: "Content-Length, Content-Range", // 允许前端 JS 访问的响应头 (例如代理 Range 请求时需要)
    optionsSuccessStatus: 200 // 对于 OPTIONS 预检请求，返回 200 状态码 (兼容一些旧浏览器)
}));

// --- 中间件 ---
// 使用 Express 内建的 JSON 解析中间件来处理 POST 请求的 JSON body
// **重要**: 必须放在需要读取 req.body 的 API 路由之前
app.use(express.json());

// --- API 路由 ---

// === 订阅管理 API (/api/subscriptions) ===

// GET /api/subscriptions - 获取所有订阅列表
app.get('/api/subscriptions', async (req, res) => {
    console.log("Received GET /api/subscriptions request");
    try {
        const data = await fs.readFile(subscriptionsFilePath, 'utf-8');
        const subscriptions = JSON.parse(data);
        console.log(`Returning ${subscriptions.length} subscriptions.`);
        res.status(200).json(subscriptions);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // 如果文件不存在 (例如首次运行)，返回空数组是正常的
            console.log("Subscriptions file not found, returning empty list.");
            res.status(200).json([]);
        } else {
            // 其他读取或解析错误
            console.error("Error reading subscriptions file:", error);
            res.status(500).send('Failed to list subscriptions');
        }
    }
});

// POST /api/subscriptions - 添加一个新的订阅
app.post('/api/subscriptions', async (req, res) => {
    console.log("Received POST /api/subscriptions request with body:", req.body);
    try {
        const body = req.body;
        const urlToAdd = body?.url; // 安全地获取请求体中的 url

        // 验证输入 URL
        if (!urlToAdd || typeof urlToAdd !== 'string' || !urlToAdd.startsWith('http')) {
            console.warn("Invalid URL received:", urlToAdd);
            return res.status(400).json({ error: 'Invalid or missing URL in request body. Must be a valid HTTP/HTTPS URL.' });
        }

        let subscriptions = [];
        try {
            // 尝试读取现有订阅列表
            const data = await fs.readFile(subscriptionsFilePath, 'utf-8');
            subscriptions = JSON.parse(data);
        } catch (error) {
            // 如果文件不存在，忽略错误，表示这是第一个条目
            if (error.code !== 'ENOENT') {
                throw error; // 其他读取错误则正常抛出
            }
            console.log("Subscriptions file not found, will create a new one.");
        }

        // 检查 URL 是否已存在 (避免重复添加)
        if (subscriptions.some(sub => sub.url === urlToAdd)) {
             console.warn(`Subscription URL already exists: ${urlToAdd}`);
             return res.status(409).json({ error: 'Subscription URL already exists.' }); // 409 Conflict
        }

        // 生成唯一的 ID
        const id = crypto.randomUUID();
        const newSubscription = { id: id, url: urlToAdd };
        subscriptions.push(newSubscription); // 添加到数组

        // 确保 data 目录存在
        await fs.mkdir(dataDir, { recursive: true });
        // 将更新后的数组写回 JSON 文件 (使用 null, 2 进行格式化，方便人工阅读)
        await fs.writeFile(subscriptionsFilePath, JSON.stringify(subscriptions, null, 2), 'utf-8');
        console.log("Successfully added subscription:", newSubscription);

        // 返回 201 Created 状态码和新添加的订阅对象
        res.status(201).json(newSubscription);
    } catch (error) {
        console.error("Error adding subscription:", error);
        // 如果是请求体 JSON 格式错误
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            return res.status(400).json({ error: 'Invalid JSON format in request body.' });
        }
        // 其他服务器内部错误
        res.status(500).send('Failed to add subscription');
    }
});

// DELETE /api/subscriptions/:id - 删除一个指定 ID 的订阅
app.delete('/api/subscriptions/:id', async (req, res) => {
    const idToDelete = req.params.id; // 从 URL 路径参数中获取 ID
    console.log(`Received DELETE /api/subscriptions/${idToDelete} request`);

    try {
        if (!idToDelete) {
            console.warn("Missing subscription ID in DELETE request.");
            return res.status(400).send('Missing subscription ID in URL.');
        }

        let subscriptions = [];
        try {
            // 读取现有订阅列表
            const data = await fs.readFile(subscriptionsFilePath, 'utf-8');
            subscriptions = JSON.parse(data);
        } catch (error) {
            // 如果文件不存在，说明肯定没有这个 ID
            if (error.code === 'ENOENT') {
                console.warn(`Subscription file not found when trying to delete ID: ${idToDelete}`);
                return res.status(404).send('Subscription not found (Subscription list is empty).');
            }
            throw error; // 其他读取错误则抛出
        }

        const initialLength = subscriptions.length;
        // 使用 filter 创建一个不包含要删除 ID 的新数组
        subscriptions = subscriptions.filter(sub => sub.id !== idToDelete);

        // 检查数组长度是否变化，如果没有变化说明 ID 未找到
        if (subscriptions.length === initialLength) {
            console.warn(`Subscription ID not found for deletion: ${idToDelete}`);
            return res.status(404).send('Subscription not found with the specified ID.');
        }

        // 确保 data 目录存在 (虽然在这里不太可能不存在)
        await fs.mkdir(dataDir, { recursive: true });
        // 将更新后的数组写回文件
        await fs.writeFile(subscriptionsFilePath, JSON.stringify(subscriptions, null, 2), 'utf-8');
        console.log(`Successfully deleted subscription with ID: ${idToDelete}`);

        // 返回 204 No Content 表示成功删除，不需要响应体
        res.status(204).send();
    } catch (error) {
         console.error(`Error deleting subscription ${idToDelete}:`, error);
         res.status(500).send('Failed to delete subscription');
    }
});

// === M3U/TS 代理路由 (/api/proxy) ===
app.get('/api/proxy', async (req, res) => {
    const targetUrlEncoded = req.query.url; // 获取 URL 查询参数 `url` 的值

    // 检查 url 参数是否存在
    if (!targetUrlEncoded) {
        return res.status(400).send('Missing "url" query parameter');
    }

    let targetUrl;
    try {
        // 对 URL 参数进行解码
        targetUrl = decodeURIComponent(targetUrlEncoded);
        // 验证解码后的 URL 格式是否合法 (必须是 http 或 https 开头)
        const parsedUrl = new URL(targetUrl); // new URL 会自动验证格式
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid protocol. Only HTTP and HTTPS URLs are allowed.');
        }
    } catch (e) {
        // 如果 URL 无效或解码失败
        console.error(`Invalid target URL received: ${targetUrlEncoded}`, e);
        return res.status(400).send(`Invalid or malformed "url" query parameter: ${e.message}`);
    }

    // --- 设置 fetch 请求超时 ---
    const FETCH_TIMEOUT_MS = 20000; // 设置超时时间为 20 秒
    const controller = new AbortController(); // 创建 AbortController 用于中止请求
    const timeoutId = setTimeout(() => {
        console.log(`Fetch timeout triggered for ${targetUrl} after ${FETCH_TIMEOUT_MS}ms`);
        controller.abort(); // 超时后调用 abort()
    }, FETCH_TIMEOUT_MS);

    try {
        console.log(`VPS proxying request for: ${targetUrl}`);

        // 准备要转发给目标服务器的请求头
        const proxyRequestHeaders = {};
        // 检查客户端是否发送了 Range 请求头 (用于视频分段加载)
        const rangeHeader = req.headers['range'];
        if (rangeHeader) {
            proxyRequestHeaders['Range'] = rangeHeader; // 将 Range 头传递给目标服务器
            console.log(`Passing Range header: ${rangeHeader}`);
        }
        // 可以模仿常见的浏览器 User-Agent
        proxyRequestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

        // --- 使用 fetch 向目标 URL 发起请求 ---
        const originResponse = await fetch(targetUrl, {
            method: req.method,        // 使用客户端请求的原始方法 (通常是 GET)
            headers: proxyRequestHeaders, // 传递处理后的请求头
            redirect: 'follow',       // 自动跟随重定向 (例如 HTTP 301/302)
            signal: controller.signal  // 关联 AbortController 以实现超时控制
        });

        // 如果 fetch 成功返回 (无论状态码如何)，清除超时定时器
        clearTimeout(timeoutId);

        // --- 处理从目标服务器收到的响应 ---

        // 检查目标服务器的响应状态码
        if (!originResponse.ok) { // ok 为 true 表示状态码在 200-299 范围内
            console.error(`Proxy target fetch failed for ${targetUrl} with status: ${originResponse.status} ${originResponse.statusText}`);
            // 将目标服务器的错误状态码和状态文本返回给客户端
            res.status(originResponse.status);
            // 尝试将目标服务器的错误响应体直接流式传输给客户端
            if (originResponse.body) {
                // Node.js v16.5+可以直接pipe ReadableStream
                // For older versions, need conversion or different handling
                 await pipeStream(originResponse.body, res);
            } else {
                // 如果没有响应体，发送状态文本
                res.send(originResponse.statusText);
            }
            return; // 结束处理
        }

        // --- 处理成功的响应 (状态码 2xx) ---
        // 获取原始响应的重要头信息
        const contentType = originResponse.headers.get('content-type');
        const contentLength = originResponse.headers.get('content-length');
        const contentRange = originResponse.headers.get('content-range'); // Range 请求的响应头

        // 将这些头信息设置到发送给客户端的响应中
        // 这对于浏览器正确解析内容类型和处理分段加载非常重要
        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);

        // 设置响应状态码与原始响应一致 (例如，Range 请求可能是 206 Partial Content)
        res.status(originResponse.status);

        // --- M3U8 内容重写逻辑 ---
        // 检查 Content-Type 是否表明是 M3U8 文件
        if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || contentType.includes('audio/mpegurl'))) {
            console.log(`Detected M3U8 content type for ${targetUrl}. Rewriting URLs inside.`);
            const m3uText = await originResponse.text(); // 读取 M3U8 文件内容为文本

            // 构建代理前缀 URL (例如 https://vlog2.foryou2024.com/api/proxy)
            // req.protocol 是 'http' 或 'https' (取决于 Nginx 配置和请求方式)
            // req.get('host') 是 Nginx 传递过来的 Host 头 (通常是你的域名)
            const proxyBaseUrl = `${req.protocol}://${req.get('host')}/api/proxy`;

            // 调用重写函数，处理 M3U8 内容中的 URL
            const rewrittenM3u = rewriteM3uUrls(m3uText, targetUrl, proxyBaseUrl);
            // 将重写后的 M3U8 文本发送给客户端
            res.send(rewrittenM3u);
        } else {
            // --- 非 M3U8 内容 (如 TS 视频片段, 图片, 其他文件) ---
            // 直接将原始服务器的响应体流式传输给客户端
            if (originResponse.body) {
                 console.log(`Streaming non-M3U8 content (${contentType || 'unknown type'}) for ${targetUrl}`);
                 await pipeStream(originResponse.body, res); // 使用辅助函数流式传输
            } else {
                // 如果响应成功但没有 body (例如 204 No Content)，结束响应
                res.end();
            }
        }

    } catch (error) {
        // 捕获 fetch 过程中的任何错误 (网络错误, DNS错误, 超时等)
        clearTimeout(timeoutId); // 确保清除超时定时器

        // 判断错误是否由 AbortController 中止引起 (即超时)
        if (error.name === 'AbortError') {
            console.error(`Proxy fetch aborted for ${targetUrl} due to timeout.`);
            // 返回 504 Gateway Timeout 表示源服务器超时
            res.status(504).send('Gateway Timeout: Origin server did not respond in time.');
        } else {
            // 其他 fetch 错误
            console.error(`Error during proxy request for ${targetUrl}:`, error);
            // 返回 502 Bad Gateway 表示代理在连接上游服务器时出错
            res.status(502).send(`Bad Gateway: Error fetching from origin server. ${error.message}`);
        }
    }
});

// --- 根路径路由 (可选, 用于快速检查服务是否运行) ---
app.get('/', (req, res) => {
  res.send('M3U Proxy Node Service is running!');
});

// --- 数据存储初始化函数 ---
// (在服务器启动前执行，确保数据目录和文件存在)
const initializeDataStore = async () => {
    try {
        // 确保 data 目录存在，如果不存在则创建 (recursive: true 类似 mkdir -p)
        await fs.mkdir(dataDir, { recursive: true });
        console.log(`Data directory ensured at: ${dataDir}`);
        // 尝试访问订阅文件，检查它是否存在且有效
        try {
            await fs.access(subscriptionsFilePath, fs.constants.F_OK); // 检查文件是否存在
            // 如果存在，尝试读取并解析，确保是有效的 JSON
            const data = await fs.readFile(subscriptionsFilePath, 'utf-8');
            JSON.parse(data);
            console.log(`Subscriptions data file found and valid at: ${subscriptionsFilePath}`);
        } catch (readError) {
            // 如果文件不存在 (ENOENT) 或无法访问
            if (readError.code === 'ENOENT') {
                console.log(`Subscriptions file not found, creating a new empty one at: ${subscriptionsFilePath}`);
                // 创建一个包含空数组 '[]' 的新文件
                await fs.writeFile(subscriptionsFilePath, JSON.stringify([]), 'utf-8');
            } else if (readError instanceof SyntaxError) {
                 // 如果文件存在但内容不是有效的 JSON
                 console.error(`Subscriptions file at ${subscriptionsFilePath} is corrupted (invalid JSON). Creating a new empty one.`);
                 await fs.writeFile(subscriptionsFilePath, JSON.stringify([]), 'utf-8'); // 覆盖为有效空文件
            }
            else {
                // 其他类型的读取或访问错误，则向上抛出
                throw readError;
            }
        }
    } catch (error) {
        // 初始化过程中发生任何无法处理的错误
        console.error('FATAL: Error initializing data store:', error);
        process.exit(1); // 严重错误，退出应用程序
    }
};

// --- M3U8 重写辅助函数 ---
function rewriteM3uUrls(m3uText, baseUrl, proxyPrefix) {
    const lines = m3uText.split('\n'); // 按行分割 M3U8 内容
    let base;
    try {
        // 使用原始 M3U8 的 URL (baseUrl) 作为解析相对路径的基础
        base = new URL(baseUrl);
    } catch (e) {
        console.error("Invalid base URL provided for M3U rewrite:", baseUrl);
        return m3uText; // 如果基础 URL 无效，无法进行重写，返回原始内容
    }

    // 遍历 M3U8 的每一行
    const rewrittenLines = lines.map(line => {
        const trimmedLine = line.trim(); // 去除行首尾的空格

        // 规则 1: 处理媒体片段 URL (非 # 开头且非空)
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            try {
                // 将行内容视为 URL，尝试相对于 baseUrl 解析它
                // new URL(relativePath, base) 会自动处理绝对和相对路径
                const segmentUrl = new URL(trimmedLine, base).toString();
                // 仅重写 http 或 https 协议的 URL
                if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
                    // 构建通过我们代理访问该片段的新 URL
                    // 需要对原始 segmentUrl 进行 URI 编码，作为 proxyPrefix 的查询参数
                    const proxiedUrl = `${proxyPrefix}?url=${encodeURIComponent(segmentUrl)}`;
                    return proxiedUrl; // 返回重写后的行
                }
                // 如果解析出的 URL 不是 http/https (例如 file:// 或 data:), 保持原样
                return line;
            } catch (e) {
                // 如果该行无法被解析为相对于 base 的有效 URL，保持原样
                // console.warn(`Could not parse segment URL: ${trimmedLine} relative to ${base}`, e);
                return line;
            }
        }
        // 规则 2: 处理加密密钥 URI (#EXT-X-KEY:...)
        else if (trimmedLine.startsWith('#EXT-X-KEY:')) {
            // 使用正则表达式查找 URI="<url>" 部分
            const uriMatch = trimmedLine.match(/URI="([^"]+)"/);
            if (uriMatch && uriMatch[1]) { // 如果找到了 URI 属性及其值
                const originalUri = uriMatch[1];
                try {
                    // 解析密钥的 URL (同样相对于 baseUrl)
                    const keyUrl = new URL(originalUri, base).toString();
                    // 仅重写 http 或 https 协议的密钥 URL
                    if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
                        // 构建通过代理访问密钥的新 URL
                        const proxiedKeyUrl = `${proxyPrefix}?url=${encodeURIComponent(keyUrl)}`;
                        // 将原始行中的 URI="..." 替换为包含代理 URL 的新 URI="..."
                        return trimmedLine.replace(uriMatch[0], `URI="${proxiedKeyUrl}"`);
                    }
                    // 如果密钥 URL 不是 http/https, 保持原样
                    return line;
                } catch (e) {
                    // 如果解析密钥 URI 失败，保持该行原样
                    // console.warn(`Could not parse key URI: ${originalUri} relative to ${base}`, e);
                    return line;
                }
            } else {
                // 如果 #EXT-X-KEY 行没有找到 URI 属性，保持原样
                return line;
            }
        }
        // 规则 3: 其他所有行 (注释行、空行、其他 #EXT 标签) 保持不变
        return line;
    });

    // 将处理后的各行用换行符重新组合成完整的 M3U8 文本
    return rewrittenLines.join('\n');
}

// --- 辅助函数：安全地 pipe ReadableStream 到 WritableStream ---
// (处理背压和错误)
async function pipeStream(readable, writable) {
  return new Promise((resolve, reject) => {
    readable.pipe(writable);
    readable.on('error', err => {
        console.error("Error in readable stream during pipe:", err);
        reject(err);
    });
    writable.on('error', err => {
        console.error("Error in writable stream during pipe:", err);
        reject(err);
    });
    writable.on('finish', () => {
        resolve();
    });
  });
}


// --- 启动服务器 ---
// **重要**: 先调用异步的初始化函数，确保成功后再启动服务器监听端口
initializeDataStore().then(() => {
    // 初始化成功后，启动 Express 服务器
    app.listen(port, () => {
        console.log(`------------------------------------------------------`);
        console.log(` M3U Proxy Node Service is running!`);
        console.log(` Listening on: http://localhost:${port}`);
        console.log(` Allowed Origins: ${allowedOrigins.join(', ')}`);
        console.log(` Subscriptions data file: ${subscriptionsFilePath}`);
        console.log(` API endpoints:`);
        console.log(`   - GET  /api/subscriptions`);
        console.log(`   - POST /api/subscriptions (Body: { "url": "..." })`);
        console.log(`   - DELETE /api/subscriptions/:id`);
        console.log(`   - GET  /api/proxy?url=<encoded_target_url>`);
        console.log(`------------------------------------------------------`);
    });
}).catch(err => {
     // 如果初始化过程中发生无法恢复的错误
     console.error("FATAL: Failed to initialize data store. Server cannot start.", err);
     process.exit(1); // 退出程序
});

// --- 文件末尾确保没有其他 app.listen() 调用 ---
