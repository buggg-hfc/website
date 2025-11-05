const categoryLabels = {
  books: '书籍',
  movies: '电影',
  anime: '番剧',
  music: '音乐',
  games: '游戏',
  theater: '戏剧'
};

const platformLabels = {
  douban: '豆瓣',
  imdb: 'IMDb',
  ign: 'IGN'
};

const state = {
  blogs: [],
  media: {},
  daily: [],
  activeCategory: 'books'
};

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function decodeHTML(str) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = str;
  return textarea.value;
}

function createBlogCard(post) {
  const card = document.createElement('article');
  card.className = 'blog-card';

  const header = document.createElement('div');
  header.className = 'blog-card__meta';
  header.innerHTML = `<span>${formatDate(post.date)}</span><span>${post.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}</span>`;

  const title = document.createElement('h3');
  title.textContent = post.title;

  const summary = document.createElement('p');
  summary.className = 'blog-card__summary';
  summary.textContent = post.summary;

  const content = document.createElement('div');
  content.className = 'blog-card__content';
  post.content.forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    content.appendChild(p);
  });

  card.append(header, title, summary, content);
  return card;
}

function renderBlogs() {
  const container = document.getElementById('blog-grid');
  container.innerHTML = '';
  state.blogs.forEach((post) => {
    container.appendChild(createBlogCard(post));
  });
}

function createMediaCard(item) {
  const card = document.createElement('article');
  card.className = 'media-card';

  const header = document.createElement('div');
  header.className = 'media-card__header';

  const cover = document.createElement('div');
  cover.className = 'media-card__cover';
  if (item.coverImage) {
    cover.style.backgroundImage = `url('${item.coverImage}')`;
  }

  const titleWrapper = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'media-card__title';
  title.textContent = item.title;
  const creators = document.createElement('div');
  creators.className = 'media-card__creators';
  creators.textContent = item.creators?.join(' / ') ?? '';
  titleWrapper.append(title, creators);

  header.append(cover, titleWrapper);

  const summary = document.createElement('p');
  summary.className = 'media-card__summary';
  summary.textContent = item.summary;

  const personal = document.createElement('div');
  personal.className = 'media-card__personal';
  personal.innerHTML = `
    <div>个人评分</div>
    <strong>${item.personalRating ?? '—'}</strong>
    <p>${item.personalReview ?? ''}</p>
  `;

  const links = document.createElement('div');
  links.className = 'media-card__links';
  if (item.links) {
    Object.entries(item.links).forEach(([platform, href]) => {
      const link = document.createElement('a');
      link.className = 'media-card__link';
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = platformLabels[platform] || platform;
      links.appendChild(link);
    });
  }

  card.append(header, summary, personal, links);

  if (item.remote) {
    Object.entries(item.remote).forEach(([platform, meta]) => {
      if (!meta) return;
      const block = document.createElement('div');
      block.className = 'metadata-block';
      block.innerHTML = `<h4>${platformLabels[platform] || platform} 平台</h4>`;

      if (meta.rating) {
        const rating = document.createElement('div');
        rating.className = 'metadata-block__rating';
        rating.innerHTML = `<strong>${meta.rating}</strong><span>/${meta.scale ?? 10}</span><span>${meta.votes ? `${meta.votes} 人评价` : ''}</span>`;
        block.appendChild(rating);
      }

      if (meta.summary) {
        const summaryEl = document.createElement('p');
        summaryEl.textContent = meta.summary;
        block.appendChild(summaryEl);
      }

      if (Array.isArray(meta.hotComments) && meta.hotComments.length > 0) {
        const commentList = document.createElement('div');
        commentList.className = 'metadata-block__comments';
        meta.hotComments.forEach((comment) => {
          const commentEl = document.createElement('div');
          commentEl.className = 'metadata-comment';

          const author = document.createElement('div');
          author.className = 'metadata-comment__author';
          author.innerHTML = `${comment.author ? `<span>${decodeHTML(comment.author)}</span>` : '<span>热评</span>'}${comment.votes ? `<span>· ${comment.votes} 赞</span>` : ''}`;

          const content = document.createElement('div');
          content.className = 'metadata-comment__content';
          content.textContent = comment.content;

          commentEl.append(author, content);
          commentList.appendChild(commentEl);
        });
        block.appendChild(commentList);
      }

      card.appendChild(block);
    });
  }

  return card;
}

function renderMedia(category) {
  state.activeCategory = category;
  const container = document.getElementById('media-cards');
  container.innerHTML = '';
  const items = state.media[category] ?? [];
  if (items.length === 0) {
    container.innerHTML = '<p>暂无条目，欢迎稍后再来。</p>';
    return;
  }
  items.forEach((item) => container.appendChild(createMediaCard(item)));
}

function setActiveTab(category) {
  document.querySelectorAll('.media-tab').forEach((tab) => {
    const isActive = tab.dataset.category === category;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

function createDailyCard(post) {
  const card = document.createElement('article');
  card.className = 'daily-card';

  const header = document.createElement('div');
  header.className = 'daily-card__header';
  header.innerHTML = `<span>${post.mood ?? '☀️'} ${post.platform ?? ''}</span><span>${formatDateTime(post.timestamp)}</span>`;

  const location = document.createElement('div');
  location.className = 'daily-card__location';
  location.textContent = post.location ? `📍 ${post.location}` : '';

  const content = document.createElement('div');
  content.className = 'daily-card__content';
  content.textContent = post.content;

  card.append(header, location, content);

  if (post.images && post.images.length > 0) {
    const gallery = document.createElement('div');
    gallery.className = 'daily-card__images';
    post.images.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${post.id} 配图`;
      gallery.appendChild(img);
    });
    card.appendChild(gallery);
  }

  return card;
}

function renderDaily() {
  const container = document.getElementById('daily-feed');
  container.innerHTML = '';
  state.daily.forEach((post) => container.appendChild(createDailyCard(post)));
}

function attachEvents() {
  document.querySelectorAll('.media-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const category = tab.dataset.category;
      setActiveTab(category);
      renderMedia(category);
    });
  });
}

async function bootstrap() {
  const year = document.getElementById('current-year');
  year.textContent = new Date().getFullYear();

  attachEvents();

  try {
    const [blogs, media, daily] = await Promise.all([
      fetchJSON('/api/blog'),
      fetchJSON('/api/media'),
      fetchJSON('/api/daily')
    ]);

    state.blogs = blogs;
    state.media = media;
    state.daily = daily;

    renderBlogs();
    setActiveTab(state.activeCategory);
    renderMedia(state.activeCategory);
    renderDaily();
  } catch (error) {
    console.error('初始化失败', error);
    const main = document.querySelector('main');
    const message = document.createElement('p');
    message.textContent = '内容加载失败，请稍后刷新页面。';
    main.prepend(message);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
