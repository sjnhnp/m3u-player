// worker/m3u-worker.js

// CORS 预设头部 (根据需要调整)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // 或者更严格: 'https://YOUR_FRONTEND_DOMAIN.pages.dev'
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range', // 添加 Range for potential video seeking
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range', // Expose necessary headers
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // --- OPTIONS Preflight Handling ---
        if (request.method === 'OPTIONS') {
            // Allow OPTIONS for subscriptions and proxy endpoints
            if (pathSegments[0] === 'api' &&
               (pathSegments[1] === 'subscriptions' || pathSegments[1] === 'proxy')) {
                return new Response(null, { headers: corsHeaders, status: 204 });
            } else {
                // For other paths, return 404 or handle differently if needed
                return new Response('Not Found', { status: 404 });
            }
        }

        // --- API Routing ---
        if (pathSegments[0] === 'api') {
            try {
                // Handle /api/subscriptions/...
                if (pathSegments[1] === 'subscriptions') {
                    const subscriptionId = pathSegments[2];
                    if (request.method === 'GET' && !subscriptionId) {
                        return await handleListSubscriptions(env);
                    }
                    if (request.method === 'POST' && !subscriptionId) {
                        return await handleAddSubscription(request, env);
                    }
                    if (request.method === 'DELETE' && subscriptionId) {
                        return await handleDeleteSubscription(subscriptionId, env);
                    }
                    // Method/path mismatch for subscriptions
                    const status = subscriptionId ? 405 : 404;
                     return new Response(status === 405 ? 'Method Not Allowed' : 'Not Found', { status: status, headers: corsHeaders });
                }

                // Handle /api/proxy?url=...
                if (pathSegments[1] === 'proxy' && request.method === 'GET') {
                    return await handleProxyRequest(request, env);
                }

                // Fallback for other /api paths
                return new Response('API Endpoint Not Found', { status: 404, headers: corsHeaders });

            } catch (error) {
                console.error(`Worker Error: ${error.message}\n${error.stack}`);
                 return new Response(`Internal Server Error: ${error.message}`, { status: 500, headers: corsHeaders });
            }
        }

        // --- Non-API Requests (e.g., serving static assets if Worker was standalone) ---
        // If deployed alongside Pages, Pages usually handles static assets.
        return new Response('Not Found', { status: 404 }); // Default fallback
    },
};

