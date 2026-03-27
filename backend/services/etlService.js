// backend/services/etlService.js
const cron = require('node-cron');
const { pool } = require('../config/database'); // 기존 database.js의 pool 재사용

// [1단계: Extract] 공공데이터 API 호출 (1000개씩 페이징)
async function fetchPublicData(startIndex, endIndex) {
    const OPEN_API_KEY = process.env.DATA_GO_KR_KEY;
    if (!OPEN_API_KEY) {
        throw new Error('환경변수에 DATA_GO_KR_KEY가 없습니다.');
    }

    // startIndex 부터 endIndex 까지 조회
    const url = `http://openapi.foodsafetykorea.go.kr/api/${OPEN_API_KEY}/C003/json/${startIndex}/${endIndex}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();

    // 식약처 API는 에러나 데이터가 없을 때 INFO-200 코드를 뱉기도 함
    if (data?.C003?.RESULT?.CODE !== 'INFO-000') {
        console.log(`[API 응답 메시지] ${data?.C003?.RESULT?.MSG || data?.RESULT?.MSG}`);
    }

    return {
        totalCount: data?.C003?.total_count || 0, // 전체 데이터 갯수
        rows: data?.C003?.row || []               // 현재 페이지의 데이터 배열
    };
}

// [2단계 & 3단계: Transform & Load] 전체 데이터 페이징 동기화
async function syncSupplementsToDB() {
    console.log('🔄 [ETL] 영양제 공공데이터 전체 동기화 시작...');
    const client = await pool.connect();

    let startIndex = 1;
    const batchSize = 1000; // 한 번에 가져올 갯수 (식약처 최대 1000개)
    let totalSaved = 0;
    let hasMoreData = true;

    try {
        while (hasMoreData) {
            let endIndex = startIndex + batchSize - 1;
            console.log(`⏳ [ETL] 데이터 가져오는 중... (${startIndex} ~ ${endIndex})`);

            const { totalCount, rows } = await fetchPublicData(startIndex, endIndex);

            // 더 이상 가져올 데이터가 없으면 루프 종료
            if (rows.length === 0) {
                hasMoreData = false;
                break;
            }

            await client.query('BEGIN'); // 1000개 단위로 트랜잭션 시작

            for (const item of rows) {
                const supId = `pub_${item.PRDLST_REPORT_NO}`;
                const name = item.PRDLST_NM;
                const manufacturer = item.BSSH_NM;

                // 1. 메인 영양제 테이블 저장
                const supQuery = `
          INSERT INTO tba_supplements (id, name, manufacturer, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (id) DO UPDATE 
          SET name = EXCLUDED.name, 
              manufacturer = EXCLUDED.manufacturer, 
              raw_data = EXCLUDED.raw_data, 
              updated_at = NOW();
        `;
                await client.query(supQuery, [supId, name, manufacturer, item]);

                // 2. 임시 영양소 매핑
                const mappedNutrientId = 'VITAMIN_C';
                const amountMg = 100.0;
                const nutQuery = `
          INSERT INTO tba_supplement_nutrients (supplement_id, nutrient_id, amount_mg)
          VALUES ($1, $2, $3)
          ON CONFLICT (supplement_id, nutrient_id) DO UPDATE 
          SET amount_mg = EXCLUDED.amount_mg;
        `;
                await client.query(nutQuery, [supId, mappedNutrientId, amountMg]);
            }

            await client.query('COMMIT'); // 1000개 저장 완료

            totalSaved += rows.length;
            console.log(`✅ [ETL] 누적 ${totalSaved}건 저장 완료...`);

            // 전체 데이터 갯수(totalCount)를 채웠거나, 응답 갯수가 1000개 미만이면 마지막 페이지임
            if (rows.length < batchSize || totalSaved >= totalCount) {
                hasMoreData = false;
            } else {
                startIndex += batchSize; // 다음 페이지로 이동 (예: 1001)
            }
        }

        console.log(`🎉 [ETL] 완벽합니다! 총 ${totalSaved}건의 영양제 데이터 동기화가 끝났습니다!`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [ETL] 동기화 중 오류 발생:', error.message);
    } finally {
        client.release();
    }
}

// 서버 실행 시 스케줄러를 등록하는 함수 (server.js에서 호출)
function startEtlScheduler() {
    // 매월 1일 새벽 3시에 자동 실행
    cron.schedule('0 3 1 * *', () => {
        syncSupplementsToDB();
    });
    console.log('⏳ [Scheduler] 영양제 ETL 동기화 스케줄러 등록 완료 (매주 일요일 03:00)');

    // (옵션) 서버 시작할 때 최초 1회 바로 실행해보고 싶다면 아래 주석 해제
    // syncSupplementsToDB();
}

module.exports = { startEtlScheduler, syncSupplementsToDB };