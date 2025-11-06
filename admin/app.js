const state = {
  token: localStorage.getItem('adminToken') || '',
  blogs: [],
  media: {},
  daily: [],
  activeSection: 'blogs',
  activeMediaCategory: 'books',
  isAuthenticated: false
};

const sections = {
  blogs: document.getElementById('blogs-section'),
  media: document.getElementById('media-section'),
  daily: document.getElementById('daily-section')
};

const navButtons = Array.from(document.querySelectorAll('.nav-button'));
const statusBar = document.getElementById('status-bar');
const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const changeTokenButton = document.getElementById('change-token');
const addBlogButton = document.getElementById('add-blog');
const addDailyButton = document.getElementById('add-daily');
const addMediaButton = document.getElementById('add-media');
const mediaCategorySelect = document.getElementById('media-category-select');
const blogsList = document.getElementById('blogs-list');
const dailyList = document.getElementById('daily-list');
const mediaList = document.getElementById('media-list');

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    return match ? match[1] : '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function fetchWithAuth(endpoint, options = {}) {
  const headers = Object.assign({ 'X-Admin-Token': state.token }, options.headers || {});
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, { ...options, headers });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const data = await response.json();
      if (data && data.message) {
        message = data.message;
      }
    } catch (error) {
      // ignore
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function loadDatasets() {
  const [blogs, media, daily] = await Promise.all([
    fetchWithAuth('/api/admin/blog'),
    fetchWithAuth('/api/admin/media'),
    fetchWithAuth('/api/admin/daily')
  ]);
  state.blogs = ensureArray(blogs);
  state.media = media || {};
  state.daily = ensureArray(daily);
  const categories = Object.keys(state.media);
  if (!categories.includes(state.activeMediaCategory) && categories.length > 0) {
    state.activeMediaCategory = categories[0];
  }
  renderAll();
}

function showLogin(message) {
  state.isAuthenticated = false;
  loginSection.hidden = false;
  Object.values(sections).forEach((section) => {
    section.hidden = true;
  });
  statusBar.hidden = true;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  } else {
    loginError.hidden = true;
  }
}

function hideLogin() {
  loginSection.hidden = true;
  loginError.hidden = true;
  state.isAuthenticated = true;
  setActiveSection(state.activeSection);
}

function setActiveSection(section) {
  state.activeSection = section;
  Object.entries(sections).forEach(([key, el]) => {
    el.hidden = key !== section;
  });
  navButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === section);
  });
}

function showStatus(message, type = 'info') {
  statusBar.textContent = message;
  statusBar.className = `status status--${type}`;
  statusBar.hidden = false;
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusBar.hidden = true;
  }, 4000);
}

