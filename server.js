const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme-admin-token';

const responseCache = new Map();
const isDev = process.env.NODE_ENV !== 'production';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

function createHttpError(statusCode, message, detail) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (detail) {
    error.detail = detail;
  }
  return error;
}

function readJSON(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJSON(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(createHttpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', (error) => {
      reject(createHttpError(400, '读取请求体失败', error.message));
    });
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw createHttpError(400, '请求体不是合法的 JSON 数据');
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS
  });
  res.end(JSON.stringify(data));
}

function sendNoContent(res) {
  res.writeHead(204, {
    ...CORS_HEADERS
  });
  res.end();
}

function sendNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

function sendOptions(res) {
  res.writeHead(204, {
    ...CORS_HEADERS,
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

function sendError(res, error) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const payload = {
    message: statusCode === 500 ? '服务器内部错误' : error.message || '请求失败'
  };
  if (error.detail) {
    payload.detail = error.detail;
  } else if (statusCode === 500 && isDev) {
    payload.detail = error.stack || error.message;
  }
  sendJSON(res, statusCode, payload);
}

function slugify(value) {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeLinks(value) {
  const result = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  ['douban', 'imdb', 'ign'].forEach((key) => {
    const link = value[key];
    if (typeof link === 'string') {
      const trimmed = link.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  });
  return result;
}

function buildBlogFromPayload(payload, forcedId) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError(400, '请求体不能为空');
  }
  const title = payload.title ? String(payload.title).trim() : '';
  if (!title) {
    throw createHttpError(400, '请填写文章标题');
  }
  const idSource = forcedId || payload.id || title;
  const id = slugify(idSource) || `blog-${Date.now()}`;
  const date = payload.date ? String(payload.date).trim() : '';
  const summary = payload.summary ? String(payload.summary).trim() : '';
  const coverImage = payload.coverImage ? String(payload.coverImage).trim() : '';
  const content = Array.isArray(payload.content)
    ? payload.content.map((item) => String(item).trim()).filter(Boolean)
    : ensureStringArray(payload.content);

  return {
    id,
    title,
    date: date || new Date().toISOString().slice(0, 10),
    tags: ensureStringArray(payload.tags),
    summary,
    coverImage,
    content
  };
}

function buildDailyFromPayload(payload, forcedId) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError(400, '请求体不能为空');
  }
  const idSource = forcedId || payload.id || `daily-${Date.now()}`;
  const id = slugify(idSource) || `daily-${Date.now()}`;
  const timestamp = payload.timestamp ? String(payload.timestamp).trim() : new Date().toISOString();
  return {
    id,
    timestamp,
    location: payload.location ? String(payload.location).trim() : '',
    mood: payload.mood ? String(payload.mood).trim() : '',
    content: payload.content ? String(payload.content).trim() : '',
    images: ensureStringArray(payload.images),
    platform: payload.platform ? String(payload.platform).trim() : ''
  };
}

function buildMediaItemFromPayload(payload, forcedId) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError(400, '请求体不能为空');
  }
  const title = payload.title ? String(payload.title).trim() : '';
  if (!title) {
    throw createHttpError(400, '请填写条目标题');
  }
  const idSource = forcedId || payload.id || title;
  const id = slugify(idSource) || `media-${Date.now()}`;
  const creators = ensureStringArray(payload.creators);
  const summary = payload.summary ? String(payload.summary).trim() : '';
  const personalReview = payload.personalReview ? String(payload.personalReview).trim() : '';
  const coverImage = payload.coverImage ? String(payload.coverImage).trim() : '';

  const item = {
    id,
    title,
    summary,
    personalReview
  };

  if (creators.length > 0) {
    item.creators = creators;
  }
  if (coverImage) {
    item.coverImage = coverImage;
  }

  if (payload.personalRating !== undefined && payload.personalRating !== null && payload.personalRating !== '') {
    const numeric = Number(payload.personalRating);
    if (Number.isFinite(numeric)) {
      item.personalRating = numeric;
    }
  }

  const links = sanitizeLinks(payload.links || {});
  if (Object.keys(links).length > 0) {
    item.links = links;
  }

  return item;
}

function decodeEntities(text) {
  if (!text) return '';
  const map = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' '
  };
  return text.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (match) => map[match] || match);
}

