// worker/m3u-worker.js

// CORS 预设头部 (根据需要调整)
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // 或者更严格: 'https://YOUR_FRONTEND_DOMAIN.pages.dev'
    'Access-Control-Allow-Methods': 'GET, OPTIONS', // 只允许 GET 和 OPTIONS
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
  };
  

  // --- ★★★ START: 定义你的固定订阅列表 ★★★ ---
  // 在这里添加你希望所有用户都能看到的订阅源
  // 格式: { name: "显示名称", url: "订阅地址 M3U/M3U8" }
  const fixedSubscriptions = [
    {
      name: "1.外语电视",
      url: "https://raw.githubusercontent.com/sjnhnp/adblock/refs/heads/main/filtered_global_attributes_removed.m3u"
    },
    {
      name: "2.国语电视",
      url: "https://raw.githubusercontent.com/sjnhnp/adblock/refs/heads/main/filtered_https_only.m3u"
    },
    {
      name: "3.国语电视-品质不佳",
      url: "https://raw.githubusercontent.com/sjnhnp/adblock/refs/heads/main/filtered_http_only_valid.m3u"
    },
  ];
  // --- ★★★ END: 定义你的固定订阅列表 ★★★ ---

  export default {
      async fetch(request, env, ctx) {
          const url = new URL(request.url);
          const pathSegments = url.pathname.split('/').filter(Boolean);
          // --- OPTIONS Preflight Handling ---
          if (request.method === 'OPTIONS') {
              // 允许对 fixed-subscriptions 和 proxy 的预检请求
              if (pathSegments[0] === 'api' &&
                 (pathSegments[1] === 'fixed-subscriptions' || pathSegments[1] === 'proxy')) {
                  return new Response(null, { headers: corsHeaders, status: 204 });
              } else {
                  // 其他路径不允许
                  return new Response('OPTIONS Not Allowed', { status: 405 });
              }
          }
  
          // --- API Routing ---
          if (pathSegments[0] === 'api') {
              try {
                  // --- ★★★ START: 新增处理固定订阅列表请求 ★★★ ---
                  if (pathSegments[1] === 'fixed-subscriptions' && request.method === 'GET') {
                      return handleGetFixedSubscriptions(); // 调用新函数
                  }
                  // --- ★★★ END: 新增处理固定订阅列表请求 ★★★ ---
  
                  // Handle /api/proxy?url=... (保持不变)
                  if (pathSegments[1] === 'proxy' && request.method === 'GET') {
                      return await handleProxyRequest(request, env); // 这个代理功能依然重要
                  }
  
                  // --- (可选清理) 注释掉或删除不再使用的 KV 订阅管理路由 ---
                  /*
                  if (pathSegments[1] === 'subscriptions') {
                      const subscriptionId = pathSegments[2];
                      // ... 原来的 GET / POST / DELETE 逻辑 ...
                      // 现在这些操作都在前端 LocalStorage 处理了，Worker 不再需要管理用户订阅列表
                      return new Response('User subscriptions managed client-side.', { status: 404, headers: corsHeaders });
                  }
                  */
  
                  // Fallback for other /api paths
                  return new Response('API Endpoint Not Found', { status: 404, headers: corsHeaders });
  
              } catch (error) {
                  console.error(`Worker Error: ${error.message}\n${error.stack}`);
                  return new Response(`Internal Server Error: ${error.message}`, { status: 500, headers: corsHeaders });
              }
          }
  
          // --- Non-API Requests ---
          return new Response('Not Found', { status: 404 }); // Default fallback
      },
  };
  
  // --- ★★★ START: 新增获取固定订阅的处理器 ★★★ ---
  function handleGetFixedSubscriptions() {
      // 直接返回上面定义的 fixedSubscriptions 数组
      const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
      return new Response(JSON.stringify(fixedSubscriptions), {
          headers: headers,
          status: 200,
      });
  }
  // --- ★★★ END: 新增获取固定订阅的处理器 ★★★ ---
  
  
  // --- 代理处理函数 handleProxyRequest (保持不变) ---
  async function handleProxyRequest(request, env) {
      
      const requestUrl = new URL(request.url);
      const targetUrlEncoded = requestUrl.searchParams.get('url');
  
      if (!targetUrlEncoded) {
          return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders });
      }
  
      let targetUrl;
      try {
          targetUrl = decodeURIComponent(targetUrlEncoded);
          if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
              throw new Error('Invalid protocol');
          }
      } catch (e) {
          return new Response('Invalid or malformed "url" query parameter', { status: 400, headers: corsHeaders });
      }
  
      const FETCH_TIMEOUT_MS = 15000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
          console.log(`Fetch timeout triggered for ${targetUrl} after ${FETCH_TIMEOUT_MS}ms`);
          controller.abort();
      }, FETCH_TIMEOUT_MS);
  
      try {
          console.log(`Worker proxying request for: ${targetUrl}`);
          const proxyRequestHeaders = new Headers();
          const rangeHeader = request.headers.get('Range');
          if (rangeHeader) {
              proxyRequestHeaders.set('Range', rangeHeader);
              console.log(`Passing Range header: ${rangeHeader}`);
          }
          // proxyRequestHeaders.set('User-Agent', 'MyM3UPlayerProxy/1.0');
          // Add a plausible Referer and User-Agent to bypass hotlink protection
        proxyRequestHeaders.set('Referer', new URL(targetUrl).origin);
        proxyRequestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        // --- END OF MODIFICATION ---
          const originResponse = await fetch(targetUrl, {
               method: request.method,
               headers: proxyRequestHeaders,
               redirect: 'follow',
               signal: controller.signal
          });
  
          clearTimeout(timeoutId);
  
          if (!originResponse.ok) {
              console.error(`Proxy target fetch failed for ${targetUrl} with status: ${originResponse.status}`);
              return new Response(originResponse.body, {
                   status: originResponse.status,
                   statusText: originResponse.statusText,
                   headers: corsHeaders
              });
          }
  
          const responseHeaders = new Headers(corsHeaders);
          const contentType = originResponse.headers.get('Content-Type');
          if (contentType) {
              responseHeaders.set('Content-Type', contentType);
          }
          const contentLength = originResponse.headers.get('Content-Length');
          if (contentLength) {
              responseHeaders.set('Content-Length', contentLength);
          }
           const contentRange = originResponse.headers.get('Content-Range');
          if (contentRange) {
              responseHeaders.set('Content-Range', contentRange);
          }
  
          if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || contentType.includes('audio/mpegurl'))) {
               console.log(`Detected M3U8 content type for ${targetUrl}. Rewriting URLs.`);
               const m3uText = await originResponse.text();
               const rewrittenM3u = rewriteM3uUrls(m3uText, targetUrl, requestUrl.origin + '/api/proxy');
               return new Response(rewrittenM3u, {
                   status: originResponse.status,
                   statusText: originResponse.statusText,
                   headers: responseHeaders
               });
          } else {
              return new Response(originResponse.body, {
                  status: originResponse.status,
                  statusText: originResponse.statusText,
                  headers: responseHeaders
              });
          }
  
      } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
              console.error(`Proxy fetch aborted for ${targetUrl} due to timeout.`);
              return new Response('Gateway Timeout: Origin server did not respond in time.', {
                  status: 504,
                  headers: corsHeaders
              });
          } else {
              console.error(`Error during proxy request for ${targetUrl}: ${error.message}\n${error.stack}`);
              return new Response('Bad Gateway: Error fetching from origin server.', {
                   status: 502,
                   headers: corsHeaders
              });
          }
      }
  }
  
  // --- M3U8 Rewriting Helper Function rewriteM3uUrls (保持不变) ---
  function rewriteM3uUrls(m3uText, baseUrl, proxyPrefix) {
      // ... (你之前的 rewriteM3uUrls 函数代码，原封不动放这里) ...
      const lines = m3uText.split('\n');
      const base = new URL(baseUrl);
  
      const rewrittenLines = lines.map(line => {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
              try {
                  const segmentUrl = new URL(trimmedLine, base).toString();
                   if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
                       const proxiedUrl = `${proxyPrefix}?url=${encodeURIComponent(segmentUrl)}`;
                       // console.log(`Rewriting URL: ${trimmedLine} -> ${proxiedUrl}`); // Reduce logging noise
                       return proxiedUrl;
                   } else {
                       // console.log(`Skipping rewrite for non-http(s) URL: ${trimmedLine}`);
                       return line;
                   }
              } catch (e) {
                   // console.warn(`Failed to parse or rewrite URL line: ${trimmedLine}`, e);
                   return line;
              }
          } else if (trimmedLine.startsWith('#EXT-X-KEY:')) {
               const uriMatch = trimmedLine.match(/URI="([^"]+)"/);
               if (uriMatch && uriMatch[1]) {
                   const keyUri = uriMatch[1];
                   try {
                       const keyUrl = new URL(keyUri, base).toString();
                        if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
                             const proxiedKeyUrl = `${proxyPrefix}?url=${encodeURIComponent(keyUrl)}`;
                             // console.log(`Rewriting Key URI: ${keyUri} -> ${proxiedKeyUrl}`);
                             return trimmedLine.replace(uriMatch[0], `URI="${proxiedKeyUrl}"`);
                        } else {
                            // console.log(`Skipping rewrite for non-http(s) Key URI: ${keyUri}`);
                           return line;
                        }
                   } catch (e) {
                        // console.warn(`Failed to parse or rewrite Key URI: ${keyUri}`, e);
                        return line;
                   }
               } else {
                    return line;
               }
           }
          return line;
      });
  
      return rewrittenLines.join('\n');
  }
  
  
  // --- (可选清理) 注释掉或删除不再使用的 Worker 端的订阅管理函数 ---
  /*
  async function handleListSubscriptions(env) { ... }
  async function handleAddSubscription(request, env) { ... }
  async function handleDeleteSubscription(id, env) { ... }
  */
