# 个人栖息地网站

一个可部署在 Ubuntu 云服务器上的 Node.js + 原生前端个人网站，主页专注展示个人简介，并提供「学习博客」「书影音剧游条目」「日常动态」三个独立页面，同时内置内容管理后台，可在浏览器中维护所有数据。

- **学习板块**：以博客文章卡片展示，可在 `data/blog.json` 配置标题、日期、标签、摘要及正文段落。
- **书影音剧游板块**：按书籍、电影、番剧、游戏、戏剧分类展示。条目数据存放在 `data/media.json`，支持配置个人评分与外部链接（豆瓣 / IMDb / IGN）。服务端会在有链接时自动抓取平台评分、热门短评以及封面图，缓存 1 小时。
- **日常板块**：模拟 QQ 说说 / 微信朋友圈样式的动态流，数据来源 `data/daily.json`。
- **内容后台**：访问 `/admin`，使用令牌登录即可在图形化界面创建、修改、删除三类内容，实时写回 JSON 数据文件。

## 快速开始

```bash
# 安装依赖（仅使用内置模块，无需额外依赖）
# 直接启动即可
npm start
```

访问 `http://localhost:3000` 查看网站首页（个人简介），访问 `http://localhost:3000/study.html`、`http://localhost:3000/media.html`、`http://localhost:3000/daily.html` 分别进入各板块页面，访问 `http://localhost:3000/admin` 打开管理后台。

开发模式下可使用 `npm run dev`，默认端口同样为 3000；当 `NODE_ENV=development` 时会在终端输出更详细的日志（可按需扩展）。

## 部署到 Ubuntu 服务器

1. 安装 Node.js（建议 18+），并将项目代码上传到服务器，例如 `/var/www/personal-habitat`。
2. （推荐）在 shell 中设置后台访问令牌，例如 `export ADMIN_TOKEN="your-strong-token"`，随后运行 `npm start`。默认令牌为 `changeme-admin-token`，请在生产环境修改。
3. 使用 `pm2`/`systemd` 将 `npm start` 配置为常驻进程，或配合 Nginx 做反向代理与 HTTPS。
4. 如需自定义域名，配置 DNS 指向服务器 IP 并在 Nginx 中设置虚拟主机。

## 内容管理后台

1. 通过环境变量 `ADMIN_TOKEN` 设置后台访问令牌。
2. 在浏览器访问 `/admin`，输入令牌后即可查看三大数据集。
3. 后台支持新增、编辑、删除，并会自动同步到 `data/*.json` 文件；书影音条目支持为各平台添加链接，服务端会在前台请求时自动抓取评分。

令牌会缓存在浏览器本地，可随时点击侧边栏的「更换令牌」清除缓存。

## API 接口概览

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET | `/api/blog` | 获取博客文章列表 |
| GET | `/api/media` | 获取媒体条目及外部评分（自动抓取 + 缓存）|
| GET | `/api/daily` | 获取日常动态 |
| GET/POST/PUT/DELETE | `/api/admin/blog` | 后台管理博客文章（需 `X-Admin-Token` 请求头）|
| GET/POST/PUT/DELETE | `/api/admin/media` | 后台管理媒体条目（需分类参数与令牌）|
| GET/POST/PUT/DELETE | `/api/admin/daily` | 后台管理日常动态 |

所有 API 默认允许跨域访问（简单 CORS），便于未来接入第三方前端或小程序。

## 自定义数据

- **博客文章**：修改 `data/blog.json`，支持多段正文。可根据需要添加 `coverImage` 并在 `public/assets/` 放置图片。
- **书影音剧游条目**：编辑 `data/media.json`。每个条目允许填写 `links`，只要提供对应平台链接，服务端就会尝试爬取评分、热门短评与封面图；若抓取失败，将自动降级并保留本地信息。
- **日常动态**：编辑 `data/daily.json`，可设置心情 emoji、时间、地点与多张图片。

修改数据文件后无需重启即可生效（服务端每次请求都会读取最新 JSON，外部抓取结果缓存 1 小时）。

## 目录结构

```
├── data
│   ├── blog.json          # 学习博客配置
│   ├── daily.json         # 日常动态配置
│   └── media.json         # 书影音剧游条目配置
├── public
│   ├── app.js             # 前端逻辑（模块化原生 JS）
│   ├── index.html         # 主页（个人简介）
│   ├── study.html         # 学习板块页面
│   ├── media.html         # 书影音剧游页面
│   ├── daily.html         # 日常板块页面
│   └── styles.css         # 全站样式
├── admin
│   ├── app.js             # 图形化管理后台逻辑
│   ├── index.html         # 后台页面骨架
│   └── styles.css         # 后台样式
├── server.js              # Node.js 服务端（静态资源 + API + 外部数据抓取）
└── README.md
```

## 注意事项

- 外部平台内容抓取依赖公开网页，若访问受限或页面结构变动，可能导致无法获取评分/短评。服务端会记录错误并返回本地数据，前端会自动回退。
- 默认未包含真实图片素材，可在 `public/assets` 目录放置同名文件以获得更好的视觉效果。
- 若部署在内网或无外网访问权限的环境，外部评分与短评部分将保持为空，不影响网站其他功能。
