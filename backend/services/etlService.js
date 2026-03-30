// backend/services/etlService.js
const cron = require('node-cron');
const { pool } = require('../config/database'); // 기존 database.js의 pool 재사용

/**
 * 기준규격(STDR_STND) 문자열에서 정확한 1일 섭취량(표시량)을 파싱하는 함수
 * (예: "비타민C : 표시량(100mg)의 80~150%" -> 100 추출)
 */
function parseAndMapNutrients(stdrStndString) {
    if (!stdrStndString) return [];
    const results = [];

    // 오메가3의 경우 식약처에서는 보통 'EPA와 DHA의 합' 또는 'EPA 및 DHA'로 표기합니다.
    const nutrientMap = [
        { regex: /비타민\s*A/i, id: 'VITAMIN_A' },
        { regex: /비타민\s*B/i, id: 'VITAMIN_B' },
        { regex: /비타민\s*C/i, id: 'VITAMIN_C' },
        { regex: /비타민\s*D/i, id: 'VITAMIN_D' },
        { regex: /비타민\s*E/i, id: 'VITAMIN_E' },
        { regex: /아연/i, id: 'ZINC' },
        { regex: /철|제일철/i, id: 'IRON' },
        { regex: /마그네슘/i, id: 'MAGNESIUM' },
        { regex: /칼슘/i, id: 'CALCIUM' },
        { regex: /오메가(?:\s*3)?|EPA\s*(?:와|및)\s*DHA/i, id: 'OMEGA_3' },
    ];

    for (const nut of nutrientMap) {
        // [핵심] "영양소명 ... 표시량(숫자+단위" 형태를 정확히 캡처하는 정규식
        // 1,000mg 처럼 콤마가 들어간 숫자 패턴도 대응: ([\d,]+(?:\.[\d]+)?)
        const amountRegex = new RegExp(nut.regex.source + `.*?표시량\\s*\\(\\s*([\\d,]+(?:\\.[\\d]+)?)\\s*(mg|ug|g|mcg|IU)`, 'i');
        const match = stdrStndString.match(amountRegex);

        if (match) {
            // "1,000" 같은 문자열에서 콤마 제거 후 숫자로 변환
            const value = parseFloat(match[1].replace(/,/g, ''));
            const unit = match[2].toLowerCase();

            let amountMg = 0;

            // 시스템 공통 단위인 mg으로 환산
            if (unit === 'g') amountMg = value * 1000;
            else if (unit === 'ug' || unit === 'mcg') amountMg = value / 1000;
            else amountMg = value; // mg 이거나 IU인 경우 그대로 사용

            results.push({
                nutrientId: nut.id,
                amountMg: amountMg
            });
        }
    }

    return results;
}

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

                // 2. RAWMTRL_NM 대신 STDR_STND(기준규격) 필드를 파싱에 사용
                const nutrientList = parseAndMapNutrients(item.STDR_STND);

                // 파싱된 영양소들을 DB에 저장
                for (const nut of nutrientList) {
                    const nutQuery = `
                      INSERT INTO tba_supplement_nutrients (supplement_id, nutrient_id, amount_mg)
                      VALUES ($1, $2, $3)
                      ON CONFLICT (supplement_id, nutrient_id) DO UPDATE 
                      SET amount_mg = EXCLUDED.amount_mg;
                    `;
                    await client.query(nutQuery, [supId, nut.nutrientId, nut.amountMg]);
                }
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
    console.log('⏳ [Scheduler] 영양제 ETL 동기화 스케줄러 등록 완료 (매월 1일 03:00)');

    // 필요 시 아래 주석을 풀어서 서버 켤 때마다 1회 즉시 실행 (테스트 용도)
    // syncSupplementsToDB();
}

module.exports = { startEtlScheduler, syncSupplementsToDB };