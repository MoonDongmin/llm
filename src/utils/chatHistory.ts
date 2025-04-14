import * as fs  from "fs";
import {Ollama} from "ollama";
import process  from "node:process";

const historyFile = "chat_history.json";
let messages: any = [];
const ollama = new Ollama({host: "http://127.0.0.1:11434"});

// JSON 파일에서 대화 기록 불러오기
export const loadChatHistory = () => {
    try {
        if (fs.existsSync(historyFile)) {
            const fileContent = fs.readFileSync(historyFile, "utf-8");
            messages = fileContent.trim() ? JSON.parse(fileContent) : [];
        }
    } catch (error) {
        console.error("채팅 기록을 불러오는 중 오류 발생:", error);
        messages = [];
    }
};

// JSON 파일에 대화 기록 저장하는 함수
export const saveChatHistory = (currentMessages: any) => {
    fs.writeFileSync(historyFile, JSON.stringify(currentMessages, null, 2), "utf-8");
    messages = currentMessages; // 메모리 내의 messages 업데이트
};

// 현재 채팅 기록 반환
export const getMessages = () => {
    return messages;
};

// Ollama에게 기존 대화를 학습시키는 함수
export const trainOllamaWithHistory = async () => {
    if (messages.length === 0) return;

    console.log("기존 대화를 학습시키는 중...");

    const normalizedMessages = messages.map((msg: any) => {
        if (msg.role === "assistant" && typeof msg.content === "object") {
            return {
                role: msg.role,
                content: `<think>\n${msg.content.think}\n</think>\n\n${msg.content.answer}`,
            };
        }
        return msg;
    });

    const trainingPrompt = [
        {
            role: "system",
            content: "다음은 이전 대화 기록입니다. 이 기록을 참고하여 문맥을 유지하세요.",
        },
        ...normalizedMessages,
    ];

    try {
        await ollama.chat({
            model: `${process.env.MODEL}`,
            messages: trainingPrompt,
            stream: false, // 학습 단계는 스트리밍 없이 진행
        });
        console.log("학습완료!");
    } catch (error) {
        console.error("Ollama 학습 오류:", error);
    }
};

export const normalizeMessagesForOllama = (msgs: any[]) => {
    return msgs.map((msg) => {
        if (msg.role === "assistant" && typeof msg.content === "object") {
            return {
                role: msg.role,
                content: `<think>\n${msg.content.think}\n</think>\n\n${msg.content.answer}`,
            };
        }
        return msg;
    });
};
