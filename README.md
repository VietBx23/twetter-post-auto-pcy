# Twitter Auto Post System

Hệ thống tự động đăng bài lên Twitter với AI tạo nội dung tiếng Trung.

## ✨ Tính năng

- 🚀 **Tự động lập lịch 20 bài** từ API
- 🤖 **AI tạo nội dung tiếng Trung** bằng OpenRouter
- 📅 **Lịch đăng cố định** (8h, 12h, 17h, 21h)
- 📊 **Table trạng thái** theo dõi chi tiết
- 🖼️ **Upload ảnh trực tiếp** không cần lưu file
- ⏰ **Cron job scheduling** với timezone Việt Nam

## 🚀 Deploy lên Render

### 1. Tạo Web Service trên Render

1. Đăng nhập [Render.com](https://render.com)
2. Nhấn **"New +"** → **"Web Service"**
3. Connect GitHub repository này
4. Cấu hình:
   - **Name:** `twitter-auto-post`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

### 2. Cấu hình Environment Variables

Trong Render Dashboard, thêm các Environment Variables:

```bash
# Twitter API Keys (Bắt buộc)
API_KEY=your_twitter_api_key_here
API_KEY_SECRET=your_twitter_api_key_secret_here
ACCESS_TOKEN=your_twitter_access_token_here
ACCESS_TOKEN_SECRET=your_twitter_access_token_secret_here
BEARER_TOKEN=your_twitter_bearer_token_here
CLIENT_ID=your_twitter_client_id_here
CLIENT_SECRET=your_twitter_client_secret_here

# OpenRouter AI API Key (Bắt buộc)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Session Secret (Tùy chọn)
SESSION_SECRET=your_random_secret_key_here
```

### 3. Lấy Twitter API Keys

1. Truy cập [Twitter Developer Portal](https://developer.twitter.com)
2. Tạo App mới
3. Lấy các keys: API Key, API Secret, Access Token, Access Secret
4. Đảm bảo app có quyền **Read and Write**

### 4. Lấy OpenRouter API Key

1. Truy cập [OpenRouter.ai](https://openrouter.ai)
2. Đăng ký tài khoản
3. Tạo API Key
4. Nạp credit để sử dụng AI

## 📱 Sử dụng

1. Truy cập URL Render của bạn
2. Vào `/twitter` để cấu hình
3. Nhập Twitter API keys (nếu chưa set trong env)
4. Nhập URL API và page
5. Nhấn **"BẮT ĐẦU TỰ ĐỘNG"**
6. Xem table trạng thái và theo dõi

## 🛠️ Chạy Local

```bash
# Clone repository
git clone <your-repo-url>
cd twitter-auto-post

# Install dependencies
npm install

# Copy và cấu hình environment
cp .env.example .env
# Chỉnh sửa .env với keys thật

# Chạy server
npm start
```

## 📋 API Endpoints

- `GET /` - Trang chủ
- `GET /twitter` - Giao diện quản lý
- `POST /api/auto-schedule-20-fixed` - Tự động lập lịch 20 bài
- `GET /api/twitter/scheduled` - Xem tweets đã lập lịch
- `DELETE /api/twitter/scheduled/:id` - Hủy tweet lập lịch

## 🔧 Cấu trúc Project

```
├── server.js              # Main server file
├── views/
│   └── twitter.ejs        # Frontend interface
├── package.json           # Dependencies
├── .env.example          # Environment variables template
└── README.md             # This file
```

## ⚠️ Lưu ý

- **Render Free Plan:** App sẽ sleep sau 15 phút không hoạt động
- **Cron Jobs:** Có thể bị gián đoạn khi app sleep
- **Upgrade Plan:** Khuyến nghị dùng paid plan cho production
- **Timezone:** Đã cấu hình Asia/Ho_Chi_Minh

## 🆘 Troubleshooting

### App không start được
- Kiểm tra Environment Variables
- Xem logs trong Render Dashboard
- Đảm bảo Node.js version >= 18

### Cron jobs không chạy
- Kiểm tra timezone setting
- Verify scheduled tweets trong database
- App có thể đang sleep (Free plan)

### Twitter API lỗi
- Kiểm tra API keys
- Đảm bảo app có quyền Read and Write
- Check rate limits

## 📞 Support

Nếu gặp vấn đề, check:
1. Render logs
2. Twitter API status
3. OpenRouter credit balance