function createBlogCard(blog, { isNew = false } = {}) {
  const details = document.createElement('details');
  details.className = 'form-card';
  if (isNew) {
    details.open = true;
  }

  const summary = document.createElement('summary');
  summary.textContent = isNew ? '新增文章' : blog.title || blog.id;
  details.appendChild(summary);

  const form = document.createElement('form');
  form.className = 'form';
  form.innerHTML = `
    <div class="form__grid">
      <label class="form__field">
        <span>文章 ID</span>
        <input name="id" value="${escapeHtml(blog.id || '')}" placeholder="可留空，自动生成" />
      </label>
      <label class="form__field">
        <span>标题</span>
        <input name="title" value="${escapeHtml(blog.title || '')}" required />
      </label>
      <label class="form__field">
        <span>发布日期</span>
        <input type="date" name="date" value="${escapeHtml(blog.date || '')}" />
      </label>
      <label class="form__field">
        <span>封面图片</span>
        <input name="coverImage" value="${escapeHtml(blog.coverImage || '')}" placeholder="/assets/blog/example.jpg" />
      </label>
    </div>
    <label class="form__field">
      <span>标签（使用逗号分隔）</span>
      <input name="tags" value="${escapeHtml((blog.tags || []).join(', '))}" />
    </label>
    <label class="form__field">
      <span>摘要</span>
      <textarea name="summary">${escapeHtml(blog.summary || '')}</textarea>
    </label>
    <label class="form__field">
      <span>正文段落（每行一段）</span>
      <textarea name="content">${escapeHtml((blog.content || []).join('\n'))}</textarea>
    </label>
    <div class="form__actions">
      <button type="submit" class="primary">${isNew ? '创建文章' : '保存修改'}</button>
      ${isNew ? '' : '<button type="button" class="danger" data-action="delete">删除文章</button>'}
    </div>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      id: formData.get('id')?.trim() || undefined,
      title: formData.get('title')?.trim(),
      date: formData.get('date')?.trim() || undefined,
      coverImage: formData.get('coverImage')?.trim() || undefined,
      tags: splitList(formData.get('tags')),
      summary: formData.get('summary')?.trim() || '',
      content: splitLines(formData.get('content'))
    };

    try {
      if (isNew) {
        await fetchWithAuth('/api/admin/blog', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showStatus('新增文章成功', 'success');
      } else {
        await fetchWithAuth(`/api/admin/blog/${encodeURIComponent(blog.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showStatus('文章已更新', 'success');
      }
      await loadDatasets();
    } catch (error) {
      showStatus(error.message || '保存失败', 'error');
    }
  });

  if (!isNew) {
    const deleteButton = form.querySelector('[data-action="delete"]');
    deleteButton.addEventListener('click', async () => {
      if (!confirm('确定要删除该文章吗？')) {
        return;
      }
      try {
        await fetchWithAuth(`/api/admin/blog/${encodeURIComponent(blog.id)}`, {
          method: 'DELETE'
        });
        showStatus('文章已删除', 'success');
        await loadDatasets();
      } catch (error) {
        showStatus(error.message || '删除失败', 'error');
      }
    });
  }

  details.appendChild(form);
  return details;
}

function createDailyCard(entry, { isNew = false } = {}) {
  const details = document.createElement('details');
  details.className = 'form-card';
  if (isNew) {
    details.open = true;
  }

  const summary = document.createElement('summary');
  summary.textContent = isNew ? '新增动态' : `${entry.timestamp || entry.id}`;
  details.appendChild(summary);

  const form = document.createElement('form');
  form.className = 'form';
  form.innerHTML = `
    <div class="form__grid">
      <label class="form__field">
        <span>动态 ID</span>
        <input name="id" value="${escapeHtml(entry.id || '')}" placeholder="可留空，自动生成" />
      </label>
      <label class="form__field">
        <span>发布时间</span>
        <input type="datetime-local" name="timestamp" value="${escapeHtml(formatDateTimeLocal(entry.timestamp))}" />
      </label>
      <label class="form__field">
        <span>位置</span>
        <input name="location" value="${escapeHtml(entry.location || '')}" />
      </label>
      <label class="form__field">
        <span>心情/表情</span>
        <input name="mood" value="${escapeHtml(entry.mood || '')}" placeholder="😀 / ☕️ 等" />
      </label>
    </div>
    <label class="form__field">
      <span>平台</span>
      <input name="platform" value="${escapeHtml(entry.platform || '')}" placeholder="朋友圈 / QQ 说说" />
    </label>
    <label class="form__field">
      <span>文字内容</span>
      <textarea name="content">${escapeHtml(entry.content || '')}</textarea>
    </label>
    <label class="form__field">
      <span>图片地址（每行一条）</span>
      <textarea name="images">${escapeHtml((entry.images || []).join('\n'))}</textarea>
    </label>
    <div class="form__actions">
      <button type="submit" class="primary">${isNew ? '创建动态' : '保存修改'}</button>
      ${isNew ? '' : '<button type="button" class="danger" data-action="delete">删除动态</button>'}
    </div>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      id: formData.get('id')?.trim() || undefined,
      timestamp: formData.get('timestamp')?.trim() || undefined,
      location: formData.get('location')?.trim() || '',
      mood: formData.get('mood')?.trim() || '',
      platform: formData.get('platform')?.trim() || '',
      content: formData.get('content')?.trim() || '',
      images: splitLines(formData.get('images'))
    };

    try {
      if (isNew) {
        await fetchWithAuth('/api/admin/daily', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showStatus('新增动态成功', 'success');
      } else {
        await fetchWithAuth(`/api/admin/daily/${encodeURIComponent(entry.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showStatus('动态已更新', 'success');
      }
      await loadDatasets();
    } catch (error) {
      showStatus(error.message || '保存失败', 'error');
    }
  });

  if (!isNew) {
    const deleteButton = form.querySelector('[data-action="delete"]');
    deleteButton.addEventListener('click', async () => {
      if (!confirm('确定要删除该动态吗？')) {
        return;
      }
      try {
        await fetchWithAuth(`/api/admin/daily/${encodeURIComponent(entry.id)}`, {
          method: 'DELETE'
        });
        showStatus('动态已删除', 'success');
        await loadDatasets();
      } catch (error) {
        showStatus(error.message || '删除失败', 'error');
      }
    });
  }

  details.appendChild(form);
  return details;
}