function cleanText(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function fetchPage(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL(targetUrl);
    const requester = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      headers: {
        'User-Agent': 'PersonalHabitatBot/1.0 (+https://example.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip,deflate'
      }
    };

    const req = requester.get(targetUrl, options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new url.URL(res.headers.location, targetUrl).toString();
        resolve(fetchPage(redirectUrl));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`请求失败: ${res.statusCode}`));
        return;
      }

      const encoding = res.headers['content-encoding'];
      let stream = res;

      if (encoding === 'gzip') {
        const gunzip = zlib.createGunzip();
        res.pipe(gunzip);
        stream = gunzip;
      } else if (encoding === 'deflate') {
        const inflate = zlib.createInflate();
        res.pipe(inflate);
        stream = inflate;
      }

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('请求超时'));
    });
  });
}

async function fetchWithCache(key, fetcher) {
  const cached = responseCache.get(key);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const data = await fetcher();
  responseCache.set(key, { timestamp: now, data });
  return data;
}

function parseJsonFromScripts(html, predicate) {
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (predicate(item)) {
            return item;
          }
        }
      } else if (predicate(parsed)) {
        return parsed;
      }
    } catch (error) {
      continue; // ignore invalid json
    }
  }
  return null;
}

async function scrapeDouban(target) {
  try {
    const html = await fetchPage(target);
    const ratingMatch = html.match(/<strong class="rating_num"[^>]*>([\d.]+)<\/strong>/);
    const votesMatch = html.match(/<span property="v:votes">([\d,]+)<\/span>/);
    const coverMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const comments = [];

    const commentRegex = /<div class="comment-item"[\s\S]*?data-cid="\d+"[\s\S]*?<span class="votes vote-count">(\d+)<\/span>[\s\S]*?<a href="[^"]+"[^>]*>([^<]+)<\/a>[\s\S]*?<span class="short">([\s\S]*?)<\/span>/g;
    let match;
    while ((match = commentRegex.exec(html)) !== null && comments.length < 3) {
      comments.push({
        votes: Number(match[1]),
        author: match[2],
        content: cleanText(match[3])
      });
    }

    return {
      source: 'douban',
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      scale: 10,
      votes: votesMatch ? parseInt(votesMatch[1].replace(/,/g, ''), 10) : null,
      hotComments: comments,
      coverImage: coverMatch ? coverMatch[1] : null
    };
  } catch (error) {
    if (isDev) {
      console.error('[douban] 抓取失败:', error.message);
    }
    return { source: 'douban', error: error.message };
  }
}

async function scrapeImdb(target) {
  try {
    const html = await fetchPage(target);
    const json = parseJsonFromScripts(html, (data) => Boolean(data.aggregateRating));
    const meta = {
      source: 'imdb',
      rating: null,
      scale: 10,
      votes: null,
      hotComments: [],
      coverImage: null
    };

    if (json && json.aggregateRating) {
      meta.rating = parseFloat(json.aggregateRating.ratingValue);
      meta.scale = parseFloat(json.aggregateRating.bestRating) || 10;
      meta.votes = parseInt(json.aggregateRating.ratingCount, 10) || null;
    }

    if (json && json.image) {
      meta.coverImage = typeof json.image === 'string' ? json.image : json.image.url || null;
    }

    const reviewUrl = target.endsWith('/') ? `${target}reviews?ref_=tt_ov_rt` : `${target}/reviews?ref_=tt_ov_rt`;
    try {
      const reviewHtml = await fetchPage(reviewUrl);
      const reviewRegex = /<div class="ipc-html-content-inner-div"[^>]*>([\s\S]*?)<\/div>/g;
      const reviews = [];
      let match;
      while ((match = reviewRegex.exec(reviewHtml)) !== null && reviews.length < 2) {
        const content = cleanText(match[1]);
        if (content.length > 0) {
          reviews.push({ content });
        }
      }
      meta.hotComments = reviews;
    } catch (error) {
      // ignore review errors
    }

    return meta;
  } catch (error) {
    if (isDev) {
      console.error('[imdb] 抓取失败:', error.message);
    }
    return { source: 'imdb', error: error.message };
  }
}

async function scrapeIgn(target) {
  try {
    const html = await fetchPage(target);
    const json = parseJsonFromScripts(html, (data) => data['@type'] === 'Review' || data.reviewRating || data['@type'] === 'Game');
    const meta = {
      source: 'ign',
      rating: null,
      scale: 10,
      votes: null,
      hotComments: [],
      summary: null,
      coverImage: null
    };

    if (json) {
      if (json.reviewRating) {
        meta.rating = parseFloat(json.reviewRating.ratingValue);
        meta.scale = parseFloat(json.reviewRating.bestRating) || 10;
      }
      if (json.description) {
        meta.summary = cleanText(json.description);
      } else if (json.reviewBody) {
        meta.summary = cleanText(json.reviewBody).slice(0, 160);
      }
      if (json.image) {
        if (typeof json.image === 'string') {
          meta.coverImage = json.image;
        } else if (json.image.url) {
          meta.coverImage = json.image.url;
        }
      } else if (json.itemReviewed && json.itemReviewed.image) {
        if (typeof json.itemReviewed.image === 'string') {
          meta.coverImage = json.itemReviewed.image;
        } else if (json.itemReviewed.image.url) {
          meta.coverImage = json.itemReviewed.image.url;
        }
      }
    }

    return meta;
  } catch (error) {
    if (isDev) {
      console.error('[ign] 抓取失败:', error.message);
    }
    return { source: 'ign', error: error.message };
  }
}

