# 🚀 SwiftTalk: Anonymous Real-time Chat Platform

**SwiftTalk** là một ứng dụng web chat tức thời, tập trung vào sự tối giản, tốc độ và quyền riêng tư. Người dùng có thể kết nối ngay lập tức mà không cần tài khoản, mật khẩu hay bất kỳ thủ tục đăng ký nào.

---

## 📋 1. Tổng quan Dự án (Project Overview)

* **Mục tiêu:** Cung cấp môi trường giao tiếp nhanh chóng, xóa bỏ rào cản về định danh.
* **Cơ chế:**
    * Tham gia bằng Nickname tự chọn.
    * Phòng chat được định danh qua URL (UUID).
    * Dữ liệu tin nhắn lưu trữ tạm thời trong RAM (Redis) và tự hủy sau khi phiên kết thúc.

---

## 🛠️ 2. Công nghệ Sử dụng (Tech Stack)

| Layer | Technology | Reason |
| :--- | :--- | :--- |
| **Frontend** | React.js / Next.js | Xử lý giao diện mượt mà, quản lý State tốt. |
| **Backend** | Node.js (Express) | Xử lý I/O không chặn, tối ưu cho WebSockets. |
| **Real-time** | Socket.io | Đảm bảo truyền tải tin nhắn với độ trễ thấp nhất. |
| **Storage** | Redis | Truy xuất cực nhanh cho các phiên chat tạm thời. |

---

## 📊 3. Phân tích Tính khả thi & Thách thức

### ✅ Tính khả thi
* **Kỹ thuật:** WebSockets và Redis là những công nghệ đã quá chín muồi cho bài toán Chat.
* **Vận hành:** Chi phí thấp, dễ dàng triển khai trên các Cloud Provider miễn phí/giá rẻ.

### ⚠️ Khó khăn
* **Spam/Moderation:** Thiếu cơ chế định danh khiến việc kiểm soát người dùng phá hoại trở nên khó khăn.
* **Bảo mật:** Nguy cơ tấn công XSS và DDoS vào Socket Server.

---

## 💻 4. Cấu trúc Mã nguồn Core

### Backend (`server.js`)
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    socket.on('join_room', (roomID) => socket.join(roomID));
    socket.on('send_message', (data) => {
        socket.to(data.room).emit('receive_message', data);
    });
});

server.listen(3001, () => console.log("Server running on port 3001"));
```

---

## 🛡️ 5. Góc nhìn Bảo mật (Cybersecurity)

Dành cho các nhà phát triển quan tâm đến Pentest:
1.  **Anti-XSS:** Sử dụng `DOMPurify` trên Frontend để làm sạch toàn bộ input từ người dùng.
2.  **IDOR Protection:** Không dùng ID phòng tăng dần (1, 2, 3), luôn dùng chuỗi ngẫu nhiên (UUID v4).
3.  **Rate Limiting:** Cài đặt giới hạn số lượng request/tin nhắn trên mỗi IP để chống Flood.

---

## 🚀 Lộ trình Phát triển (Roadmap)

- [x] Hoàn thiện giao diện tối giản (phiên bản CSS thuần cho MVP).
- [x] Voice chat realtime với WebRTC.
- [ ] Tích hợp Redis để duy trì tin nhắn khi F5 (hiện đang dùng RAM).
- [ ] Thêm tính năng chia sẻ file/ảnh tự xóa.
- [ ] Triển khai mã hóa đầu cuối (E2EE) cho tin nhắn text.

---

## ✅ 6. Trạng thái triển khai hiện tại (MVP đã chạy được)

Hiện tại dự án đã được triển khai thành phiên bản MVP với các chức năng chính:

**Chat Features:**
- Tạo phòng chat qua API `POST /api/rooms` (UUID v4).
- Join phòng bằng URL `/room/:roomId`.
- Chat realtime với `Socket.IO` qua event `join_room`, `send_message`, `receive_message`.
- Lưu lịch sử tin nhắn tạm thời trong RAM theo từng phòng (giới hạn số lượng tin nhắn).
- Tự động dọn phòng không hoạt động theo TTL.

**Voice Chat Features (NEW):**
- Voice chat realtime sử dụng WebRTC peer-to-peer.
- Hỗ trợ nhiều người tham gia voice trong cùng một phòng.
- Echo cancellation, noise suppression, auto gain control.
- UI controls: nút bật/tắt mic, hiển thị số lượng peers đang kết nối.
- Tự động dọn dẹp connections khi người dùng rời phòng.

**Security & Anti-Spam:**
- Rate limit cho tạo phòng.
- Cooldown giữa các lần gửi tin nhắn.
Yêu cầu:

- Node.js 18+

Chạy local:

```bash
npm install
npm run dev
```

Mở trình duyệt tại:

- `http://localhost:3001`

Kiểm tra nhanh:

1. Tạo một phòng mới bằng nút `Create Room`.
2. Copy link phòng và mở thêm 1 tab/trình duyệt khác.
3. Nhập nickname ở mỗi tab và gửi tin nhắn để xác nhận realtime hoạt động.
4. **Voice Chat**: Click nút "🎤 Start Voice" để bật microphone và voice chat với người khác trong phòng.
5. Cho phép quyền truy cập microphone khi trình duyệt yêu cầu.

## 🧱 8. Cấu trúc dự án sau khi triển khai

```text
SwiftTalk/
    .gitignore
    package.json
  server.js              # Backend với Socket.IO + WebRTC signaling
  public/
    index.html           # UI với chat + voice controls
    style.css            # Styling cho chat và voice UI
    app.js               # Chat logic và voice integration
    voice.js             # WebRTC voice chat engine
