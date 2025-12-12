const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const OpenAI = require('openai');
const cron = require('node-cron');
const moment = require('moment');
require('dotenv').config();
const cheerio = require('cheerio');

// Removed OpenRouter - now using Google Gemini for AI features

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'twitter-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static('public'));

// Config file path
const CONFIG_FILE = path.join(__dirname, 'twitter-config.json');

// OpenRouter AI client
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// OpenRouter API key constant
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// Scheduled tweets storage (server-side scheduling since Twitter API v2 doesn't support native scheduling)
let scheduledTweets = [];
let scheduledJobs = new Map();

// Load Twitter config
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      appKey: '',
      appSecret: '',
      accessToken: '',
      accessSecret: ''
    };
  }
}

// Save Twitter config
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Check if Twitter keys are configured
function hasTwitterKeys(config) {
  return !!(config.appKey && config.appSecret && config.accessToken && config.accessSecret);
}

// Create Twitter client
function createTwitterClient(config) {
  return new TwitterApi({
    appKey: config.appKey,
    appSecret: config.appSecret,
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
  });
}

// Generate Chinese content based on title using AI
async function generateChineseContentFromTitle(title) {
  try {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
      throw new Error('Chưa cấu hình OpenRouter API key');
    }

    const prompt = `根据以下标题，创作完整的Twitter推广内容。包含三部分：

1. 主要推广文案（25-35字）：围绕标题具体内容，体现关键元素，使用1-2个emoji
2. 访问链接文案（15-20字）：创意地引导访问6868.run，不要用"更多精彩内容请访问"
3. 热门标签（3-5个）：相关的中文hashtag，有助于上热搜

标题: "${title}"

请按以下格式返回：
[推广文案]

[访问链接文案] 6868.run

[hashtag1] [hashtag2] [hashtag3] [hashtag4] [hashtag5]`;

    const completion = await openai.chat.completions.create({
      model: "anthropic/claude-3-haiku",
      messages: [
        {
          role: "system",
          content: "你是一位专业的中文社交媒体营销专家，擅长创作Twitter推广内容。你需要创作包含推广文案、创意链接引导和热门hashtag的完整内容。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    const content = completion.choices[0].message.content.trim();
    console.log('✅ AI生成内容:', content);
    return content;
  } catch (error) {
    console.error('❌ Lỗi tạo nội dung AI:', error);
    
    // Fallback to smart template if AI fails
    let mainContent = '';
    let callToAction = '';
    let hashtags = '';
    
    if (title.includes('魔物') || title.includes('喵')) {
      mainContent = '🐱 可爱魔物系少女！二次元与现实完美结合';
      callToAction = '🎮 进入二次元世界';
      hashtags = '#魔物娘 #二次元 #可爱 #写真 #ACG';
    } else if (title.includes('セクシー') || title.includes('sexy')) {
      mainContent = '� 性感！魅力无法抵挡！高清写真展现迷人身姿';
      callToAction = '💕 感受极致魅力';
      hashtags = '#性感 #魅力 #写真 #美女 #诱惑';
    } else if (title.includes('骨感') || title.includes('纤细')) {
      mainContent = '✨ 纤细身材的极致诱惑！完美骨感美展现独特气质';
      callToAction = '🌸 欣赏完美身材';
      hashtags = '#骨感美 #纤细 #身材 #写真 #气质';
    } else if (title.includes('後入') || title.includes('冲击')) {
      mainContent = '💥 震撼视觉冲击！独特拍摄角度带来全新体验';
      callToAction = '⚡ 体验视觉震撼';
      hashtags = '#视觉冲击 #震撼 #艺术 #摄影 #独特';
    } else if (title.match(/\d+P/)) {
      const pageCount = title.match(/(\d+)P/)[1];
      mainContent = `📸 ${pageCount}张精选写真！高清画质完美呈现`;
      callToAction = '📱 立即查看全集';
      hashtags = '#写真集 #高清 #精选 #完整版 #收藏';
    } else {
      const templates = [
        {
          main: '🌟 精品写真新作！超清画质展现完美魅力',
          cta: '✨ 发现更多精品',
          tags: '#精品 #写真 #新作 #高清 #魅力'
        },
        {
          main: '🔥 热门推荐系列！专业团队倾力打造',
          cta: '🎯 查看热门内容',
          tags: '#热门 #推荐 #专业 #精制 #系列'
        },
        {
          main: '💎 珍藏级精美作品！独特艺术魅力',
          cta: '💫 收藏珍品内容',
          tags: '#珍藏 #艺术 #精美 #独特 #作品'
        }
      ];
      const selected = templates[Math.floor(Math.random() * templates.length)];
      mainContent = selected.main;
      callToAction = selected.cta;
      hashtags = selected.tags;
    }
    
    const fullContent = `${mainContent}\n\n${callToAction} 6868.run\n\n${hashtags}`;
    console.log('⚠️ AI失败，使用智能模板:', fullContent);
    return fullContent;
  }
}

// Schedule tweet function using server-side cron job (Twitter API v2 doesn't support native scheduling)
function scheduleTweet(tweetData, scheduledTime) {
  const tweetId = Date.now() + Math.random();
  
  // Parse scheduled time
  const scheduleDate = new Date(scheduledTime);
  const now = new Date();
  
  // Check if time is in the future
  if (scheduleDate <= now) {
    console.error('❌ Thời gian lập lịch phải trong tương lai:', scheduleDate, 'hiện tại:', now);
    throw new Error('Thời gian lập lịch phải trong tương lai');
  }
  
  // Create cron format: second minute hour day month dayOfWeek
  const cronTime = `${scheduleDate.getSeconds()} ${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
  
  console.log('📅 Lập lịch tweet (server-side):', {
    id: tweetId,
    scheduledTime: scheduleDate.toLocaleString('vi-VN'),
    cronFormat: cronTime,
    content: tweetData.text.substring(0, 50) + '...',
    timeUntil: Math.round((scheduleDate.getTime() - now.getTime()) / 1000 / 60) + ' phút'
  });

  // Tạo cron job
  const job = cron.schedule(cronTime, async () => {
    try {
      console.log('🚀 Đang đăng tweet theo lịch:', tweetId, 'vào lúc:', new Date().toLocaleString('vi-VN'));
      await postScheduledTweet(tweetData);
      
      // Xóa job sau khi hoàn thành
      scheduledJobs.delete(tweetId);
      scheduledTweets = scheduledTweets.filter(t => t.id !== tweetId);
      console.log('✅ Đã hoàn thành và xóa job:', tweetId);
      
    } catch (error) {
      console.error('❌ Lỗi đăng tweet theo lịch:', tweetId, error);
    }
  }, {
    scheduled: true, // Start immediately
    timezone: 'Asia/Ho_Chi_Minh' // Set timezone
  });

  // Lưu thông tin
  const scheduledTweet = {
    id: tweetId,
    ...tweetData,
    scheduledTime: scheduledTime,
    status: 'scheduled',
    createdAt: new Date(),
    cronFormat: cronTime
  };

  scheduledTweets.push(scheduledTweet);
  scheduledJobs.set(tweetId, job);
  
  console.log('✅ Đã tạo cron job thành công:', tweetId);
  
  return tweetId;
}

// Post scheduled tweet
async function postScheduledTweet(tweetData) {
  const config = await loadConfig();
  if (!hasTwitterKeys(config)) {
    throw new Error('Chưa cấu hình khóa Twitter');
  }

  const client = createTwitterClient(config);
  let mediaIds = [];
  
  // Handle images if any - upload directly without saving
  if (tweetData.imageUrls && tweetData.imageUrls.length > 0) {
    for (const url of tweetData.imageUrls.slice(0, 4)) {
      try {
        console.log('⏳ Đang upload ảnh trực tiếp từ URL (scheduled):', url);
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Upload directly to Twitter without saving to disk
        const mediaId = await client.v1.uploadMedia(Buffer.from(response.data));
        mediaIds.push(mediaId);
        console.log('✅ Đã upload ảnh trực tiếp lên Twitter (scheduled), Media ID:', mediaId);
        
      } catch (error) {
        console.error('❌ Lỗi xử lý ảnh trong tweet lập lịch:', error);
        // Continue with other images if one fails
      }
    }
  }

  // Post tweet
  const tweetOptions = { text: tweetData.text };
  if (mediaIds.length > 0) {
    tweetOptions.media = { media_ids: mediaIds };
  }
  
  const tweet = await client.v2.tweet(tweetOptions);
  console.log('✅ Đã đăng tweet theo lịch thành công! Tweet ID:', tweet.data.id);
  
  return tweet;
}



// Fetch page data with titles and images from API
async function fetchPageDataFromAPI(apiUrl) {
  try {
    console.log('📡 Đang lấy dữ liệu từ API:', apiUrl);
    const response = await axios.get(apiUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    console.log('📋 Cấu trúc API response:', Object.keys(response.data));
    
    let articles = [];
    
    // Kiểm tra cấu trúc API cụ thể cho beiyong.slapibf.com
    if (response.data.list && Array.isArray(response.data.list)) {
      console.log('✅ Tìm thấy field "list" với', response.data.list.length, 'items');
      articles = response.data.list.map(item => {
        const title = item.art_name || item.title || item.name || item.headline || 'Không có tiêu đề';
        
        // Lấy hình ảnh từ nhiều nguồn
        let images = [];
        
        // 1. Từ art_pic
        if (item.art_pic) {
          if (typeof item.art_pic === 'string') {
            // Nếu là string, có thể chứa nhiều URL phân cách bởi dấu phẩy, |, hoặc xuống dòng
            const imageUrls = item.art_pic.split(/[,|\n]/).map(url => url.trim()).filter(url => url && url.startsWith('http'));
            images = images.concat(imageUrls);
          } else if (Array.isArray(item.art_pic)) {
            images = images.concat(item.art_pic.filter(url => url && url.startsWith('http')));
          }
        }
        
        // 2. Từ art_content (tìm URL ảnh trong nội dung)
        if (item.art_content) {
          const imgMatches = item.art_content.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)/gi) || [];
          images = images.concat(imgMatches);
        }
        
        // 3. Từ các field khác có thể chứa ảnh
        ['art_thumb', 'art_logo', 'art_cover', 'thumb', 'cover', 'image'].forEach(field => {
          if (item[field] && typeof item[field] === 'string' && item[field].startsWith('http')) {
            images.push(item[field]);
          }
        });
        
        // Loại bỏ duplicate và lấy tối đa 4 ảnh
        images = [...new Set(images)].slice(0, 4);
        
        console.log(`📸 Bài "${title.substring(0, 30)}..." có ${images.length} ảnh:`, images.slice(0, 2));
        
        return {
          title: title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
          images: images,
          originalData: item
        };
      });
    } else {
      throw new Error('API không trả về cấu trúc dữ liệu mong đợi');
    }
    
    console.log('📝 Đã lấy được', articles.length, 'bài viết');
    console.log('📋 Bài viết đầu tiên:', articles[0]?.title, '- Số ảnh:', articles[0]?.images?.length || 0);
    
    return articles;
  } catch (error) {
    console.error('❌ Lỗi lấy dữ liệu từ API:', error);
    throw new Error('Không thể lấy dữ liệu từ API: ' + error.message);
  }
}

// Fetch first article from an external API URL and extract title + image URLs
async function fetchFirstArticleFromApi(apiUrl) {
  const res = await axios.get(apiUrl, { timeout: 15000 });
  const body = res.data;

  // Try to find an object that contains art_name and art_content
  function findArticle(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.art_name && obj.art_content) return obj;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (Array.isArray(v)) {
        for (const item of v) {
          const found = findArticle(item);
          if (found) return found;
        }
      } else if (typeof v === 'object') {
        const found = findArticle(v);
        if (found) return found;
      }
    }
    return null;
  }

  const article = findArticle(body);
  if (!article) throw new Error('Không tìm thấy bài viết (art_name / art_content) trong phản hồi API');

  const artName = article.art_name;
  const artContent = article.art_content || '';

  // Parse HTML and extract image src attributes
  const $ = cheerio.load(artContent);
  const imgs = [];
  $('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src) imgs.push(src);
  });

  // Return title and up to 4 image URLs
  return {
    art_name: artName,
    imageUrls: imgs.slice(0, 4)
  };
}

// Read content from DOCX files
async function getContentFromDocx() {
  try {
    const docxDir = path.join(__dirname, 'docx');
    const files = await fs.readdir(docxDir);
    const docxFiles = files.filter(f => f.endsWith('.docx'));
    
    if (docxFiles.length === 0) {
      throw new Error('Không tìm thấy file DOCX nào');
    }

    // For now, we'll return a placeholder
    // You can integrate mammoth.js or docx library to extract text
    const fileName = docxFiles[0];
    return {
      fileName,
      content: `Nội dung tự động từ file ${fileName}. Đây là bài viết được tạo tự động từ hệ thống.`
    };
  } catch (error) {
    throw new Error(`Lỗi đọc file DOCX: ${error.message}`);
  }
}





// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Twitter Auto Post System</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 500px;
        }
        h1 { color: #1da1f2; margin-bottom: 20px; font-size: 32px; }
        p { color: #666; margin-bottom: 30px; line-height: 1.6; }
        .links { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        a {
          padding: 14px 28px;
          background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 600;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3);
        }
        a:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(29, 161, 242, 0.4);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🐦 Twitter Auto Post</h1>
        <p>Hệ thống tự động đăng bài lên Twitter từ file DOCX</p>
        <div class="links">
          <a href="/twitter">⚙️ Quản lý Twitter</a>
          <a href="/docx">📄 Xem DOCX</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/twitter', async (req, res) => {
  const cfg = await loadConfig();
  res.render('twitter', {
    title: 'Quản lý Twitter',
    cfg,
    hasKeys: hasTwitterKeys(cfg)
  });
});

app.get('/docx', async (req, res) => {
  try {
    const docxDir = path.join(__dirname, 'docx');
    await fs.mkdir(docxDir, { recursive: true });
    const files = await fs.readdir(docxDir);
    const docxFiles = files.filter(f => f.endsWith('.docx'));
    
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Danh sách DOCX</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container { max-width: 800px; margin: 0 auto; }
          .header {
            background: white;
            padding: 24px;
            border-radius: 16px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          h1 { color: #1da1f2; margin-bottom: 12px; }
          .file-list {
            background: white;
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .file-item {
            padding: 16px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .file-item:last-child { border-bottom: none; }
          .file-name { font-weight: 500; color: #333; }
          .btn {
            padding: 8px 16px;
            background: #1da1f2;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 Danh sách file DOCX</h1>
            <a href="/" style="color: #666; text-decoration: none;">← Quay lại</a>
          </div>
          <div class="file-list">
            ${docxFiles.length ? docxFiles.map(f => `
              <div class="file-item">
                <span class="file-name">📄 ${f}</span>
                <a href="#" class="btn">Xem nội dung</a>
              </div>
            `).join('') : '<p style="text-align: center; color: #666;">Chưa có file DOCX nào trong thư mục /docx</p>'}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Lỗi: ' + error.message);
  }
});

// API: Save Twitter keys
app.post('/api/twitter/keys', async (req, res) => {
  try {
    const { appKey, appSecret, accessToken, accessSecret } = req.body;
    await saveConfig({ appKey, appSecret, accessToken, accessSecret });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Removed AI content generation endpoint

// API: Fetch page data with titles and images
app.post('/api/fetch-page-data', async (req, res) => {
  try {
    const { apiUrl } = req.body;
    
    if (!apiUrl || !apiUrl.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng nhập URL API' 
      });
    }

    const articles = await fetchPageDataFromAPI(apiUrl.trim());
    
    res.json({ 
      success: true, 
      articles: articles,
      message: `Đã lấy ${articles.length} bài viết từ API`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Generate Chinese content from title
app.post('/api/ai/generate-content', async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng cung cấp tiêu đề' 
      });
    }

    const content = await generateChineseContentFromTitle(title.trim());
    
    res.json({ 
      success: true, 
      content: content,
      message: 'Đã tạo nội dung AI thành công'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Bulk process 20 articles - fetch, generate AI content, and schedule posts
app.post('/api/bulk-process', async (req, res) => {
  try {
    const { apiUrl, page } = req.body;
    
    if (!apiUrl || !apiUrl.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng nhập URL API' 
      });
    }

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chưa cấu hình khóa Twitter' 
      });
    }

    // Step 1: Fetch 20 articles from API
    console.log('🔄 Bước 1: Lấy 20 bài từ API...');
    const fullApiUrl = `${apiUrl}&pg=${page || 1}`;
    const articles = await fetchPageDataFromAPI(fullApiUrl);
    
    if (!articles || articles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Không lấy được bài viết nào từ API' 
      });
    }

    // Take only first 20 articles
    const selectedArticles = articles.slice(0, 20);
    console.log(`✅ Đã lấy ${selectedArticles.length} bài viết`);

    // Step 2: Generate AI content for each article
    console.log('🤖 Bước 2: Tạo nội dung AI cho từng bài...');
    const processedArticles = [];
    
    for (let i = 0; i < selectedArticles.length; i++) {
      const article = selectedArticles[i];
      console.log(`🔄 Xử lý bài ${i + 1}/${selectedArticles.length}: ${article.title.substring(0, 30)}...`);
      
      try {
        // Generate AI content
        const aiContent = await generateChineseContentFromTitle(article.title);
        
        // Prepare tweet data
        const tweetData = {
          text: `${article.title}\n\n${aiContent}`,
          imageUrls: article.images.slice(0, 4) // Take first 4 images
        };
        
        processedArticles.push({
          ...article,
          aiContent: aiContent,
          tweetData: tweetData
        });
        
        console.log(`✅ Hoàn thành bài ${i + 1}`);
        
        // Small delay to avoid rate limiting
        if (i < selectedArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.error(`❌ Lỗi xử lý bài ${i + 1}:`, error);
        // Use fallback content if AI fails
        const fallbackContent = getRandomChineseContent();
        processedArticles.push({
          ...article,
          aiContent: fallbackContent,
          tweetData: {
            text: `${article.title}\n\n${fallbackContent}`,
            imageUrls: article.images.slice(0, 4)
          }
        });
      }
    }

    // Step 3: Schedule posts - 20 bài chia 5 ngày, mỗi ngày 4 bài
    console.log('📅 Bước 3: Lập lịch đăng bài...');
    const scheduleResults = await scheduleArticlesBulk(processedArticles);
    
    res.json({ 
      success: true, 
      message: `Đã xử lý và lập lịch ${processedArticles.length} bài thành công!`,
      articlesProcessed: processedArticles.length,
      scheduledTweets: scheduleResults.length,
      scheduleDetails: scheduleResults
    });

  } catch (error) {
    console.error('❌ Lỗi xử lý bulk:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Function to get random Chinese content (fallback)
function getRandomChineseContent() {
  const templates = [
    "🔥 最新热门内容！精选高质量资源，每日更新不间断。专业团队精心制作，为您带来最佳视觉体验。立即访问获取更多精彩内容！ 6868.run #热门 #精选 #高质量 #每日更新 #专业",
    "✨ 独家珍藏版本！超清画质，完整收录，绝对值得收藏。限时免费分享，机会难得不容错过。快来体验顶级品质内容！ 6868.run #独家 #珍藏 #超清 #完整 #收藏",
    "💎 VIP 专属资源！会员独享特权内容，高端定制服务。精品推荐，品质保证，满足您的所有需求。现在就来探索更多惊喜！ 6868.run #VIP #专属 #特权 #高端 #精品",
    "🎯 热门推荐系列！网友强烈推荐，口碑爆棚的优质内容。每天都有新惊喜，让您享受不一样的精彩体验。不要错过这个机会！ 6868.run #推荐 #口碑 #优质 #惊喜 #精彩",
    "🌟 精品收藏必备！经典永恒，值得反复品味的优质资源。专业制作团队倾力打造，为您呈现完美视觉盛宴。 6868.run #精品 #经典 #永恒 #专业 #完美"
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// Function to schedule articles in bulk (5 days, 4 posts per day)
async function scheduleArticlesBulk(articles) {
  const scheduleResults = [];
  const postsPerDay = 4;
  const timeSlots = ['08:00', '12:00', '17:00', '21:00']; // Sáng, trưa, chiều, tối
  
  // Start from tomorrow
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const dayOffset = Math.floor(i / postsPerDay);
    const timeSlotIndex = i % postsPerDay;
    
    // Calculate schedule time
    const scheduleDate = new Date(startDate);
    scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
    
    const [hours, minutes] = timeSlots[timeSlotIndex].split(':').map(Number);
    scheduleDate.setHours(hours, minutes, 0, 0);
    
    try {
      // Schedule the tweet
      const tweetId = scheduleTweet(article.tweetData, scheduleDate.toISOString());
      
      scheduleResults.push({
        articleIndex: i + 1,
        title: article.title.substring(0, 50) + '...',
        scheduledTime: scheduleDate.toISOString(),
        timeSlot: timeSlots[timeSlotIndex],
        day: dayOffset + 1,
        tweetId: tweetId,
        imageCount: article.tweetData.imageUrls.length
      });
      
      console.log(`📅 Đã lập lịch bài ${i + 1}: ${scheduleDate.toLocaleString('vi-VN')} (${timeSlots[timeSlotIndex]})`);
      
    } catch (error) {
      console.error(`❌ Lỗi lập lịch bài ${i + 1}:`, error);
      scheduleResults.push({
        articleIndex: i + 1,
        title: article.title.substring(0, 50) + '...',
        error: error.message
      });
    }
  }
  
  return scheduleResults;
}

// API: Schedule tweet using server-side cron job
app.post('/api/twitter/schedule', async (req, res) => {
  try {
    const { text, imageUrls, scheduledTime } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nội dung tweet không được trống' 
      });
    }

    if (!scheduledTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng chọn thời gian đăng' 
      });
    }

    // Kiểm tra thời gian phải trong tương lai
    const scheduleDate = new Date(scheduledTime);
    if (scheduleDate <= new Date()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Thời gian đăng phải trong tương lai' 
      });
    }

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chưa cấu hình khóa Twitter' 
      });
    }

    // Parse image URLs
    let parsedImageUrls = [];
    if (imageUrls && imageUrls.trim()) {
      parsedImageUrls = imageUrls.split('\n')
        .map(url => url.trim())
        .filter(url => url && url.startsWith('http'))
        .slice(0, 4);
    }

    const tweetData = {
      text: text.trim(),
      imageUrls: parsedImageUrls
    };

    const tweetId = scheduleTweet(tweetData, scheduledTime);
    
    res.json({ 
      success: true, 
      tweetId: tweetId,
      scheduledTime: scheduledTime,
      message: `Đã lập lịch tweet (server-side) lúc ${moment(scheduledTime).format('DD/MM/YYYY HH:mm')}`
    });
  } catch (error) {
    console.error('❌ Lỗi lập lịch tweet:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Get scheduled tweets (server-side)
app.get('/api/twitter/scheduled', (req, res) => {
  const tweets = scheduledTweets.map(tweet => ({
    id: tweet.id,
    text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
    scheduledTime: tweet.scheduledTime,
    status: tweet.status,
    createdAt: tweet.createdAt,
    imageCount: tweet.imageUrls ? tweet.imageUrls.length : 0
  }));
  
  res.json({ 
    success: true, 
    tweets: tweets 
  });
});

// API: Cancel scheduled tweet (server-side)
app.delete('/api/twitter/scheduled/:id', (req, res) => {
  try {
    const tweetId = parseInt(req.params.id);
    
    // Tìm và xóa job
    const job = scheduledJobs.get(tweetId);
    if (job) {
      job.stop();
      job.destroy();
      scheduledJobs.delete(tweetId);
      console.log('🗑️ Đã hủy job:', tweetId);
    }
    
    // Xóa khỏi danh sách
    scheduledTweets = scheduledTweets.filter(t => t.id !== tweetId);
    
    res.json({ 
      success: true, 
      message: 'Đã hủy lịch đăng tweet' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Debug scheduled jobs
app.get('/api/debug/jobs', (req, res) => {
  const jobsInfo = [];
  
  scheduledJobs.forEach((job, tweetId) => {
    const tweet = scheduledTweets.find(t => t.id === tweetId);
    jobsInfo.push({
      tweetId: tweetId,
      scheduledTime: tweet ? tweet.scheduledTime : 'Unknown',
      cronFormat: tweet ? tweet.cronFormat : 'Unknown',
      status: job.running ? 'Running' : 'Stopped',
      content: tweet ? tweet.text.substring(0, 50) + '...' : 'Unknown'
    });
  });
  
  res.json({
    success: true,
    totalJobs: scheduledJobs.size,
    totalTweets: scheduledTweets.length,
    currentTime: new Date().toLocaleString('vi-VN'),
    jobs: jobsInfo
  });
});

// API: Auto schedule 20 posts with fixed time slots
app.post('/api/auto-schedule-20-fixed', async (req, res) => {
  try {
    const { apiUrl, page } = req.body;
    
    if (!apiUrl || !apiUrl.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng nhập URL API' 
      });
    }

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chưa cấu hình khóa Twitter' 
      });
    }

    // Step 1: Fetch 20 articles from API
    console.log('🔄 Lấy 20 bài từ API để lập lịch cố định...');
    const fullApiUrl = `${apiUrl}&pg=${page || 1}`;
    const articles = await fetchPageDataFromAPI(fullApiUrl);
    
    if (!articles || articles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Không lấy được bài viết nào từ API' 
      });
    }

    // Take only first 20 articles
    const selectedArticles = articles.slice(0, 20);
    console.log(`✅ Đã lấy ${selectedArticles.length} bài viết để lập lịch`);

    // Fixed schedule: 5 days, 4 posts per day, starting tomorrow
    const scheduleResults = [];
    const timeSlots = [
      { time: '08:00', name: 'Sáng' },
      { time: '12:00', name: 'Trưa' }, 
      { time: '17:00', name: 'Chiều' },
      { time: '21:00', name: 'Tối' }
    ];
    
    // Start from tomorrow 
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);
    
    console.log('📅 Bắt đầu lập lịch từ:', startDate.toLocaleDateString('vi-VN'));
    
    for (let i = 0; i < selectedArticles.length; i++) {
      const article = selectedArticles[i];
      console.log(`🔄 Lập lịch bài ${i + 1}/${selectedArticles.length}: ${article.title.substring(0, 30)}...`);
      
      try {
        // Generate AI content
        const aiContent = await generateChineseContentFromTitle(article.title);
        
        // Calculate schedule time - fixed pattern
        const dayOffset = Math.floor(i / 4); // 4 posts per day
        const timeSlotIndex = i % 4; // 0,1,2,3 for morning,noon,evening,night
        
        const scheduleDate = new Date(startDate);
        scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
        
        const [hours, minutes] = timeSlots[timeSlotIndex].time.split(':').map(Number);
        scheduleDate.setHours(hours, minutes, 0, 0);
        
        // Prepare tweet data
        const tweetData = {
          text: `${article.title}\n\n${aiContent}`,
          imageUrls: article.images.slice(0, 4) // Take first 4 images
        };
        
        // Schedule the tweet
        const tweetId = scheduleTweet(tweetData, scheduleDate.toISOString());
        
        scheduleResults.push({
          articleIndex: i + 1,
          title: article.title.substring(0, 50) + '...',
          scheduledTime: scheduleDate.toISOString(),
          scheduledTimeVN: scheduleDate.toLocaleString('vi-VN'),
          timeSlot: timeSlots[timeSlotIndex].time,
          timeSlotName: timeSlots[timeSlotIndex].name,
          day: dayOffset + 1,
          tweetId: tweetId,
          imageCount: article.images.length,
          success: true
        });
        
        console.log(`✅ Đã lập lịch bài ${i + 1}: ${scheduleDate.toLocaleString('vi-VN')} (${timeSlots[timeSlotIndex].name})`);
        
        // Small delay to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Lỗi lập lịch bài ${i + 1}:`, error);
        scheduleResults.push({
          articleIndex: i + 1,
          title: article.title.substring(0, 50) + '...',
          error: error.message,
          success: false
        });
      }
    }

    const successCount = scheduleResults.filter(r => r.success).length;
    
    res.json({ 
      success: true, 
      message: `Đã tự động lập lịch ${successCount}/${selectedArticles.length} bài thành công!`,
      articlesProcessed: selectedArticles.length,
      scheduledTweets: successCount,
      startDate: startDate.toLocaleDateString('vi-VN'),
      schedulePattern: '4 bài/ngày × 5 ngày (8h, 12h, 17h, 21h)',
      scheduleDetails: scheduleResults
    });

  } catch (error) {
    console.error('❌ Lỗi auto schedule 20 fixed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: Auto schedule 20 posts immediately
app.post('/api/auto-schedule-20', async (req, res) => {
  try {
    const { apiUrl, page } = req.body;
    
    if (!apiUrl || !apiUrl.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vui lòng nhập URL API' 
      });
    }

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chưa cấu hình khóa Twitter' 
      });
    }

    // Step 1: Fetch 20 articles from API
    console.log('🔄 Lấy 20 bài từ API để lập lịch...');
    const fullApiUrl = `${apiUrl}&pg=${page || 1}`;
    const articles = await fetchPageDataFromAPI(fullApiUrl);
    
    if (!articles || articles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Không lấy được bài viết nào từ API' 
      });
    }

    // Take only first 20 articles
    const selectedArticles = articles.slice(0, 20);
    console.log(`✅ Đã lấy ${selectedArticles.length} bài viết để lập lịch`);

    // Step 2: Generate AI content and schedule immediately
    const scheduleResults = [];
    const postsPerDay = 4;
    const timeSlots = ['08:00', '12:00', '17:00', '21:00']; // Sáng, trưa, chiều, tối
    
    // Start from tomorrow
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < selectedArticles.length; i++) {
      const article = selectedArticles[i];
      console.log(`🔄 Xử lý và lập lịch bài ${i + 1}/${selectedArticles.length}: ${article.title.substring(0, 30)}...`);
      
      try {
        // Generate AI content
        const aiContent = await generateChineseContentFromTitle(article.title);
        
        // Calculate schedule time
        const dayOffset = Math.floor(i / postsPerDay);
        const timeSlotIndex = i % postsPerDay;
        
        const scheduleDate = new Date(startDate);
        scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
        
        const [hours, minutes] = timeSlots[timeSlotIndex].split(':').map(Number);
        scheduleDate.setHours(hours, minutes, 0, 0);
        
        // Prepare tweet data
        const tweetData = {
          text: `${article.title}\n\n${aiContent}`,
          imageUrls: article.images.slice(0, 4) // Take first 4 images
        };
        
        // Schedule the tweet
        const tweetId = scheduleTweet(tweetData, scheduleDate.toISOString());
        
        scheduleResults.push({
          articleIndex: i + 1,
          title: article.title.substring(0, 50) + '...',
          scheduledTime: scheduleDate.toISOString(),
          timeSlot: timeSlots[timeSlotIndex],
          day: dayOffset + 1,
          tweetId: tweetId,
          imageCount: article.images.length,
          aiContent: aiContent.substring(0, 50) + '...'
        });
        
        console.log(`✅ Đã lập lịch bài ${i + 1}: ${scheduleDate.toLocaleString('vi-VN')} (${timeSlots[timeSlotIndex]})`);
        
        // Small delay to avoid overwhelming
        if (i < selectedArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.error(`❌ Lỗi xử lý bài ${i + 1}:`, error);
        scheduleResults.push({
          articleIndex: i + 1,
          title: article.title.substring(0, 50) + '...',
          error: error.message
        });
      }
    }

    const successCount = scheduleResults.filter(r => !r.error).length;
    
    res.json({ 
      success: true, 
      message: `Đã tự động lập lịch ${successCount}/${selectedArticles.length} bài thành công!`,
      articlesProcessed: selectedArticles.length,
      scheduledTweets: successCount,
      scheduleDetails: scheduleResults
    });

  } catch (error) {
    console.error('❌ Lỗi auto schedule 20:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Removed Chinese tweet generation endpoint

// API: Post tweet (with multiple images or video)
app.post('/api/twitter/post', upload.array('images', 4), async (req, res) => {
  let uploadedFiles = [];
  
  try {
    const { text, imageUrls } = req.body;
    uploadedFiles = req.files || [];
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nội dung tweet không được trống' 
      });
    }

    if (text.length > 280) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tweet không được vượt quá 280 ký tự' 
      });
    }

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chưa cấu hình khóa Twitter' 
      });
    }

    const client = createTwitterClient(config);
    
    let mediaIds = [];
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fsSync.existsSync(uploadDir)) {
      fsSync.mkdirSync(uploadDir, { recursive: true });
    }

    // Handle images only
    const imagesToUpload = [];
    
    // Add uploaded files
    uploadedFiles.forEach(file => {
      imagesToUpload.push({ type: 'file', path: file.path });
    });

    // Upload images directly from URLs (no file saving)
    if (imageUrls) {
      try {
        const urls = JSON.parse(imageUrls);
        console.log('📋 Danh sách URL ảnh:', urls);

        for (const url of urls.slice(0, 4)) { // Limit to 4 images
          console.log('⏳ Đang upload ảnh trực tiếp từ URL:', url);
          
          try {
            const response = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 15000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            // Upload directly to Twitter without saving to disk
            const mediaId = await client.v1.uploadMedia(Buffer.from(response.data));
            mediaIds.push(mediaId);
            console.log('✅ Đã upload ảnh trực tiếp lên Twitter, Media ID:', mediaId);
            
          } catch (urlError) {
            console.error('❌ Lỗi xử lý ảnh từ URL:', url, urlError.message);
            // Continue with other images if one fails
          }
        }
      } catch (error) {
        console.error('❌ Lỗi xử lý danh sách URL ảnh:', error);
        // Don't throw error, just continue without images
      }
    }

    // Upload local files to Twitter (if any)
    if (imagesToUpload.length > 0) {
      console.log(`📸 Tổng cộng ${imagesToUpload.length} file local cần upload`);
      for (const img of imagesToUpload.slice(0, 4 - mediaIds.length)) { // Don't exceed 4 total
        try {
          console.log('📤 Đang upload file local:', path.basename(img.path));
          const mediaId = await client.v1.uploadMedia(img.path);
          mediaIds.push(mediaId);
          console.log('✅ Đã upload file local lên Twitter, Media ID:', mediaId);
        } catch (error) {
          console.error('❌ Lỗi upload file local:', error);
          // Continue with other files if one fails
        }
      }
    }
    
    // Post tweet with media
    const tweetOptions = { text };
    if (mediaIds.length > 0) {
      tweetOptions.media = { media_ids: mediaIds };
    }
    
    console.log('📤 Đang đăng tweet lên Twitter...');
    const tweet = await client.v2.tweet(tweetOptions);
    console.log('✅ Đã đăng tweet thành công! Tweet ID:', tweet.data.id);
    
    // Clean up uploaded files only (no downloaded files to clean)
    console.log('🗑️ Đang xóa các file đã upload...');
    for (const file of uploadedFiles) {
      try {
        await fs.unlink(file.path);
        console.log('✅ Đã xóa file upload:', path.basename(file.path));
      } catch (e) {
        console.warn('⚠️ Không thể xóa file upload:', e.message);
      }
    }
    console.log('🎉 Hoàn tất! Không cần tải file tạm.');
    
    res.json({ 
      success: true, 
      tweetId: tweet.data.id,
      message: mediaIds.length > 0 
        ? `Đã đăng tweet kèm ${mediaIds.length} ảnh thành công`
        : 'Đã đăng tweet thành công',
      imageCount: mediaIds.length
    });
  } catch (error) {
    console.error('❌ Twitter API Error:', error);
    
    // Clean up files on error - only uploaded files (no downloaded files)
    console.log('🗑️ Đang xóa các file do lỗi xảy ra...');
    for (const file of uploadedFiles) {
      try {
        await fs.unlink(file.path);
        console.log('✅ Đã xóa file upload:', path.basename(file.path));
      } catch (e) {
        console.warn('⚠️ Không thể xóa file upload:', e.message);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Lỗi khi đăng tweet' 
    });
  }
});

