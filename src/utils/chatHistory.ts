import * as fs            from "fs";
import {Ollama}           from "ollama";
import process            from "node:process";
import {getTableMetadata} from "./psql.ts";

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
        console.error("🚨채팅 기록을 불러오는 중 오류 발생:", error);
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
    loadChatHistory();

    console.log("📖기존 대화를 학습시키는 중📖");
    const snapshot = await getTableMetadata(); // 메타데이터 수집
    const metadataPrompt = createMetadataMessage(snapshot); // 텍스트화

    const isAlreadyStored = messages.some((msg: any) =>
        msg.role === "assistant" &&
        typeof msg.content === "object" &&
        msg.content.answer?.includes("다음은 메타데이터입니다"),
    );

    if (!isAlreadyStored) {
        messages.push(metadataPrompt); // 메타데이터 메시지를 대화 기록에 추가
        saveChatHistory(messages); // 파일로 저장
    }

    const normalizedMessages = messages.map((msg: any) => {
        if (msg.role === "assistant" && typeof msg.content === "object") {
            return {
                role: msg.role,
                content: `${msg.content.think}\n\n${msg.content.answer}`,
            };
        }
        return msg;
    });

    const trainingPrompt = [
        {
            role: "system",
            content: [
                "다음은 현재 데이터베이스의 테이블 메타데이터입니다.",
                metadataPrompt,
                "이 정보를 바탕으로 테이블에 없는 속성 정보를 사용하지말고 이후 사용자의 SQL 요청에 응답하세요.",
            ].join("\n\n"),
        },
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
        console.log("⭐️학습완료!⭐️");
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

// history 파일에서 최근 답변 SQL 반환해주는 함수
export const getCurrentSQL = (): string[] => {
    const rawData = fs.readFileSync(historyFile, "utf-8");
    const history = JSON.parse(rawData);
    const lastEntry = history[history.length - 1].content.answer;

    const matches = [...lastEntry.matchAll(/```sql\s*([\s\S]*?)```/g)];

    if (matches.length === 0) {
        throw new Error("SQL이 없습니다.");
    }

    return matches.map(m =>
        m[1]
            .trim()
            .replace(/\s+/g, " "), // 모든 개행, 탭, 여러 스페이스 → 단일 스페이스
    );
};


function formatMetadataForPrompt(snapshot: any[]): string {
    return snapshot.map(({
                             table,
                             columns,
                             samples,
                         }) => {
        const columnLines = columns.map(col =>
            `- ${col.column_name} (${col.data_type}${col.is_nullable === "NO" ? ", NOT NULL" : ""})`,
        ).join("\n");

        const sampleLines = samples.length
            ? samples.map((row, idx) => `  Row ${idx + 1}: ${JSON.stringify(row)}`).join("\n")
            : "  (no sample data)";

        return `테이블: ${table}\n컬럼 정보:\n${columnLines}\n샘플 데이터:\n${sampleLines}`;
    }).join("\n\n");
}

function createMetadataMessage(snapshot: any[]): any {
    const content = formatMetadataForPrompt(snapshot);
    return {
        role: "assistant",
        content: {
            think: "",
            answer: `데이터베이스의 테이블 구조와 샘플 데이터를 학습하였습니다.\n\n 다음은 메타데이터입니다:\n\n${content}`,
        },
    };
}
