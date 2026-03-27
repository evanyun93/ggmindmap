// backend/services/etlService.js
const cron = require('node-cron');
const { pool } = require('../config/database'); // 기존 database.js의 pool 재사용

// [1단계: Extract] 공공데이터 API 호출 (내장 fetch 사용)
async function fetchPublicData(pageNo = 1) {
    const OPEN_API_KEY = process.env.DATA_GO_KR_KEY;
    if (!OPEN_API_KEY) {
        throw new Error('환경변수에 DATA_GO_KR_KEY(식약처 API 키)가 설정되지 않았습니다.');
    }

    // 한 번에 1000개씩 조회 (예시)
    const url = `http://openapi.foodsafetykorea.go.kr/api/${OPEN_API_KEY}/C003/json/${pageNo}/${pageNo + 999}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    return data?.C003?.row || []; // 식약처 데이터 배열 반환
}

// [2단계 & 3단계: Transform & Load] 데이터 정제 및 DB 저장
async function syncSupplementsToDB() {
    console.log('🔄 [ETL] 영양제 공공데이터 동기화 시작...');
    const client = await pool.connect();

    try {
        const rawDataArray = await fetchPublicData(1);

        await client.query('BEGIN'); // 트랜잭션 시작

        for (const item of rawDataArray) {
            // 품목제조신고번호를 고유 ID로 사용
            const supId = `pub_${item.PRDLST_REPORT_NO}`;
            const name = item.PRDLST_NM;
            const manufacturer = item.BSSH_NM;

            // 1. tba_supplements 테이블 UPSERT
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

            // 2. tba_supplement_nutrients 테이블 저장 (성분 매핑 로직)
            // *주의: 실제 서비스에서는 item.NTK_MTHD(섭취방법)나 item.RAWMTRL_NM(원재료명)을 분석하여 영양소 ID 추출 로직 필요
            // 임시 하드코딩 예제
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

        await client.query('COMMIT');
        console.log(`✅ [ETL] 공공데이터 ${rawDataArray.length}건 동기화 완료!`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [ETL] 동기화 중 오류 발생:', error.message);
    } finally {
        client.release();
    }
}

// 서버 실행 시 스케줄러를 등록하는 함수 (server.js에서 호출)
function startEtlScheduler() {
    // 매주 일요일 새벽 3시에 자동 실행
    cron.schedule('0 3 * * 0', () => {
        syncSupplementsToDB();
    });
    console.log('⏳ [Scheduler] 영양제 ETL 동기화 스케줄러 등록 완료 (매주 일요일 03:00)');

    // (옵션) 서버 시작할 때 최초 1회 바로 실행해보고 싶다면 아래 주석 해제
    syncSupplementsToDB();
}

module.exports = { startEtlScheduler, syncSupplementsToDB };