// API: Auto post from DOCX
app.post('/api/twitter/auto-post', async (req, res) => {
  try {
    const data = await getContentFromDocx();
    const config = await loadConfig();
    
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ success: false, error: 'Chưa cấu hình khóa Twitter' });
    }

    const client = createTwitterClient(config);
    const tweet = await client.v2.tweet(data.content);
    
    res.json({ 
      success: true, 
      tweetId: tweet.data.id,
      message: `Đã tự động đăng bài từ ${data.fileName}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: fetch first article from external API and return title + up to 4 images
app.get('/external/first', async (req, res) => {
  try {
    // Allow passing api url via query ?url=..., otherwise use provided default
    const apiUrl = req.query.url || 'https://beiyong.slapibf.com/api.php/provide/art/?ac=detail&pg=1&t=72';
    const data = await fetchFirstArticleFromApi(apiUrl);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: fetch first article and post it to Twitter (requires keys configured)
app.post('/external/post-first', async (req, res) => {
  try {
    const apiUrl = req.body.url || 'https://beiyong.slapibf.com/api.php/provide/art/?ac=detail&pg=1&t=72';
    const article = await fetchFirstArticleFromApi(apiUrl);

    const config = await loadConfig();
    if (!hasTwitterKeys(config)) {
      return res.status(400).json({ success: false, error: 'Chưa cấu hình khóa Twitter' });
    }

    const client = createTwitterClient(config);

    // Upload images directly to Twitter without saving to disk
    const mediaIds = [];

    for (const url of (article.imageUrls || []).slice(0, 4)) {
      try {
        console.log('⏳ Đang upload ảnh trực tiếp từ URL (external):', url);
        const response = await axios.get(url, { 
          responseType: 'arraybuffer', 
          timeout: 15000, 
          headers: { 'User-Agent': 'Mozilla/5.0' } 
        });

        // Upload directly to Twitter without saving to disk
        const mediaId = await client.v1.uploadMedia(Buffer.from(response.data));
        mediaIds.push(mediaId);
        console.log('✅ Đã upload ảnh trực tiếp lên Twitter (external), Media ID:', mediaId);
      } catch (err) {
        console.warn('❌ Không thể upload ảnh từ URL:', url, err.message);
      }
    }

    // Post tweet
    const tweetOptions = { text: article.art_name };
    if (mediaIds.length) tweetOptions.media = { media_ids: mediaIds };

    const tweet = await client.v2.tweet(tweetOptions);

    res.json({ success: true, tweetId: tweet.data.id, imageCount: mediaIds.length });
  } catch (error) {
    console.error('Error posting external first article:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Multi-article fetch and scheduling ---

// Fetch multiple articles from API (tries to find array of objects with art_name + art_content)
async function fetchArticlesFromApi(apiUrl, limit = 20) {
  const res = await axios.get(apiUrl, { timeout: 15000 });
  const body = res.data;

  const results = [];

  function extractFromObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.art_name && obj.art_content) {
      const $ = cheerio.load(obj.art_content || '');
      const imgs = [];
      $('img').each((i, el) => { const src = $(el).attr('src'); if (src) imgs.push(src); });
      results.push({ art_name: obj.art_name, art_content: obj.art_content, imageUrls: imgs.slice(0, 4) });
      return;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (results.length >= limit) return;
          extractFromObject(item);
        }
      } else if (typeof v === 'object') {
        if (results.length >= limit) return;
        extractFromObject(v);
      }
      if (results.length >= limit) return;
    }
  }

  extractFromObject(body);

  return results.slice(0, limit);
}

// Generate extra short text (caption/hashtags) using OpenRouter
async function generateExtraContent(article) {
  if (!OPENROUTER_KEY) throw new Error('OpenRouter API key not configured');

  const title = article.art_name || '';
  const content = (article.art_content || '').replace(/<[^>]+>/g, ' ');

  const prompt = `Bạn là một trợ lý viết nội dung ngắn cho Twitter bằng tiếng Việt. Dựa vào tiêu đề: "${title}" và nội dung: "${content}", hãy tạo: (1) một caption ngắn 1-2 câu, (2) 3 hashtag phù hợp. Trả về ở dạng: caption newline hashtags (ví dụ: #tag1 #tag2 #tag3). Không thêm giải thích khác.`;

  const payload = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: 'Bạn là một trợ lý viết nội dung ngắn, súc tích.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
    max_tokens: 200
  };

  const resp = await axios.post('https://api.openrouter.ai/v1/chat/completions', payload, {
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });

  // Response format: choices[0].message.content
  const text = resp.data && resp.data.choices && resp.data.choices[0] && (resp.data.choices[0].message ? resp.data.choices[0].message.content : resp.data.choices[0].text);
  return (text || '').trim();
}

// Generate full rewritten title and full content using OpenRouter
async function generateFullContent(article) {
  if (!OPENROUTER_KEY) throw new Error('OpenRouter API key not configured');

  const title = article.art_name || '';
  const content = (article.art_content || '').replace(/<[^>]+>/g, ' ');

  const prompt = `Bạn là một trợ lý viết lại bài bằng tiếng Việt. Dựa trên tiêu đề: "${title}" và nội dung hiện có: "${content}", hãy:
1) Viết lại một tiêu đề mới, bắt mắt và phù hợp cho Twitter.
2) Viết lại nội dung bài đầy đủ, mạch lạc, đoạn văn rõ ràng, dùng ngôn ngữ tự nhiên, dài khoảng 3-6 đoạn.
Trả về kết quả ở dạng JSON chỉ gồm hai trường: {"new_title":"...","full_content":"..."} và không có giải thích khác.`;

  const payload = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: 'Bạn là một trợ lý viết lại bài chuyên nghiệp, sáng tạo, bằng tiếng Việt.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
    max_tokens: 1200
  };

  const resp = await axios.post('https://api.openrouter.ai/v1/chat/completions', payload, {
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  const text = resp.data && resp.data.choices && resp.data.choices[0] && (resp.data.choices[0].message ? resp.data.choices[0].message.content : resp.data.choices[0].text);
  if (!text) throw new Error('OpenRouter returned empty response');

  // Try to parse JSON from model output; if model wraps with markdown or text, try to extract JSON substring
  let parsed = null;
  try {
    parsed = JSON.parse(text.trim());
  } catch (e) {
    // attempt to find first { ... } block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (e2) { /* fallthrough */ }
    }
  }

  if (!parsed) {
    // Fallback: return text as full_content and keep original title
    return { new_title: title, full_content: text.trim() };
  }

  return { new_title: parsed.new_title || title, full_content: parsed.full_content || '' };
}

// Post a single article object {art_name, imageUrls[]} to Twitter, return result
async function postArticleToTwitter(article, config, options = {}) {
  const client = createTwitterClient(config);

  const mediaIds = [];

  for (const url of (article.imageUrls || []).slice(0, 4)) {
    try {
      console.log('⏳ Đang upload ảnh trực tiếp từ URL (postArticleToTwitter):', url);
      const response = await axios.get(url, { 
        responseType: 'arraybuffer', 
        timeout: 15000, 
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });

      // Upload directly to Twitter without saving to disk
      const mediaId = await client.v1.uploadMedia(Buffer.from(response.data));
      mediaIds.push(mediaId);
      console.log('✅ Đã upload ảnh trực tiếp lên Twitter (postArticleToTwitter), Media ID:', mediaId);
      
      // small delay between uploads to be gentle
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.warn('❌ Không thể upload ảnh từ URL:', url, err.message);
    }
  }

  // Optionally generate extra content via OpenRouter
  let extraText = '';
  if (options.generate && OPENROUTER_KEY) {
    try {
      extraText = await generateExtraContent(article);
    } catch (e) {
      console.warn('OpenRouter generation failed:', e.message);
      extraText = '';
    }
  }

  // Compose tweet text: title + extra (ensure <= 280 chars)
  let tweetText = article.art_name || '';
  if (extraText) tweetText += '\n\n' + extraText;
  if (tweetText.length > 280) {
    // truncate extraText first
    const allowedExtra = 280 - (article.art_name || '').length - 2;
    if (allowedExtra > 0) {
      tweetText = (article.art_name || '') + '\n\n' + extraText.slice(0, allowedExtra - 3) + '...';
    } else {
      tweetText = tweetText.slice(0, 277) + '...';
    }
  }

  const tweetOptions = { text: tweetText };
  if (mediaIds.length) tweetOptions.media = { media_ids: mediaIds };

  const tweet = await client.v2.tweet(tweetOptions);

  return { tweetId: tweet.data.id, imageCount: mediaIds.length };
}



// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Not Found</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #1da1f2; }
      </style>
    </head>
    <body>
      <h1>404 - Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/">Go to Home</a> | <a href="/twitter">Twitter Manager</a>
    </body>
    </html>
  `);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
  console.log(`📝 Quản lý Twitter: /twitter`);
  console.log(`📄 Xem DOCX: /docx`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