// --- 新的代理处理函数 (已加入超时逻辑) ---
async function handleProxyRequest(request, env) {
    const requestUrl = new URL(request.url);
    const targetUrlEncoded = requestUrl.searchParams.get('url');

    if (!targetUrlEncoded) {
        // 如果请求里没有 'url' 参数，返回错误
        return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders });
    }

    let targetUrl;
    try {
        // 解码 'url' 参数得到原始地址
        targetUrl = decodeURIComponent(targetUrlEncoded);
        // 简单检查一下是不是 http:// 或 https:// 开头
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            throw new Error('Invalid protocol');
        }
    } catch (e) {
        // 如果 'url' 参数格式不对，返回错误
        return new Response('Invalid or malformed "url" query parameter', { status: 400, headers: corsHeaders });
    }

    // --- 开始准备访问原始地址 ---

    // 设置一个超时时间，单位是毫秒 (比如 15000 毫秒 = 15 秒)
    const FETCH_TIMEOUT_MS = 15000;

    // 创建一个 AbortController，它可以用来“取消”fetch 请求
    const controller = new AbortController();

    // 设置一个定时器 (闹钟)
    // 如果 FETCH_TIMEOUT_MS 时间到了，fetch 还没完成，就调用 controller.abort() 来取消它
    const timeoutId = setTimeout(() => {
        console.log(`Fetch timeout triggered for ${targetUrl} after ${FETCH_TIMEOUT_MS}ms`);
        controller.abort(); // 发出取消信号
    }, FETCH_TIMEOUT_MS);

    try {
        console.log(`Worker proxying request for: ${targetUrl}`);

        // 准备发给原始服务器的请求头
        const proxyRequestHeaders = new Headers();
        const rangeHeader = request.headers.get('Range'); // 检查浏览器是否请求了部分内容 (视频拖动时常用)
        if (rangeHeader) {
            proxyRequestHeaders.set('Range', rangeHeader); // 如果有，就把它也发给原始服务器
            console.log(`Passing Range header: ${rangeHeader}`);
        }
        // 你可以按需添加 User-Agent 头，有些服务器会检查这个
        // proxyRequestHeaders.set('User-Agent', 'MyM3UPlayerProxy/1.0');

        // --- 执行 fetch 请求，去访问原始地址 ---
        // 注意：这里加了 signal: controller.signal
        const originResponse = await fetch(targetUrl, {
             method: request.method, // 通常是 GET
             headers: proxyRequestHeaders,
             redirect: 'follow', // 自动跟随原始服务器的重定向
             signal: controller.signal // 把取消信号关联到 fetch 请求
        });

        // !!! 重要：如果 fetch 成功在超时前返回了，我们要立刻清除刚才设置的定时器 (取消闹钟)
        clearTimeout(timeoutId);

        // 检查从原始服务器获取的响应是不是成功的 (比如状态码是不是 200 OK)
        if (!originResponse.ok) {
            console.error(`Proxy target fetch failed for ${targetUrl} with status: ${originResponse.status}`);
            // 如果原始服务器返回了错误 (如 404 Not Found, 500 Internal Server Error)
            // 我们就把这个错误状态和内容转发给浏览器，但加上我们自己的 CORS 头
            return new Response(originResponse.body, {
                 status: originResponse.status,
                 statusText: originResponse.statusText,
                 headers: corsHeaders // 确保错误响应也有 CORS 头
            });
        }

        // --- 处理来自原始服务器的成功响应 ---
        const responseHeaders = new Headers(corsHeaders); // 准备返回给浏览器的响应头，先加上 CORS

        // 把原始响应的重要头信息复制过来
        const contentType = originResponse.headers.get('Content-Type');
        if (contentType) {
            responseHeaders.set('Content-Type', contentType); // 复制内容类型 (比如 'application/vnd.apple.mpegurl' 或 'video/MP2T')
        }
        const contentLength = originResponse.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength); // 复制内容长度
        }
         const contentRange = originResponse.headers.get('Content-Range');
        if (contentRange) {
            responseHeaders.set('Content-Range', contentRange); // 复制部分内容的范围信息
        }
        // 可以根据需要复制其他头，比如缓存相关的

        // --- M3U8 文件内容重写 ---
        // 检查内容类型是不是 M3U8 文件
        if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || contentType.includes('audio/mpegurl'))) {
             console.log(`Detected M3U8 content type for ${targetUrl}. Rewriting URLs.`);
             const m3uText = await originResponse.text(); // 把 M3U8 文件内容读成文本
             // 调用 rewriteM3uUrls 函数 (这个函数你之前应该已经有了) 来修改里面的 URL
             const rewrittenM3u = rewriteM3uUrls(m3uText, targetUrl, requestUrl.origin + '/api/proxy');
             // 把修改后的 M3U8 文本返回给浏览器
             return new Response(rewrittenM3u, {
                 status: originResponse.status, // 保持原始的状态码 (通常是 200)
                 statusText: originResponse.statusText,
                 headers: responseHeaders // 使用我们构造好的响应头
             });
        } else {
            // --- 对于非 M3U8 内容 (比如 .ts 视频片段) ---
            // 直接把原始服务器的响应体 (body) 返回给浏览器，不做修改
            return new Response(originResponse.body, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: responseHeaders // 使用我们构造好的响应头
            });
        }

    } catch (error) {
        // --- 错误处理 ---
        // 如果在上面的 try 块中发生了任何错误 (包括 fetch 被取消)

        // 同样，先确保清除定时器，以防万一错误发生在 fetch 之前或之后但定时器还在跑
        clearTimeout(timeoutId);

        // 检查错误是不是因为我们的“闹钟”响了 (超时导致 fetch 被取消)
        if (error.name === 'AbortError') {
            // 如果是 AbortError，说明是超时了
            console.error(`Proxy fetch aborted for ${targetUrl} due to timeout.`);
            // 返回一个 504 Gateway Timeout 错误给浏览器，这是表示“上游服务器超时”的标准状态码
            return new Response('Gateway Timeout: Origin server did not respond in time.', {
                status: 504,
                headers: corsHeaders // 错误响应也要带 CORS 头
            });
        } else {
            // 如果是其他类型的错误 (比如网络连接问题、DNS 解析失败、代码本身逻辑错误等)
            console.error(`Error during proxy request for ${targetUrl}: ${error.message}\n${error.stack}`);
            // 返回一个通用的服务器错误，比如 502 Bad Gateway (表示代理服务器无法从上游获取有效响应)
            // 或者用 500 Internal Server Error 也可以
            return new Response('Bad Gateway: Error fetching from origin server.', {
                 status: 502,
                 headers: corsHeaders // 错误响应也要带 CORS 头
            });
            // 或者: return new Response('Proxy internal error', { status: 500, headers: corsHeaders });
        }
    }
}





