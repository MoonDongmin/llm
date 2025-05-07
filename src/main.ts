import express    from "express";
import chatRoutes from "./routes/chat";
import {
    getCurrentSQL,
    loadChatHistory,
    trainOllamaWithHistory,
}                 from "./utils/chatHistory";

const app = express();
const port = 8081;

app.use(express.json()); // JSON 요청을 받을 수 있도록 설정
app.use("/chat", chatRoutes); // 채팅 관련 라우팅

// 서버 실행
app.listen(port, async () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중...`);
    loadChatHistory(); // 서버 시작 시 채팅 기록 로드
    await trainOllamaWithHistory(); // Ollama 학습
});
