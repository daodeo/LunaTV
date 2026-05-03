import { NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';
import { recordRequest } from '@/lib/performance-monitor';

/**
 * 刷新过期的 Douban trailer URL
 * 使用服务端内存缓存，避免多个用户重复请求豆瓣
 */

// 服务端缓存：存储 trailer URL
// 格式: { [doubanId]: { url: string, timestamp: number } }
const trailerCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2小时缓存（客户端检测到过期时会主动清除）

// 清理过期缓存
function cleanExpiredCache() {
  const now = Date.now();
  for (const [id, data] of trailerCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      trailerCache.delete(id);
      console.log(`[refresh-trailer] 清理过期缓存: ${id}`);
    }
  }
}

// 每小时清理一次过期缓存
setInterval(cleanExpiredCache, 60 * 60 * 1000);

// 带重试的获取函数
async function fetchTrailerWithRetry(id: string, retryCount = 0): Promise<string | null> {
  const MAX_RETRIES = 2;
  const TIMEOUT = 20000; // 20秒超时
  const RETRY_DELAY = 2000; // 2秒后重试

  const startTime = Date.now();

  try {
    // 先尝试 movie 端点
    let mobileApiUrl = `https://m.douban.com/rexxar/api/v2/movie/${id}`;

    console.log(`[refresh-trailer] 开始请求影片 ${id}${retryCount > 0 ? ` (重试 ${retryCount}/${MAX_RETRIES})` : ''}`);

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    let response = await fetch(mobileApiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Referer': 'https://movie.douban.com/explore',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://movie.douban.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      redirect: 'manual', // 手动处理重定向
    });

    clearTimeout(timeoutId);

    // 如果是 3xx 重定向，说明可能是电视剧，尝试 tv 端点
    if (response.status >= 300 && response.status < 400) {
      console.log(`[refresh-trailer] 检测到重定向，尝试 TV 端点`);
      mobileApiUrl = `https://m.douban.com/rexxar/api/v2/tv/${id}`;

      const tvController = new AbortController();
      const tvTimeoutId = setTimeout(() => tvController.abort(), TIMEOUT);

      response = await fetch(mobileApiUrl, {
        signal: tvController.signal,
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Referer': 'https://movie.douban.com/explore',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://movie.douban.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        },
      });

      clearTimeout(tvTimeoutId);
    }

    const fetchTime = Date.now() - startTime;
    console.log(`[refresh-trailer] 影片 ${id} 请求完成，耗时: ${fetchTime}ms, 状态: ${response.status}`);

    if (!response.ok) {
      throw new Error(`豆瓣API返回错误: ${response.status}`);
    }

    const data = await response.json();
    const trailerUrl = data.trailers?.[0]?.video_url;

    if (!trailerUrl) {
      console.warn(`[refresh-trailer] 影片 ${id} 没有预告片数据`);
      throw new Error('该影片没有预告片');
    }

    const totalTime = Date.now() - startTime;
    console.log(`[refresh-trailer] 影片 ${id} 成功获取trailer URL，总耗时: ${totalTime}ms`);

    return trailerUrl;
  } catch (error) {
    const failTime = Date.now() - startTime;

    // 超时或网络错误，尝试重试
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch'))) {
      console.error(`[refresh-trailer] 影片 ${id} 请求失败 (耗时: ${failTime}ms): ${error.name === 'AbortError' ? '超时' : error.message}`);

      if (retryCount < MAX_RETRIES) {
        console.warn(`[refresh-trailer] ${RETRY_DELAY}ms后重试 (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchTrailerWithRetry(id, retryCount + 1);
      } else {
        console.error(`[refresh-trailer] 影片 ${id} 重试次数已达上限，放弃请求`);
      }
    } else {
      console.error(`[refresh-trailer] 影片 ${id} 发生错误 (耗时: ${failTime}ms):`, error);
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    const errorResponse = {
      code: 400,
      message: '缺少必要参数: id',
      error: 'MISSING_PARAMETER',
    };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/refresh-trailer',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: errorSize,
    });

    return NextResponse.json(errorResponse, { status: 400 });
  }

  // 🔥 检查服务端缓存
  const cached = trailerCache.get(id);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[refresh-trailer] 使用缓存的 trailer URL: ${id}`);

    const cachedResponse = {
      code: 200,
      message: '获取成功（缓存）',
      data: {
        trailerUrl: cached.url,
      },
    };
    const cachedSize = Buffer.byteLength(JSON.stringify(cachedResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/refresh-trailer',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: cachedSize,
    });

    return NextResponse.json(cachedResponse, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }

  try {
    const trailerUrl = await fetchTrailerWithRetry(id);

    // 🔥 存入服务端缓存
    if (trailerUrl) {
      trailerCache.set(id, {
        url: trailerUrl,
        timestamp: Date.now(),
      });
      console.log(`[refresh-trailer] 缓存 trailer URL: ${id}`);
    }

    const successResponse = {
      code: 200,
      message: '获取成功',
      data: {
        trailerUrl,
      },
    };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/refresh-trailer',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(successResponse, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      // 超时错误
      if (error.name === 'AbortError') {
        const timeoutResponse = {
          code: 504,
          message: '请求超时，豆瓣响应过慢',
          error: 'TIMEOUT',
        };
        const timeoutSize = Buffer.byteLength(JSON.stringify(timeoutResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/douban/refresh-trailer',
          statusCode: 504,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: 0,
          requestSize: 0,
          responseSize: timeoutSize,
        });

        return NextResponse.json(timeoutResponse, { status: 504 });
      }

      // 没有预告片
      if (error.message.includes('没有预告片')) {
        const noTrailerResponse = {
          code: 404,
          message: error.message,
          error: 'NO_TRAILER',
        };
        const noTrailerSize = Buffer.byteLength(JSON.stringify(noTrailerResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/douban/refresh-trailer',
          statusCode: 404,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: 0,
          requestSize: 0,
          responseSize: noTrailerSize,
        });

        return NextResponse.json(noTrailerResponse, { status: 404 });
      }

      // 其他错误
      const fetchErrorResponse = {
        code: 500,
        message: '刷新 trailer URL 失败',
        error: 'FETCH_ERROR',
        details: error.message,
      };
      const fetchErrorSize = Buffer.byteLength(JSON.stringify(fetchErrorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/douban/refresh-trailer',
        statusCode: 500,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: 0,
        requestSize: 0,
        responseSize: fetchErrorSize,
      });

      return NextResponse.json(fetchErrorResponse, { status: 500 });
    }

    const unknownErrorResponse = {
      code: 500,
      message: '刷新 trailer URL 失败',
      error: 'UNKNOWN_ERROR',
    };
    const unknownErrorSize = Buffer.byteLength(JSON.stringify(unknownErrorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/refresh-trailer',
      statusCode: 500,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: unknownErrorSize,
    });

    return NextResponse.json(unknownErrorResponse, { status: 500 });
  }
}

// DELETE方法：清除服务端缓存
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({
      code: 400,
      message: '缺少必要参数: id',
      error: 'MISSING_PARAMETER',
    }, { status: 400 });
  }

  // 清除服务端缓存
  const deleted = trailerCache.delete(id);
  console.log(`[refresh-trailer] 清除服务端缓存: ${id}, 结果: ${deleted ? '成功' : '不存在'}`);

  return NextResponse.json({
    code: 200,
    message: '清除成功',
    data: { deleted },
  });
}
