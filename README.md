<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Trình Dịch Sách AI - aiStudio

Ứng dụng web thông minh dịch sách PDF sử dụng Gemini AI, giữ nguyên cấu trúc và trải nghiệm đọc mượt mà.

Xem ứng dụng của bạn trong AI Studio: https://ai.studio/apps/1d7481f3-4daa-4eaa-89e9-c072d898b5c2

## Tính Năng

- 📖 Dịch sách PDF với AI (Gemini)
- 🎯 Giữ nguyên cấu trúc và định dạng gốc
- ⚡ Dịch song song với nhiều worker
- 🔑 Hỗ trợ API key riêng của người dùng
- 💾 Xuất kết quả dịch thành PDF/ZIP
- 🌐 Giao diện web responsive

## Yêu Cầu

- Node.js >= 18.0.0
- npm >= 8.0.0

## Cài Đặt và Chạy Cục Bộ

1. Clone repository:
   ```bash
   git clone https://github.com/steve-gate/Trinh-dich-sach-AI-aiStudio.git
   cd Trinh-dich-sach-AI-aiStudio
   ```

2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Tạo file `.env.local` và thêm Gemini API key:
   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```

4. Chạy ứng dụng:
   ```bash
   npm run dev
   ```

   Ứng dụng sẽ chạy tại `http://localhost:3000`

## Build cho Production

```bash
npm run build
npm start
```

## Cấu Trúc Project

```
.
├── src/
│   ├── App.tsx          # Component chính
│   ├── main.tsx         # Entry point
│   ├── services/        # Services (geminiService, etc.)
│   └── components/      # React components
├── server.ts            # Express server
├── index.html           # HTML template
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies
```

## Công Nghệ Sử Dụng

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Express, Node.js
- **Build Tool**: Vite
- **AI**: Google Gemini API
- **PDF Processing**: PDF.js, jsPDF, html2canvas
- **Animation**: Framer Motion

## API Endpoints

### POST /api/gemini
Dịch text sử dụng Gemini API

**Request:**
```json
{
  "apiKey": "your_api_key",
  "model": "gemini-3.5-flash",
  "contents": "Text to translate",
  "config": { "temperature": 0.3 }
}
```

**Response:**
```json
{
  "text": "Translated text"
}
```

## Troubleshooting

### Lỗi "API key not valid"
- Kiểm tra API key trong cài đặt
- Đảm bảo key được bật API Gemini

### Lỗi "Quota exceeded"
- API key đã vượt quá hạn ngạch hàng ngày
- Chờ đến ngày hôm sau hoặc thay đổi API key

### Lỗi "Server returned non-JSON"
- Có thể cookie bị chặn
- Thử mở ứng dụng trong tab/cửa s�� mới

## Đóng Góp

Chào mừng các pull request! Vui lòng:
1. Fork repository
2. Tạo branch cho feature (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

Copyright © 2024. All rights reserved.
