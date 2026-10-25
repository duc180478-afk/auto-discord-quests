# 🔮 HieuTool Telegram — Discord Quest Auto

Phiên bản tích hợp **Telegram Bot** làm giao diện, thay thế CLI.

## ✨ Tính năng

- 🤖 Điều khiển hoàn toàn qua Telegram
- 🔐 Lần đầu chạy → bot yêu cầu nhập Discord Token
- 💾 Token được lưu vào `config.json` (không cần file `.env`)
- 📊 Cập nhật tiến trình real-time qua tin nhắn
- 🎁 Tự động claim reward + theo dõi Orbs

## 📋 Yêu cầu

- Node.js >= 18
- Một Telegram Bot (tạo tại [@BotFather](https://t.me/BotFather))

## 🚀 Cài đặt & Chạy

```bash
# 1. Cài dependencies
npm install

# 2. Chạy bot
npm run go
```

### Lần đầu chạy

1. Terminal sẽ hỏi **Telegram Bot Token** → dán token từ @BotFather
2. Mở Telegram → tìm bot của bạn → gửi `/start`
3. Gửi Discord User Token:
   ```
   /token YOUR_DISCORD_USER_TOKEN
   ```
4. Chạy farm:
   ```
   /run
   ```

## 📱 Các lệnh Telegram

| Lệnh | Mô tả |
|------|-------|
| `/start` | Khởi động & xem trạng thái |
| `/token <token>` | Lưu Discord User Token |
| `/run` | Bắt đầu auto farm quests |
| `/orbs` | Xem số Orbs hiện tại |
| `/status` | Kiểm tra bot đang chạy hay rảnh |
| `/clear` | Xóa Discord Token đã lưu |
| `/help` | Hướng dẫn chi tiết |

## 🔒 Bảo mật

- Discord Token được lưu local trong `config.json`
- Khi bạn gửi `/token`, bot sẽ **tự xóa tin nhắn** chứa token (nếu có quyền)
- Chỉ user đầu tiên `/start` được phép dùng bot (có thể mở rộng trong config)

## ⚠️ Cảnh báo

Sử dụng Discord **User Token** để tự động hóa **vi phạm Terms of Service** của Discord.  
Có rủi ro bị khóa tài khoản. Dùng hoàn toàn với trách nhiệm của bạn.

## 📁 Cấu trúc

```
├── farm.ts           # Telegram bot + orchestration
├── src/engine.ts     # Core Discord Quest engine
├── config.json       # Tự động tạo (token + allowed users)
├── package.json
└── tsconfig.json
```

---

Dựa trên [Nguoibianhz/Discord-Auto-Quests](https://github.com/Nguoibianhz/Discord-Auto-Quests)  
Chỉ dùng cho mục đích cá nhân / học tập.
