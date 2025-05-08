import pg from "pg";

const {Client} = pg;

export async function queryDatabase(queries: string[]): Promise<string[][]> {
    const results = [];

    const rawInput = Array.isArray(queries) ? queries.join(" ") : queries;
    const queryList = splitQueries(rawInput); // 안전하게 쿼리 나누기

    for (let i = 0; i < queryList.length; i++) {
        const query = queryList[i];
        const db = new Client({
            user: `${process.env.PGUSER}`,
            host: `${process.env.HOST}`,
            database: `${process.env.DATABASE}`,
            password: `${process.env.PASSWORD}`,
            port: parseInt(`${process.env.PORT}`),
        });

        await db.connect();

        try {
            const res = await db.query(query);
            results.push({
                label: `쿼리 결과 ${i + 1}`,
                query: query,
                rows: res.rows,
            });
        } catch (queryErr: any) {
            results.push({
                label: `쿼리 결과 ${i + 1} (실패)`,
                query: query,
                error: queryErr.message,
            });
        }

        await db.end();
    }

    return results;
}

export async function getTableMetadata() {
    const db = new Client({
        user: `${process.env.PGUSER}`,
        host: `${process.env.HOST}`,
        database: `${process.env.DATABASE}`,
        password: `${process.env.PASSWORD}`,
        port: parseInt(`${process.env.PORT}`),
    });

    try {
        await db.connect();

        // 1. 모든 테이블 이름 가져오기 (public 스키마 기준)
        const tableRes = await db.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE';
        `);

        const tables = tableRes.rows.map(row => row.table_name);

        const snapshot = [];

        for (const tableName of tables) {
            // 2. 테이블의 컬럼 정보
            const columnRes = await db.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position;
            `, [tableName]);

            // 3. 테이블의 샘플 데이터 (최대 5개 row)
            let sampleRows = [];
            try {
                const sampleRes = await db.query(`SELECT *
                                                  FROM "${tableName}" LIMIT 5`);
                sampleRows = sampleRes.rows;
            } catch (err: any) {
                console.warn(`테이블 ${tableName} 샘플 조회 실패:`, err.message);
            }

            snapshot.push({
                table: tableName,
                columns: columnRes.rows,
                samples: sampleRows,
            });
        }
        return snapshot;

    } catch (error: any) {
        console.error("메타데이터 조회 오류:", error.stack);
        throw error;
    } finally {
        await db.end();
    }
}

function splitQueries(raw: string): string[] {
    return raw
        .split(/;\s*/g)           // 세미콜론 기준으로 나누되 공백 제거
        .map(q => q.trim())       // 앞뒤 공백 제거
        .filter(q => q.length > 0); // 빈 쿼리 제거
}