function createMediaCard(item, { isNew = false } = {}) {
  const details = document.createElement('details');
  details.className = 'form-card';
  if (isNew) {
    details.open = true;
  }

  const summary = document.createElement('summary');
  summary.textContent = isNew ? '新增条目' : item.title || item.id;
  details.appendChild(summary);

  const form = document.createElement('form');
  form.className = 'form';
  form.innerHTML = `
    <div class="form__grid">
      <label class="form__field">
        <span>条目 ID</span>
        <input name="id" value="${escapeHtml(item.id || '')}" placeholder="可留空自动生成" />
      </label>
      <label class="form__field">
        <span>标题</span>
        <input name="title" value="${escapeHtml(item.title || '')}" required />
      </label>
      <label class="form__field">
        <span>创作者（用逗号分隔）</span>
        <input name="creators" value="${escapeHtml((item.creators || []).join(', '))}" />
      </label>
      <label class="form__field">
        <span>封面图片</span>
        <input name="coverImage" value="${escapeHtml(item.coverImage || '')}" placeholder="/assets/media/..." />
      </label>
      <label class="form__field">
        <span>个人评分</span>
        <input type="number" step="0.1" min="0" max="10" name="personalRating" value="${escapeHtml(String(item.personalRating ?? ''))}" />
      </label>
      <label class="form__field">
        <span>平台：豆瓣</span>
        <input name="link-douban" value="${escapeHtml(item.links?.douban || '')}" placeholder="https://" />
      </label>
      <label class="form__field">
        <span>平台：IMDb</span>
        <input name="link-imdb" value="${escapeHtml(item.links?.imdb || '')}" placeholder="https://" />
      </label>
      <label class="form__field">
        <span>平台：IGN</span>
        <input name="link-ign" value="${escapeHtml(item.links?.ign || '')}" placeholder="https://" />
      </label>
    </div>
    <label class="form__field">
      <span>概要</span>
      <textarea name="summary">${escapeHtml(item.summary || '')}</textarea>
    </label>
    <label class="form__field">
      <span>个人评价</span>
      <textarea name="personalReview">${escapeHtml(item.personalReview || '')}</textarea>
    </label>
    <div class="form__actions">
      <button type="submit" class="primary">${isNew ? '创建条目' : '保存修改'}</button>
      ${isNew ? '' : '<button type="button" class="danger" data-action="delete">删除条目</button>'}
    </div>
  `;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      id: formData.get('id')?.trim() || undefined,
      title: formData.get('title')?.trim(),
      creators: splitList(formData.get('creators')),
      coverImage: formData.get('coverImage')?.trim() || undefined,
      personalRating: formData.get('personalRating')?.trim(),
      personalReview: formData.get('personalReview')?.trim() || '',
      summary: formData.get('summary')?.trim() || '',
      links: {
        douban: formData.get('link-douban')?.trim() || undefined,
        imdb: formData.get('link-imdb')?.trim() || undefined,
        ign: formData.get('link-ign')?.trim() || undefined
      }
    };

    const ratingValue = payload.personalRating;
    if (ratingValue === undefined || ratingValue === '') {
      delete payload.personalRating;
    } else {
      const numeric = Number(ratingValue);
      if (Number.isFinite(numeric)) {
        payload.personalRating = numeric;
      } else {
        delete payload.personalRating;
      }
    }

    Object.keys(payload.links).forEach((key) => {
      if (!payload.links[key]) {
        delete payload.links[key];
      }
    });

    const category = state.activeMediaCategory;

    try {
      if (isNew) {
        await fetchWithAuth(`/api/admin/media/${encodeURIComponent(category)}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showStatus('新增条目成功', 'success');
      } else {
        await fetchWithAuth(`/api/admin/media/${encodeURIComponent(category)}/${encodeURIComponent(item.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showStatus('条目已更新', 'success');
      }
      await loadDatasets();
    } catch (error) {
      showStatus(error.message || '保存失败', 'error');
    }
  });

  if (!isNew) {
    const deleteButton = form.querySelector('[data-action="delete"]');
    deleteButton.addEventListener('click', async () => {
      if (!confirm('确定要删除该条目吗？')) {
        return;
      }
      try {
        const category = state.activeMediaCategory;
        await fetchWithAuth(`/api/admin/media/${encodeURIComponent(category)}/${encodeURIComponent(item.id)}`, {
          method: 'DELETE'
        });
        showStatus('条目已删除', 'success');
        await loadDatasets();
      } catch (error) {
        showStatus(error.message || '删除失败', 'error');
      }
    });
  }

  details.appendChild(form);
  return details;
}