// --- M3U8 Rewriting Helper Function ---
function rewriteM3uUrls(m3uText, baseUrl, proxyPrefix) {
    const lines = m3uText.split('\n');
    const base = new URL(baseUrl); // Base URL object for resolving relative paths

    const rewrittenLines = lines.map(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) { // This line is likely a URL
            try {
                // Resolve the URL (handles both relative and absolute paths within the manifest)
                const segmentUrl = new URL(trimmedLine, base).toString();
                // Rewrite the URL to go through the proxy
                // Only rewrite http/https URLs - ignore potential data URIs etc.
                 if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
                     const proxiedUrl = `${proxyPrefix}?url=${encodeURIComponent(segmentUrl)}`;
                     console.log(`Rewriting URL: ${trimmedLine} -> ${proxiedUrl}`);
                     return proxiedUrl; // Return the proxied URL
                 } else {
                     console.log(`Skipping rewrite for non-http(s) URL: ${trimmedLine}`);
                     return line; // Keep original line if not http/https
                 }
            } catch (e) {
                 console.warn(`Failed to parse or rewrite URL line: ${trimmedLine}`, e);
                 return line; // Keep original line on error
            }
        } else if (trimmedLine.startsWith('#EXT-X-KEY:')) {
             // Handle encryption key URLs if present
             const uriMatch = trimmedLine.match(/URI="([^"]+)"/);
             if (uriMatch && uriMatch[1]) {
                 const keyUri = uriMatch[1];
                 try {
                     const keyUrl = new URL(keyUri, base).toString();
                      if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
                           const proxiedKeyUrl = `${proxyPrefix}?url=${encodeURIComponent(keyUrl)}`;
                           console.log(`Rewriting Key URI: ${keyUri} -> ${proxiedKeyUrl}`);
                           return trimmedLine.replace(uriMatch[0], `URI="${proxiedKeyUrl}"`);
                      } else {
                          console.log(`Skipping rewrite for non-http(s) Key URI: ${keyUri}`);
                         return line;
                      }
                 } catch (e) {
                      console.warn(`Failed to parse or rewrite Key URI: ${keyUri}`, e);
                      return line;
                 }
             } else {
                  return line; // No URI attribute found
             }
         }
        // Keep comment lines and other directives as they are
        return line;
    });

    return rewrittenLines.join('\n');
}


// --- Existing Handler Functions (handleListSubscriptions, etc.) remain unchanged ---
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
