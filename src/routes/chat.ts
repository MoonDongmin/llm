import express      from "express";
import {Ollama}     from "ollama";
import {
    saveChatHistory,
    getMessages,
    normalizeMessagesForOllama,
    getCurrentSQL,
}                   from "../utils/chatHistory";
import * as process from "node:process";
import {
    getTableMetadata,
    queryDatabase,
}                   from "../utils/psql.ts";

const router = express.Router();
const ollama = new Ollama({host: "http://127.0.0.1:11434"});

// llm 대화하기
router.post("/", async (req, res) => {
    const {message} = req.body;
    if (!message) return res.status(400).json({error: "메시지를 입력해주세요."});

    const messages = getMessages();
    messages.push({
        role: "user",
        content: message,
    });
    saveChatHistory(messages);

    try {
        const normalizedMessages = normalizeMessagesForOllama(messages);

        const response = await ollama.chat({
            model: `${process.env.MODEL}`,
            messages: normalizedMessages,
            stream: false,
        });

        const fullContent = response.message.content;

        // <think>...</think> 부분 추출
        const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>/);
        const think = thinkMatch ? thinkMatch[1].trim() : null;
        const answer = thinkMatch
            ? fullContent.replace(thinkMatch[0], "").trim()
            : fullContent.trim();

        const assistantMessage = {
            role: "assistant",
            content: {
                think,
                answer,
            },
        };

        messages.push(assistantMessage);
        saveChatHistory(messages);

        res.json({response: assistantMessage});
    } catch (error) {
        console.error("Ollama 응답 오류:", error);
        res.status(500).json({error: "Ollama와의 통신 중 오류 발생"});
    }
});

// 마지막으로 AI가 반환한 결과 SQL 문만
router.get("/", async (req, res) => {
    try {
        const query = getCurrentSQL();
        res.send(query);
    } catch (err: any) {
        res.status(500).json({error: err.message});
    }
});

// 실행결과 반환
router.get("/result", async (req, res) => {
    try {
        const query: string[] = getCurrentSQL();
        const sql: string[][] = await queryDatabase(query);
        res.send(sql);
    } catch (err: any) {
        res.status(500).json({error: err.message});
    }
});

router.get("/table", async (req, res) => {
    try {
        const metadata = await getTableMetadata("sensors");
        res.send(metadata);
    } catch (err: any) {
        res.status(500).json({error: err.message});
    }
});

export default router;