function renderBlogs() {
  blogsList.innerHTML = '';
  state.blogs.forEach((blog) => {
    blogsList.appendChild(createBlogCard(blog));
  });
}

function renderDaily() {
  dailyList.innerHTML = '';
  state.daily.forEach((entry) => {
    dailyList.appendChild(createDailyCard(entry));
  });
}

function renderMedia() {
  mediaList.innerHTML = '';
  const category = state.activeMediaCategory;
  const items = state.media[category] || [];
  items.forEach((item) => {
    mediaList.appendChild(createMediaCard(item));
  });
}

function renderMediaCategorySelect() {
  mediaCategorySelect.innerHTML = '';
  Object.keys(state.media).forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    if (category === state.activeMediaCategory) {
      option.selected = true;
    }
    mediaCategorySelect.appendChild(option);
  });
}

function renderAll() {
  renderBlogs();
  renderDaily();
  renderMediaCategorySelect();
  renderMedia();
}

function bindEvents() {
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const { section } = button.dataset;
      setActiveSection(section);
    });
  });

  changeTokenButton.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    state.token = '';
    showLogin();
  });

  addBlogButton.addEventListener('click', () => {
    const card = createBlogCard({}, { isNew: true });
    blogsList.prepend(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  addDailyButton.addEventListener('click', () => {
    const card = createDailyCard({}, { isNew: true });
    dailyList.prepend(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  addMediaButton.addEventListener('click', () => {
    const card = createMediaCard({}, { isNew: true });
    mediaList.prepend(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  mediaCategorySelect.addEventListener('change', () => {
    state.activeMediaCategory = mediaCategorySelect.value;
    renderMedia();
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const token = formData.get('token').trim();
    if (!token) {
      showLogin('请输入访问令牌');
      return;
    }
    state.token = token;
    try {
      await loadDatasets();
      localStorage.setItem('adminToken', token);
      hideLogin();
      showStatus('已成功登录后台', 'success');
    } catch (error) {
      state.token = '';
      localStorage.removeItem('adminToken');
      showLogin(error.message || '验证失败');
    }
  });
}

async function bootstrap() {
  bindEvents();
  if (state.token) {
    try {
      await loadDatasets();
      hideLogin();
      showStatus('已使用本地令牌自动登录', 'info');
    } catch (error) {
      state.token = '';
      localStorage.removeItem('adminToken');
      showLogin('存储的令牌已失效，请重新登录');
    }
  } else {
    showLogin();
  }
}

bootstrap();
