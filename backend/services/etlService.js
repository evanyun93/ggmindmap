// backend/services/etlService.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const cron = require('node-cron');
const { pool } = require('../config/database');

// 우리가 관리할 영양소와 CSV 컬럼명, DB 컬럼명, mg 단위 변환 비율 매핑
// col: CSV 헤더명, dbCol: tba_supplement_nutrients 테이블의 컬럼명, factor: mg 환산 배수
const NUTRIENT_MAP = [
    { col: '비타민 A(μg RAE)',  dbCol: 'vit_a',           factor: 0.001 }, // μg → mg
    { col: '비타민 C(mg)',      dbCol: 'vit_c',           factor: 1     },
    { col: '비타민 D(μg)',      dbCol: 'vit_d',           factor: 0.001 }, // μg → mg
    { col: '티아민(mg)',        dbCol: 'vit_b1',          factor: 1     },
    { col: '리보플라빈(mg)',    dbCol: 'vit_b2',          factor: 1     },
    { col: '니아신(mg)',        dbCol: 'niacin',          factor: 1     },
    { col: '칼슘(mg)',          dbCol: 'calcium',         factor: 1     },
    { col: '철(mg)',            dbCol: 'iron',            factor: 1     },
    { col: '아연(mg)',          dbCol: 'zinc',            factor: 1     },
    { col: '마그네슘(mg)',      dbCol: 'magnesium',       factor: 1     },
    { col: '셀레늄(μg)',        dbCol: 'selenium',        factor: 0.001 }, // μg → mg
    { col: '구리(mg)',          dbCol: 'copper',          factor: 1     },
    { col: '망간(mg)',          dbCol: 'manganese',       factor: 1     },
    { col: '요오드(μg)',        dbCol: 'iodine',          factor: 0.001 }, // μg → mg
    { col: '비타민 B6(mg)',     dbCol: 'vit_b6',          factor: 1     },
    { col: '비타민 B12(μg)',    dbCol: 'vit_b12',         factor: 0.001 }, // μg → mg
    { col: '엽산(μg)',          dbCol: 'folate',          factor: 0.001 }, // μg → mg
    { col: '비오틴(μg)',        dbCol: 'biotin',          factor: 0.001 }, // μg → mg
    { col: '판토텐산(mg)',      dbCol: 'pantothenic_acid',factor: 1     },
    { col: '비타민 E(mg α-TE)', dbCol: 'vit_e',          factor: 1     },
    { col: '비타민 K(μg)',      dbCol: 'vit_k',           factor: 0.001 }, // μg → mg
];

async function syncSupplementsToDB() {
    console.log('🔄 [ETL] CSV 기반 영양제 데이터 동기화 시작...');

    const filePath = path.join(__dirname, '../data/supplements_standard.csv');
    if (!fs.existsSync(filePath)) {
        console.error('❌ CSV 파일이 존재하지 않습니다:', filePath);
        return;
    }

    const rows = [];

    // 1. CSV 파일을 읽어서 배열에 저장 (EUC-KR 인코딩 → UTF-8 변환)
    await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(iconv.decodeStream('EUC-KR'))  // EUC-KR → UTF-8 디코딩
            .pipe(csv())
            .on('data', (data) => rows.push(data))
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    console.log(`✅ CSV 로드 완료! 총 ${rows.length}건의 데이터를 DB에 적재합니다...`);

    const client = await pool.connect();
    const BATCH_SIZE = 1000;
    let totalSaved = 0;

    try {
        // 1000건씩 묶어서 DB에 Insert (DB 부하 방지)
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            await client.query('BEGIN');

            for (const row of batch) {
                // 식약처 코드(식품코드)를 고유 ID로 사용
                // CSV 헤더: '식품코드', '식품명', '제조사명' (EUC-KR 기준)
                const supId = `pub_${row['식품코드']}`;
                const name = row['식품명'];
                if (!name || !supId || supId === 'pub_undefined') continue; // 유효하지 않은 행 스킵
                const manufacturer = row['제조사명'] || row['수입업체명'] || '알 수 없음';

                // 1. 영양제 메인 정보 저장
                const supQuery = `
                  INSERT INTO tba_supplements (id, name, manufacturer, raw_data, updated_at)
                  VALUES ($1, $2, $3, $4, NOW())
                  ON CONFLICT (id) DO UPDATE 
                  SET name = EXCLUDED.name, 
                      manufacturer = EXCLUDED.manufacturer, 
                      updated_at = NOW();
                `;
                // 원본 데이터를 통째로 넣으면 너무 무거우니 간단한 객체만 raw_data에 저장
                const rawData = JSON.stringify({ type: row['유형명'], target: row['섭취대상'] });
                await client.query(supQuery, [supId, name, manufacturer, rawData]);

                // 2. 해당 row의 모든 영양소를 추출하여 한 번에 UPSERT
                // 유효한 (값 > 0) 영양소만 수집
                const nutrientValues = {}; // { dbCol: amountMg }
                for (const nut of NUTRIENT_MAP) {
                    const cellValue = row[nut.col];
                    if (cellValue && !isNaN(cellValue)) {
                        const amount = parseFloat(cellValue);
                        if (amount > 0) {
                            nutrientValues[nut.dbCol] = amount * nut.factor;
                        }
                    }
                }

                // 영양소가 1개라도 있는 경우에만 DB에 저장
                if (Object.keys(nutrientValues).length > 0) {
                    // 동적 UPSERT 쿼리 생성
                    // INSERT INTO tba_supplement_nutrients (supplement_id, col1, col2, ...)
                    // VALUES ($1, $2, $3, ...)
                    // ON CONFLICT (supplement_id) DO UPDATE SET col1=$2, col2=$3, ...
                    const cols = Object.keys(nutrientValues);
                    const vals = Object.values(nutrientValues);
                    const colNames = ['supplement_id', ...cols].join(', ');
                    const placeholders = ['$1', ...cols.map((_, i) => `$${i + 2}`)].join(', ');
                    const updates = cols.map((col, i) => `${col} = $${i + 2}`).join(', ');

                    const nutQuery = `
                        INSERT INTO tba_supplement_nutrients (${colNames})
                        VALUES (${placeholders})
                        ON CONFLICT (supplement_id) DO UPDATE SET ${updates};
                    `;
                    await client.query(nutQuery, [supId, ...vals]);
                } else {
                    // 영양소 데이터가 없어도 supplement_id는 등록
                    await client.query(
                        `INSERT INTO tba_supplement_nutrients (supplement_id) VALUES ($1) ON CONFLICT DO NOTHING;`,
                        [supId]
                    );
                }
            }

            await client.query('COMMIT');
            totalSaved += batch.length;
            console.log(`⏳ [ETL] 누적 ${totalSaved} / ${rows.length} 건 적재 완료...`);
        }

        console.log(`🎉 [ETL] 완벽합니다! 총 ${totalSaved}건의 영양제 데이터 동기화가 끝났습니다!`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [ETL] 동기화 중 오류 발생:', error);
    } finally {
        client.release();
    }
}

// 수동 실행용 주석 (필요 시 주석 해제하여 1회 실행 후 다시 닫으세요)
// syncSupplementsToDB();

function startEtlScheduler() {
    // 공공데이터 CSV는 보통 1년에 한 번 업데이트 되므로 자동 스케줄러는 꺼두거나 년 단위로 맞춥니다.
    // 현재는 파일 기반이므로 굳이 매월 돌 필요가 없습니다.
    console.log('⏳ [Scheduler] CSV 기반 영양제 동기화 준비 (수동 트리거 방식 권장)');
}

module.exports = { startEtlScheduler, syncSupplementsToDB };