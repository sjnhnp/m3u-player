// m3u-worker.js
const M3U_SUBSCRIPTIONS = 'M3U_SUBSCRIPTIONS';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 设置 CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  // 处理 POST 请求：添加订阅
  if (request.method === 'POST' && pathname === '/api/subscriptions') {
    try {
      const { url: subUrl } = await request.json();
      if (!subUrl || typeof subUrl !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: corsHeaders });
      }
      const id = Date.now().toString();
      await M3U_SUBSCRIPTIONS.put(id, subUrl);
      return new Response(JSON.stringify({ id, url: subUrl }), { status: 201, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: corsHeaders });
    }
  }

  // 处理 GET 请求：获取所有订阅
  if (request.method === 'GET' && pathname === '/api/subscriptions') {
    try {
      const keys = await M3U_SUBSCRIPTIONS.list();
      const subscriptions = await Promise.all(keys.keys.map(async (key) => {
        const url = await M3U_SUBSCRIPTIONS.get(key.name);
        return { id: key.name, url };
      }));
      return new Response(JSON.stringify(subscriptions), { status: 200, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: corsHeaders });
    }
  }

  // 处理 DELETE 请求：删除订阅
  if (request.method === 'DELETE' && pathname.startsWith('/api/subscriptions/')) {
    const id = pathname.split('/').pop();
    try {
      await M3U_SUBSCRIPTIONS.delete(id);
      return new Response(null, { status: 204, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}
