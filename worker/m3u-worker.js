// CORS 预设头部 (根据需要调整)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // 或者更严格地指定你的 Pages 域名: 'https://m3u-player.pages.dev'
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', // 包含所有你支持的方法
  'Access-Control-Allow-Headers': 'Content-Type', // 允许你的 POST 请求发送 Content-Type 头
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // **处理 OPTIONS 预检请求**
        if (request.method === 'OPTIONS') {
            // 仅对 API 路径响应预检请求
            if (pathSegments[0] === 'api' && pathSegments[1] === 'subscriptions') {
                return new Response(null, { headers: corsHeaders, status: 204 }); // 204 No Content 是 OPTIONS 的常见响应
            } else {
                // 对于非 API 路径的 OPTIONS 请求，可以返回 404 或其他
                return new Response('Not Found', { status: 404 });
            }
        }

        // 处理 API 请求
        if (pathSegments[0] === 'api' && pathSegments[1] === 'subscriptions') {
            const subscriptionId = pathSegments[2];

            try {
                // Handle GET /api/subscriptions (List all)
                if (request.method === 'GET' && !subscriptionId) {
                    return await handleListSubscriptions(env);
                }

                // Handle POST /api/subscriptions (Add new)
                if (request.method === 'POST' && !subscriptionId) {
                    return await handleAddSubscription(request, env);
                }

                // Handle DELETE /api/subscriptions/{id} (Delete one)
                if (request.method === 'DELETE' && subscriptionId) {
                    return await handleDeleteSubscription(subscriptionId, env);
                }

                // 如果方法/路径组合不匹配，返回 405 或 404，并附带 CORS 头
                const status = subscriptionId ? 405 : 404;
                return new Response(status === 405 ? 'Method Not Allowed' : 'Not Found', {
                    status: status,
                    headers: corsHeaders // 在错误响应中也包含 CORS 头可能有助于调试
                });

            } catch (error) {
                console.error(`Worker Error: ${error.message}`, error.stack);
                // 在内部错误响应中也包含 CORS 头
                return new Response(`Internal Server Error: ${error.message}`, {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        // 如果路径不匹配 /api/subscriptions，返回 404 (无需 CORS 头，因为这不是 API 端点)
        return new Response('Not Found', { status: 404 });
    },
};

// --- Handler Functions (添加 CORS 头部) ---

async function handleListSubscriptions(env) {
    if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        // ... (原有逻辑不变) ...
        const listResult = await env.SUBS_KV.list();
        const subscriptions = [];
        for (const key of listResult.keys) {
             const url = await env.SUBS_KV.get(key.name);
             if (url) {
                 subscriptions.push({ id: key.name, url: url });
             }
        }
        // 将 CORS 头和 Content-Type 合并
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        return new Response(JSON.stringify(subscriptions), {
            headers: headers,
            status: 200,
        });
    } catch (error) {
         console.error("Error listing subscriptions from KV:", error);
         return new Response('Failed to list subscriptions', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}

async function handleAddSubscription(request, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        const body = await request.json();
        const urlToAdd = body?.url;
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' }; // 合并头

        if (!urlToAdd || typeof urlToAdd !== 'string' || !urlToAdd.startsWith('http')) {
            return new Response(JSON.stringify({ error: 'Invalid or missing URL in request body.' }), {
                 status: 400,
                 headers: headers
             });
        }

        const id = crypto.randomUUID();
        await env.SUBS_KV.put(id, urlToAdd);

        return new Response(JSON.stringify({ id: id, url: urlToAdd }), {
            status: 201,
            headers: headers,
        });
    } catch (error) {
         console.error("Error adding subscription:", error);
         const headers = { ...corsHeaders, 'Content-Type': 'application/json' }; // 合并头
         if (error instanceof SyntaxError) {
              return new Response(JSON.stringify({ error: 'Invalid JSON format in request body.' }), { status: 400, headers: headers });
         }
         return new Response('Failed to add subscription', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}

async function handleDeleteSubscription(id, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        const exists = await env.SUBS_KV.get(id);
        if (exists === null) {
             return new Response('Subscription not found', { status: 404, headers: corsHeaders }); // 添加 CORS 头
        }

        await env.SUBS_KV.delete(id);
        // 对于 204 No Content 响应，通常也需要 CORS 头
        return new Response(null, { status: 204, headers: corsHeaders });
    } catch (error) {
         console.error(`Error deleting subscription ${id}:`, error);
         return new Response('Failed to delete subscription', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}
