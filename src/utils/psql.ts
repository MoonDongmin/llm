import pg from "pg";

const {Client} = pg;

export async function queryDatabase(queries: string[]): Promise<string[][]> {
    const results = [];

    try {
        const queryList = Array.isArray(queries) ? queries : [queries];  // 배열로 변환

        for (const query of queryList) {
            const db = new Client({
                user: `${process.env.USER}`,
                host: "localhost",
                database: `${process.env.DATABASE}`,
                password: `${process.env.PASSWORD}`,
                port: parseInt(`${process.env.PORT}`),
            });

            await db.connect();

            const res = await db.query(query);
            results.push(res.rows);

            await db.end();
        }

    } catch (err: any) {
        console.error("Error", err.stack);
        throw err;
    }

    return results;
}

export async function getTableMetadata(tableName: string) {
    const db = new Client({
        user: `${process.env.USER}`,
        host: "localhost",
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