async function augmentMediaItem(item) {
  const remote = {};
  const links = item.links || {};

  if (links.douban) {
    remote.douban = await fetchWithCache(`douban:${links.douban}`, () => scrapeDouban(links.douban));
  }

  if (links.imdb) {
    remote.imdb = await fetchWithCache(`imdb:${links.imdb}`, () => scrapeImdb(links.imdb));
  }

  if (links.ign) {
    remote.ign = await fetchWithCache(`ign:${links.ign}`, () => scrapeIgn(links.ign));
  }

  const merged = { ...item, remote };
  if (!merged.coverImage) {
    merged.coverImage =
      (remote.imdb && remote.imdb.coverImage) ||
      (remote.ign && remote.ign.coverImage) ||
      (remote.douban && remote.douban.coverImage) ||
      null;
  }

  return merged;
}

async function buildMediaResponse() {
  const media = readJSON('media.json');
  const result = {};
  for (const [category, items] of Object.entries(media)) {
    result[category] = await Promise.all(items.map((item) => augmentMediaItem(item)));
  }
  return result;
}

async function handleAdmin(req, res, pathname) {
  if (!ADMIN_TOKEN) {
    throw createHttpError(500, '未配置管理令牌，请设置环境变量 ADMIN_TOKEN');
  }
  const headerToken = req.headers['x-admin-token'];
  if (!headerToken || headerToken !== ADMIN_TOKEN) {
    throw createHttpError(401, '未授权，请提供有效的管理令牌');
  }

  const segments = pathname.split('/').filter(Boolean);
  const resource = segments[2];
  const rest = segments.slice(3).map((segment) => decodeURIComponent(segment));

  if (!resource) {
    throw createHttpError(404, '未知的管理接口');
  }

  if (resource === 'blog') {
    const blogs = readJSON('blog.json');

    if (req.method === 'GET' && rest.length === 0) {
      sendJSON(res, 200, blogs);
      return;
    }

    if (req.method === 'POST' && rest.length === 0) {
      const payload = await readJsonBody(req);
      const blog = buildBlogFromPayload(payload);
      if (blogs.some((item) => item.id === blog.id)) {
        throw createHttpError(409, '文章 ID 已存在，请更换');
      }
      blogs.unshift(blog);
      writeJSON('blog.json', blogs);
      sendJSON(res, 201, blog);
      return;
    }

    if (rest.length === 1) {
      const blogId = rest[0];
      const index = blogs.findIndex((item) => item.id === blogId);
      if (index === -1) {
        throw createHttpError(404, '未找到指定的文章');
      }

      if (req.method === 'PUT') {
        const payload = await readJsonBody(req);
        const blog = buildBlogFromPayload({ ...payload, id: blogId }, blogId);
        blogs[index] = blog;
        writeJSON('blog.json', blogs);
        sendJSON(res, 200, blog);
        return;
      }

      if (req.method === 'DELETE') {
        blogs.splice(index, 1);
        writeJSON('blog.json', blogs);
        sendNoContent(res);
        return;
      }
    }

    throw createHttpError(405, '不支持的博客操作');
  }

  if (resource === 'daily') {
    const daily = readJSON('daily.json');

    if (req.method === 'GET' && rest.length === 0) {
      sendJSON(res, 200, daily);
      return;
    }

    if (req.method === 'POST' && rest.length === 0) {
      const payload = await readJsonBody(req);
      const entry = buildDailyFromPayload(payload);
      if (daily.some((item) => item.id === entry.id)) {
        throw createHttpError(409, '动态 ID 已存在，请更换');
      }
      daily.unshift(entry);
      writeJSON('daily.json', daily);
      sendJSON(res, 201, entry);
      return;
    }

    if (rest.length === 1) {
      const entryId = rest[0];
      const index = daily.findIndex((item) => item.id === entryId);
      if (index === -1) {
        throw createHttpError(404, '未找到指定的动态');
      }

      if (req.method === 'PUT') {
        const payload = await readJsonBody(req);
        const entry = buildDailyFromPayload({ ...payload, id: entryId }, entryId);
        daily[index] = entry;
        writeJSON('daily.json', daily);
        sendJSON(res, 200, entry);
        return;
      }

      if (req.method === 'DELETE') {
        daily.splice(index, 1);
        writeJSON('daily.json', daily);
        sendNoContent(res);
        return;
      }
    }

    throw createHttpError(405, '不支持的动态操作');
  }

  if (resource === 'media') {
    const media = readJSON('media.json');

    if (req.method === 'GET' && rest.length === 0) {
      sendJSON(res, 200, media);
      return;
    }

    if (rest.length >= 1) {
      const category = rest[0];
      if (!media[category] || !Array.isArray(media[category])) {
        throw createHttpError(404, '未找到指定的分类');
      }

      if (req.method === 'POST' && rest.length === 1) {
        const payload = await readJsonBody(req);
        const item = buildMediaItemFromPayload(payload);
        if (media[category].some((entry) => entry.id === item.id)) {
          throw createHttpError(409, '条目 ID 已存在，请更换');
        }
        media[category].unshift(item);
        writeJSON('media.json', media);
        responseCache.clear();
        sendJSON(res, 201, item);
        return;
      }

      if (rest.length === 2) {
        const entryId = rest[1];
        const index = media[category].findIndex((entry) => entry.id === entryId);
        if (index === -1) {
          throw createHttpError(404, '未找到指定的条目');
        }

        if (req.method === 'PUT') {
          const payload = await readJsonBody(req);
          const item = buildMediaItemFromPayload({ ...payload, id: entryId }, entryId);
          media[category][index] = item;
          writeJSON('media.json', media);
          responseCache.clear();
          sendJSON(res, 200, item);
          return;
        }

        if (req.method === 'DELETE') {
          media[category].splice(index, 1);
          writeJSON('media.json', media);
          responseCache.clear();
          sendNoContent(res);
          return;
        }
      }
    }

    throw createHttpError(405, '不支持的条目操作');
  }

  throw createHttpError(404, '未知的管理资源');
}

