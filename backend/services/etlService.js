// backend/services/etlService.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const cron = require('node-cron');
const { pool } = require('../config/database');

// 우리가 관리할 영양소와 CSV 컬럼명, 그리고 mg 단위 변환 비율 매핑
const NUTRIENT_MAP = [
    { col: '비타민 A(μg RAE)', id: 'VITAMIN_A', factor: 0.001 }, // ug -> mg
    { col: '비타민 C(mg)', id: 'VITAMIN_C', factor: 1 },
    { col: '비타민 D(μg)', id: 'VITAMIN_D', factor: 0.001 },
    { col: '티아민(mg)', id: 'VITAMIN_B1', factor: 1 },
    { col: '리보플라빈(mg)', id: 'VITAMIN_B2', factor: 1 },
    { col: '니아신(mg)', id: 'VITAMIN_B3', factor: 1 },
    { col: '칼슘(mg)', id: 'CALCIUM', factor: 1 },
    { col: '철(mg)', id: 'IRON', factor: 1 },
    { col: '인(mg)', id: 'PHOSPHORUS', factor: 1 },
    { col: '칼륨(mg)', id: 'POTASSIUM', factor: 1 },
    { col: '나트륨(mg)', id: 'SODIUM', factor: 1 },
    { col: '단백질(g)', id: 'PROTEIN', factor: 1000 }, // g -> mg
    { col: '지방(g)', id: 'FAT', factor: 1000 },
    { col: '탄수화물(g)', id: 'CARBOHYDRATE', factor: 1000 },
];

async function syncSupplementsToDB() {
    console.log('🔄 [ETL] CSV 기반 영양제 데이터 동기화 시작...');

    const filePath = path.join(__dirname, '../data/supplements_standard.csv');
    if (!fs.existsSync(filePath)) {
        console.error('❌ CSV 파일이 존재하지 않습니다:', filePath);
        return;
    }

    const rows = [];

    // 1. CSV 파일을 읽어서 배열에 저장 (데이터가 깔끔해서 메모리에 다 올려도 됨)
    await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
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
                const supId = `pub_${row['식품코드']}`;
                const name = row['식품명'];
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

                // 2. 매핑된 영양소 추출 및 저장
                for (const nut of NUTRIENT_MAP) {
                    const cellValue = row[nut.col];

                    // 빈 값이 아니며, 숫자로 변환 가능하고 0보다 큰 경우에만 저장
                    if (cellValue && !isNaN(cellValue)) {
                        const amount = parseFloat(cellValue);
                        if (amount > 0) {
                            const amountMg = amount * nut.factor;

                            // etlService.js 내 수정 예시 (Phase 1 뼈대 구축 시)
                            const nutQuery = `
                                            INSERT INTO tba_supplement_nutrients (supplement_id)
                                            VALUES ($1)
                                            ON CONFLICT (supplement_id) DO NOTHING;
                                            `;
                            // 일단 제품 ID만 등록해두고, 함량은 Phase 2(CSV)에서 해당 컬럼만 UPDATE 칩니다.
                            await client.query(nutQuery, [supId]);
                        }
                    }
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