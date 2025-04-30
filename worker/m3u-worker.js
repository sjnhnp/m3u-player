// worker/m3u-worker.js

/**
 * 环境变量:
 * - M3U_SUBSCRIPTIONS: KV Namespace 绑定，用于存储 M3U 订阅 URL。
 *   你需要在 Cloudflare Dashboard 的 Worker 设置中，或者在 wrangler.toml 中进行绑定。
 */

// 定义允许跨域访问的域名，为了方便测试可以先用 '*'，生产环境建议替换为你的前端域名
// 例如：const allowedOrigin = 'https://your-m3u-player.pages.dev';
const allowedOrigin = '*';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', // 可以根据需要添加其他头部，如 Authorization
  'Access-Control-Max-Age': '86400', // 预检请求结果缓存时间 (秒)
};

// 处理 CORS 预检请求 (OPTIONS)
function handleOptions(request) {
  // 确保请求头中有 Origin，这是 CORS 的要求
  if (request.headers.get('Origin') !== null &&
      request.headers.get('Access-Control-Request-Method') !== null &&
      request.headers.get('Access-Control-Request-Headers') !== null) {
    // 这是预检请求，直接返回 CORS 头
    return new Response(null, {
      headers: corsHeaders,
      status: 204 // No Content
    });
  } else {
    // 这不是有效的预检请求
    return new Response(null, {
      headers: {
        Allow: 'GET, POST, DELETE, OPTIONS',
      },
      status: 405 // Method Not Allowed (或者其他合适的错误)
    });
  }
}

// 主请求处理函数
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 检查 KV 绑定是否存在 (仅在第一次请求时检查，理论上部署时 Cloudflare 会保证)
  // 注意：在实际运行时，如果绑定不存在，下面的 KV 操作会直接抛出异常
  if (typeof M3U_SUBSCRIPTIONS === 'undefined') {
     console.error("FATAL: KV Namespace 'M3U_SUBSCRIPTIONS' is not bound to the worker!");
     return new Response('Server configuration error: KV Namespace not bound.', { status: 500 }); // 不添加 CORS 头，因为配置错误
  }


  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  // 处理 POST 请求：添加订阅
  if (request.method === 'POST' && pathname === '/api/subscriptions') {
    try {
      let subData;
      try {
          subData = await request.json();
      } catch (e) {
          console.error("Worker Error during POST /api/subscriptions: Failed to parse JSON body", e);
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders });
      }

      const subUrl = subData?.url; // 使用可选链操作符

      if (!subUrl || typeof subUrl !== 'string' || !subUrl.startsWith('http')) {
          console.warn("Worker Warning during POST /api/subscriptions: Invalid or missing URL in request body", subData);
          return new Response(JSON.stringify({ error: 'Invalid or missing subscription URL' }), { status: 400, headers: corsHeaders });
      }

      const id = Date.now().toString(); // 使用时间戳作为简单 ID

      console.log(`Worker attempting to PUT key: ${id}, value: ${subUrl}`);
      await M3U_SUBSCRIPTIONS.put(id, subUrl);
      console.log(`Worker successfully PUT key: ${id}`);

      const newSubscription = { id, url: subUrl };
      return new Response(JSON.stringify(newSubscription), {
        status: 201, // Created
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker Error during POST /api/subscriptions:', error);
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      return new Response(JSON.stringify({ error: 'Internal Server Error while adding subscription', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // 处理 GET 请求：获取所有订阅
  if (request.method === 'GET' && pathname === '/api/subscriptions') {
    try {
      console.log("Worker attempting to LIST keys from M3U_SUBSCRIPTIONS");
      // 注意：如果 KV Namespace 非常大， .list() 可能需要处理分页 (cursor)
      const listResult = await M3U_SUBSCRIPTIONS.list();
      console.log(`Worker successfully LISTED ${listResult.keys.length} keys.`);

      if (!listResult.keys || listResult.keys.length === 0) {
          return new Response(JSON.stringify([]), { // 返回空数组
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
      }

      // 并行获取所有 key 的 value
      const subscriptionsPromises = listResult.keys.map(async (key) => {
        const url = await M3U_SUBSCRIPTIONS.get(key.name);
        if (url === null) {
            // Key 存在但获取值为 null (理论上不应该在 list 后立即发生，除非被并发删除)
            console.warn(`Worker Warning: Key ${key.name} listed but GET returned null.`);
            return null;
        }
        return { id: key.name, url };
      });

      const subscriptions = (await Promise.all(subscriptionsPromises)).filter(sub => sub !== null); // 过滤掉可能为 null 的项

      console.log(`Worker successfully retrieved ${subscriptions.length} subscription details.`);

      return new Response(JSON.stringify(subscriptions), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker Error during GET /api/subscriptions:', error);
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      return new Response(JSON.stringify({ error: 'Internal Server Error while fetching subscriptions', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // 处理 DELETE 请求：删除订阅
  if (request.method === 'DELETE' && pathname.startsWith('/api/subscriptions/')) {
    const id = pathname.split('/').pop(); // 获取路径最后一部分作为 ID

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing subscription ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      console.log(`Worker attempting to DELETE key: ${id}`);
      await M3U_SUBSCRIPTIONS.delete(id);
      console.log(`Worker successfully DELETED key: ${id}`);

      return new Response(null, { // 成功删除，返回 204 No Content
        status: 204,
        headers: corsHeaders
      });

    } catch (error) {
      console.error(`Worker Error during DELETE /api/subscriptions/${id}:`, error);
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      return new Response(JSON.stringify({ error: 'Internal Server Error while deleting subscription', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // 如果没有匹配的路由，返回 404
  console.log(`Worker: Received unhandled request: ${request.method} ${pathname}`);
  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders // 即使 404 也添加 CORS 头，方便前端调试
  });
}

// 监听 fetch 事件
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