async function handleApi(req, res, pathname) {
  try {
    if (pathname === '/api/blog' && req.method === 'GET') {
      const blogs = readJSON('blog.json');
      sendJSON(res, 200, blogs);
      return;
    }

    if (pathname === '/api/daily' && req.method === 'GET') {
      const daily = readJSON('daily.json');
      sendJSON(res, 200, daily);
      return;
    }

    if (pathname === '/api/media' && req.method === 'GET') {
      const media = await buildMediaResponse();
      sendJSON(res, 200, media);
      return;
    }

    if (pathname.startsWith('/api/admin/')) {
      await handleAdmin(req, res, pathname);
      return;
    }

    sendJSON(res, 404, { message: '接口不存在' });
  } catch (error) {
    sendError(res, error);
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function respondWithFile(res, filePath) {
  fs.readFile(filePath, (readErr, content) => {
    if (readErr) {
      sendNotFound(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(content);
  });
}

function serveStatic(req, res, pathname) {
  const normalized = path.normalize(pathname || '/');
  let baseDir = PUBLIC_DIR;
  let requestPath = normalized;

  if (normalized.startsWith('/admin')) {
    baseDir = ADMIN_DIR;
    requestPath = normalized.slice('/admin'.length) || '/';
  }

  if (!requestPath || requestPath === '/') {
    requestPath = 'index.html';
  } else {
    if (requestPath.startsWith('/')) {
      requestPath = requestPath.slice(1);
    }
    requestPath = path.normalize(requestPath);
  }

  if (requestPath.startsWith('..')) {
    sendNotFound(res);
    return;
  }

  let filePath = path.join(baseDir, requestPath);
  filePath = path.resolve(filePath);

  if (!filePath.startsWith(baseDir)) {
    sendNotFound(res);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (baseDir === ADMIN_DIR) {
        const fallback = path.join(ADMIN_DIR, 'index.html');
        respondWithFile(res, fallback);
        return;
      }
      if (!path.extname(requestPath)) {
        const fallback = path.join(PUBLIC_DIR, 'index.html');
        respondWithFile(res, fallback);
        return;
      }
      sendNotFound(res);
      return;
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      if (!indexPath.startsWith(baseDir)) {
        sendNotFound(res);
        return;
      }
      respondWithFile(res, indexPath);
      return;
    }

    respondWithFile(res, filePath);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new url.URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (isDev) {
    console.log(`[dev] ${req.method} ${pathname}`);
  }

  if (pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      sendOptions(res);
      return;
    }
    handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
});
