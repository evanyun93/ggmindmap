// backend/routes/supplementApi.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { resolveProfile, calcTotalIntake, calcNutrientStatus, buildRuleBasedComments } = require('../services/supplementAnalysis');

// AI 모델: 현재 Google Gemini 2.5 Flash (무료 티어) 사용
// 추후 유료 플랜 도입 시 아래 한 줄만 교체하면 됨:
//   Anthropic Haiku → require('@anthropic-ai/sdk') + ANTHROPIC_API_KEY
//   더 정확한 분석이 필요하면 gemini-2.5-pro 또는 claude-sonnet으로 업그레이드
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// [GET] /api/supplements/search?q=검색어
router.get('/search', async (req, res) => {
  const keyword = req.query.q;

  // 검색어가 없거나 너무 짧으면 빈 배열 반환
  if (!keyword || keyword.trim().length === 0) {
    return res.json([]);
  }

  try {
    // pg_trgm 인덱스를 타는 ILIKE 검색
    // 영양제 메인 정보와 매핑된 영양소 배열(customNutrients)을 함께 가져옵니다.
    const query = `
                  SELECT 
                    s.id, 
                    s.name, 
                    s.manufacturer,
                    (
                      SELECT json_agg(nut)
                      FROM (
                        SELECT 'VIT_A' AS "nutrientId", n.vit_a AS "amountMg" WHERE n.vit_a > 0
                        UNION ALL SELECT 'VIT_B1', n.vit_b1 WHERE n.vit_b1 > 0
                        UNION ALL SELECT 'VIT_B2', n.vit_b2 WHERE n.vit_b2 > 0
                        UNION ALL SELECT 'NIACIN', n.niacin WHERE n.niacin > 0
                        UNION ALL SELECT 'PANTOTHENIC_ACID', n.pantothenic_acid WHERE n.pantothenic_acid > 0
                        UNION ALL SELECT 'VIT_B6', n.vit_b6 WHERE n.vit_b6 > 0
                        UNION ALL SELECT 'BIOTIN', n.biotin WHERE n.biotin > 0
                        UNION ALL SELECT 'FOLATE', n.folate WHERE n.folate > 0
                        UNION ALL SELECT 'VIT_B12', n.vit_b12 WHERE n.vit_b12 > 0
                        UNION ALL SELECT 'VIT_C', n.vit_c WHERE n.vit_c > 0
                        UNION ALL SELECT 'VIT_D', n.vit_d WHERE n.vit_d > 0
                        UNION ALL SELECT 'VIT_E', n.vit_e WHERE n.vit_e > 0
                        UNION ALL SELECT 'VIT_K', n.vit_k WHERE n.vit_k > 0
                        UNION ALL SELECT 'CALCIUM', n.calcium WHERE n.calcium > 0
                        UNION ALL SELECT 'MAGNESIUM', n.magnesium WHERE n.magnesium > 0
                        UNION ALL SELECT 'IRON', n.iron WHERE n.iron > 0
                        UNION ALL SELECT 'ZINC', n.zinc WHERE n.zinc > 0
                        UNION ALL SELECT 'SELENIUM', n.selenium WHERE n.selenium > 0
                        UNION ALL SELECT 'COPPER', n.copper WHERE n.copper > 0
                        UNION ALL SELECT 'MANGANESE', n.manganese WHERE n.manganese > 0
                        UNION ALL SELECT 'IODINE', n.iodine WHERE n.iodine > 0
                        UNION ALL SELECT 'OMEGA3', n.omega3 WHERE n.omega3 > 0
                        UNION ALL SELECT 'PROBIOTICS', n.probiotics WHERE n.probiotics > 0
                        UNION ALL SELECT 'LUTEIN', n.lutein WHERE n.lutein > 0
                        UNION ALL SELECT 'MILK_THISTLE', n.milk_thistle WHERE n.milk_thistle > 0
                        UNION ALL SELECT 'COQ10', n.coq10 WHERE n.coq10 > 0
                      ) nut
                    ) AS "customNutrients"
                  FROM tba_supplements s
                  LEFT JOIN tba_supplement_nutrients n ON s.id = n.supplement_id
                  WHERE s.name ILIKE $1 OR s.manufacturer ILIKE $1
                  LIMIT 10;
                `;
    // SQL Injection 방지를 위해 파라미터화된 쿼리 사용 (%검색어%)
    const { rows } = await pool.query(query, [`%${keyword.trim()}%`]);

    // 프론트엔드에서 사용하기 편하게 JSON으로 바로 응답
    res.json(rows);
  } catch (error) {
    console.error('❌ [API] 영양제 검색 실패:', error);
    res.status(500).json({ error: '서버 검색 중 오류가 발생했습니다.' });
  }
});

// [PUT] /api/supplements/:id/nutrients — 영양소 직접 수정 (비어있는 칸만 허용)
const ALLOWED_NUTRIENT_COLS = new Set([
  'vit_a','vit_b1','vit_b2','niacin','pantothenic_acid','vit_b6','biotin','folate',
  'vit_b12','vit_c','vit_d','vit_e','vit_k','calcium','magnesium','iron','zinc',
  'selenium','copper','manganese','iodine','omega3','probiotics','lutein','milk_thistle','coq10'
]);

router.put('/:id/nutrients', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  let cols = Object.keys(updates).filter(k => ALLOWED_NUTRIENT_COLS.has(k));
  if (cols.length === 0) return res.status(400).json({ error: '수정할 영양소가 없습니다.' });

  try {
    // 현재 DB 값 조회 — 이미 값이 있는 영양소는 덮어쓰지 않음
    const { rows } = await pool.query(
      `SELECT ${[...ALLOWED_NUTRIENT_COLS].join(', ')} FROM tba_supplement_nutrients WHERE supplement_id = $1`,
      [id]
    );
    if (rows.length > 0) {
      const current = rows[0];
      cols = cols.filter(col => !current[col] || parseFloat(current[col]) === 0);
    }
    if (cols.length === 0) return res.status(400).json({ error: '이미 확인된 값이 있는 영양소는 수정할 수 없습니다.' });

    const setClauses = cols.map((col, i) => `${col} = $${i + 2}`).join(', ');
    const vals = cols.map(col => parseFloat(updates[col]) || 0);

    await pool.query(
      `UPDATE tba_supplement_nutrients SET ${setClauses}, updated_at = NOW() WHERE supplement_id = $1`,
      [id, ...vals]
    );
    res.json({ success: true, updatedCols: cols });
  } catch (error) {
    console.error('❌ [API] 영양소 수정 실패:', error);
    res.status(500).json({ error: '수정 중 오류가 발생했습니다.' });
  }
});

// ─────────────────────────────────────────────────────────────
// [POST] /api/supplements/submit — 크라우드소싱 영양제 사전 추가 제안
// 규칙:
//   1. 같은 IP는 같은 제품을 중복 제안 불가
//   2. 시간당 IP당 최대 5건
//   3. 이미 사전에 있는 제품은 거부
//   4. 2개 이상의 서로 다른 IP가 동일 성분표(±5% 허용)를 제출하면 자동 승인
// ─────────────────────────────────────────────────────────────

// 합리적인 영양소 최대값 (mg 단위, 초과 시 입력 오류로 판단)
const NUTRIENT_MAX_MG = 100000;

function nutrientsMatch(a, b) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.join(',') !== bKeys.join(',')) return false;
  for (const k of aKeys) {
    const va = parseFloat(a[k]);
    const vb = parseFloat(b[k]);
    const tolerance = Math.max(va, vb) * 0.05 + 0.0001;
    if (Math.abs(va - vb) > tolerance) return false;
  }
  return true;
}

router.post('/submit', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const { name, manufacturer = '', nutrients = {} } = req.body;

  // 기본 입력 검증
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ error: '제품명을 2~100자로 입력해주세요.' });
  }
  if (manufacturer.trim().length > 100) {
    return res.status(400).json({ error: '제조사명은 100자 이하로 입력해주세요.' });
  }

  // 영양소 값 정제 (허용 컬럼, 양수, 최대값 이하)
  const cleanNutrients = {};
  for (const [k, v] of Object.entries(nutrients)) {
    if (!ALLOWED_NUTRIENT_COLS.has(k)) continue;
    const val = parseFloat(v);
    if (!isFinite(val) || val <= 0 || val > NUTRIENT_MAX_MG) continue;
    cleanNutrients[k] = val;
  }
  if (Object.keys(cleanNutrients).length === 0) {
    return res.status(400).json({ error: '유효한 영양소 정보를 1개 이상 입력해주세요.' });
  }

  const normName = name.trim().toLowerCase();
  const normMfr  = manufacturer.trim().toLowerCase();

  const client = await pool.connect();
  try {
    // 1. 시간당 제출 횟수 제한 (IP당 5건)
    const { rows: rateRows } = await client.query(
      `SELECT COUNT(*) FROM tba_supplement_submissions
       WHERE submitter_ip = $1 AND submitted_at > NOW() - INTERVAL '1 hour'`,
      [ip]
    );
    if (parseInt(rateRows[0].count) >= 5) {
      return res.status(429).json({ error: '1시간에 최대 5개까지 제안할 수 있습니다.' });
    }

    // 2. 이미 사전에 존재하는 제품인지 확인
    const { rows: existRows } = await client.query(
      `SELECT id FROM tba_supplements WHERE lower(name) = $1 AND lower(manufacturer) = $2`,
      [normName, normMfr]
    );
    if (existRows.length > 0) {
      return res.status(409).json({ error: '이미 사전에 등록된 제품입니다.', supplementId: existRows[0].id });
    }

    // 3. 같은 IP가 이미 이 제품을 제안했는지 확인
    const { rows: dupRows } = await client.query(
      `SELECT id FROM tba_supplement_submissions
       WHERE lower(name) = $1 AND lower(manufacturer) = $2 AND submitter_ip = $3 AND status = 'pending'`,
      [normName, normMfr, ip]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({ error: '이미 제안하신 제품입니다. 다른 사용자의 동의를 기다려주세요.' });
    }

    // 4. 현재 제안 등록
    await client.query(
      `INSERT INTO tba_supplement_submissions (name, manufacturer, nutrients, submitter_ip)
       VALUES ($1, $2, $3, $4)`,
      [name.trim(), manufacturer.trim(), JSON.stringify(cleanNutrients), ip]
    );

    // 5. 다른 IP의 동일 성분표 제안 탐색
    const { rows: pendingRows } = await client.query(
      `SELECT nutrients, submitter_ip FROM tba_supplement_submissions
       WHERE lower(name) = $1 AND lower(manufacturer) = $2 AND status = 'pending' AND submitter_ip != $3`,
      [normName, normMfr, ip]
    );

    const matchingIps = new Set();
    for (const row of pendingRows) {
      if (nutrientsMatch(cleanNutrients, row.nutrients)) {
        matchingIps.add(row.submitter_ip);
      }
    }

    if (matchingIps.size >= 1) {
      // 2개 이상 IP 동의 → 자동 승인
      await client.query('BEGIN');

      const safeName = name.trim().replace(/\s+/g, '_').replace(/[^\w가-힣]/g, '').slice(0, 30);
      const safeMfr  = manufacturer.trim().replace(/\s+/g, '_').replace(/[^\w가-힣]/g, '').slice(0, 20);
      const newId    = `user_${safeMfr}_${safeName}_${Date.now()}`.slice(0, 80);

      await client.query(
        `INSERT INTO tba_supplements (id, name, manufacturer, raw_data, updated_at)
         VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (id) DO NOTHING`,
        [newId, name.trim(), manufacturer.trim(), JSON.stringify({ source: 'crowdsourced' })]
      );

      const nutCols  = Object.keys(cleanNutrients);
      const nutVals  = Object.values(cleanNutrients);
      const colNames = ['supplement_id', ...nutCols].join(', ');
      const placeholders = ['$1', ...nutCols.map((_, i) => `$${i + 2}`)].join(', ');
      const updates  = nutCols.map((col, i) => `${col} = $${i + 2}`).join(', ');
      await client.query(
        `INSERT INTO tba_supplement_nutrients (${colNames}) VALUES (${placeholders})
         ON CONFLICT (supplement_id) DO UPDATE SET ${updates}, updated_at = NOW()`,
        [newId, ...nutVals]
      );

      await client.query(
        `UPDATE tba_supplement_submissions SET status = 'approved'
         WHERE lower(name) = $1 AND lower(manufacturer) = $2`,
        [normName, normMfr]
      );

      await client.query('COMMIT');
      console.log(`✅ [크라우드소싱] 자동 승인: ${name} (${manufacturer})`);
      return res.json({
        status: 'approved',
        message: '제안이 즉시 사전에 반영되었습니다! 이제 누구나 검색할 수 있어요.',
        supplementId: newId,
      });
    }

    res.json({
      status: 'pending',
      message: '제안이 접수되었습니다. 동일한 정보를 입력하는 사용자가 생기면 자동으로 사전에 반영됩니다.',
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [API] 영양제 제안 실패:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// [POST] /api/supplements/analyze — AI 영양제 분석
// body: { supplements, healthInfo? }
// ─────────────────────────────────────────────────────────────
router.post('/analyze', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { supplements, healthInfo: clientHealthInfo } = req.body;

  if (!Array.isArray(supplements) || supplements.length === 0) {
    return res.status(400).json({ error: '분석할 영양제가 없습니다.' });
  }

  // 1. healthInfo: DB 우선, 없으면 클라이언트 제공값, 없으면 null
  let healthInfo = clientHealthInfo || null;
  try {
    const { rows } = await pool.query(
      'SELECT settings FROM tba_user_settings WHERE user_id = $1', [userId]
    );
    const dbHealthInfo = rows[0]?.settings?.healthInfo || null;
    if (dbHealthInfo) healthInfo = dbHealthInfo;
  } catch (_) {}

  const profile = resolveProfile(healthInfo);

  // 2. 영양소 섭취량 계산
  const totals = calcTotalIntake(supplements);
  const nutrientStatuses = calcNutrientStatus(totals, profile);

  // 3. Claude에게 한국어 코멘트 요청
  const profileDesc = healthInfo
    ? `성별: ${profile.gender === 'MALE' ? '남성' : '여성'}, 나이: ${profile.age}세${profile.isPregnant ? ' (임신 중)' : ''}`
    : '건강 정보 없음 (일반 성인 기준으로 분석)';

  const nutrientSummaryLines = nutrientStatuses.map(n => {
    const pct = n.percentage != null ? `${n.percentage}%` : 'DRI 없음';
    const ulInfo = n.ul && n.totalMg > n.ul ? ` [⚠️ 상한량(${n.ul}mg) 초과!]` : '';
    const unit = n.totalMg < 1 ? `${(n.totalMg * 1000).toFixed(1)}μg` : `${n.totalMg.toFixed(1)}mg`;
    return `- [${n.nutrientId}] ${n.name}: 섭취 ${unit}, DRI 대비 ${pct}, 상태: ${n.status}${ulInfo}`;
  }).join('\n');

  const prompt = `당신은 영양제 분석 전문가입니다. 사용자의 영양제 복용 현황을 분석하고 한국어로 조언해주세요.

[사용자 정보]
${profileDesc}

[영양제 목록]
${supplements.map(s => `- ${s.name} (${s.manufacturer || '제조사 미상'}), ${s.dailyDosage || 1}회/일`).join('\n')}

[영양소 섭취 현황 (한국인 영양섭취기준 2020 기준)]
${nutrientSummaryLines}

위 데이터를 바탕으로 다음 JSON 형식으로만 응답해주세요. 마크다운 코드블록 없이 순수 JSON만 출력:
{
  "overallStatus": "WARNING" | "CAUTION" | "GOOD",
  "summaryTitle": "한 줄 요약 제목 (20자 이내)",
  "summaryMessage": "전체 복용 상태에 대한 2~3문장 종합 평가",
  "nutrientComments": {
    "VIT_D": "비타민D에 대한 조언 (예시)",
    "IRON": "철분에 대한 조언 (예시)"
  }
}

중요: nutrientComments의 키는 반드시 위 영양소 현황에 나온 영문 ID(VIT_A, VIT_D, OMEGA3 등)를 그대로 사용하세요. 주의가 필요한 항목만 최대 5개 포함. 상한량(UL) 초과 영양소는 반드시 경고 포함. DRI 없는 영양소(유산균, 루테인 등)는 일반적인 효능 관점에서 코멘트.`;

  // 룰 기반 코멘트를 먼저 계산해두고, AI 성공 시 덮어씀
  // → AI 키 없음 / rate limit / 파싱 실패 어떤 상황에서도 항상 유효한 응답 반환
  const ruleComments = buildRuleBasedComments(nutrientStatuses, profile);
  let aiComments = ruleComments;
  let usedAI = false;

  if (process.env.GEMINI_API_KEY) {
    // 503(과부하)/429(레이트리밋) 발생 시 다음 모델로 순차 시도
    // nutrientComments 키는 영문 nutrientId여야 프론트 n.nutrientId 매핑이 동작함
    const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const raw = result.response.text().trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiComments = JSON.parse(jsonMatch[0]);
          usedAI = true;
          console.log(`✅ [AI 분석] 모델 사용: ${modelName}`);
        }
        break; // 성공 시 루프 탈출
      } catch (err) {
        const isRetryable = err.message.includes('503') || err.message.includes('429') || err.message.includes('unavailable');
        console.warn(`⚠️ [AI 분석] ${modelName} 실패: ${err.message.slice(0, 80)}`);
        if (!isRetryable) break; // 재시도 무의미한 오류(400, 404 등)면 중단
        // 다음 모델로 계속
      }
    }
    if (!usedAI) console.log('ℹ️ [AI 분석] 모든 모델 실패 → 룰 기반 분석으로 응답');
  }

  // 4. 프론트가 사용하는 형식으로 변환
  const nutrientDetails = nutrientStatuses.map(n => {
    const statusMap = { DANGER: '위험', EXCESS: '과다', OVER: '초과', GOOD: '적정', LOW: '부족', HIGH: '고용량', INFO: '참고' };
    const colorMap  = { DANGER: 'RED', EXCESS: 'RED', OVER: 'ORANGE', GOOD: 'GREEN', LOW: 'YELLOW', HIGH: 'TEAL', INFO: 'BLUE' };

    const isMicro = n.totalMg < 1;
    const displayUnit = isMicro ? 'μg' : 'mg';
    const currentAmt = isMicro ? parseFloat((n.totalMg * 1000).toFixed(2)) : parseFloat(n.totalMg.toFixed(2));
    const rdaAmt = n.rda != null ? (isMicro ? parseFloat((n.rda * 1000).toFixed(2)) : parseFloat(n.rda.toFixed(2))) : null;

    return {
      nutrientId: n.nutrientId,
      name: n.name,
      status: statusMap[n.status] || n.status,
      color: colorMap[n.status] || 'BLUE',
      percentage: n.percentage,
      currentAmount: currentAmt,
      recommendedAmount: rdaAmt,
      unit: displayUnit,
      missing: !!n.missing,
      sources: n.sources.map(s => ({
        supplementId: s.supplementId,
        name: s.name,
        amount: isMicro ? parseFloat((s.amountMg * 1000).toFixed(2)) : parseFloat(s.amountMg.toFixed(2)),
        unit: displayUnit,
      })),
      aiBotMessage: aiComments.nutrientComments?.[n.nutrientId] || null,
    };
  });

  res.json({
    success: true,
    data: {
      summary: {
        status: aiComments.overallStatus,
        title: aiComments.summaryTitle,
        message: aiComments.summaryMessage,
      },
      nutrientDetails,
      profile: { ...profile, hasHealthInfo: !!healthInfo },
      usedAI,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// [GET] /api/supplements/user-list?widgetId=xxx — 유저 영양제 목록 조회
// ─────────────────────────────────────────────────────────────
router.get('/user-list', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { widgetId } = req.query;
  if (!widgetId) return res.status(400).json({ error: 'widgetId가 필요합니다.' });

  try {
    const { rows } = await pool.query(
      `SELECT supplement_id, name, manufacturer, daily_dosage, custom_nutrients
       FROM tba_user_supplements
       WHERE user_id = $1 AND widget_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [userId, widgetId]
    );
    const list = rows.map(r => ({
      id: r.supplement_id,
      name: r.name,
      manufacturer: r.manufacturer,
      dailyDosage: r.daily_dosage,
      customNutrients: r.custom_nutrients,
    }));
    res.json(list);
  } catch (err) {
    console.error('❌ [API] 유저 영양제 목록 조회 실패:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ─────────────────────────────────────────────────────────────
// [POST] /api/supplements/user-list — 유저 영양제 목록 전체 저장 (upsert + 삭제 동기화)
// body: { widgetId, supplements: [{ id, name, manufacturer, dailyDosage, customNutrients }] }
// ─────────────────────────────────────────────────────────────
router.post('/user-list', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { widgetId, supplements } = req.body;

  if (!widgetId) return res.status(400).json({ error: 'widgetId가 필요합니다.' });
  if (!Array.isArray(supplements)) return res.status(400).json({ error: 'supplements 배열이 필요합니다.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 현재 저장된 supplement_id 목록 조회
    const { rows: existing } = await client.query(
      `SELECT supplement_id FROM tba_user_supplements WHERE user_id = $1 AND widget_id = $2`,
      [userId, widgetId]
    );
    const existingIds = new Set(existing.map(r => r.supplement_id));
    const incomingIds = new Set(supplements.map(s => String(s.id)));

    // 삭제: 목록에서 빠진 항목 제거
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await client.query(
        `DELETE FROM tba_user_supplements WHERE user_id = $1 AND widget_id = $2 AND supplement_id = ANY($3)`,
        [userId, widgetId, toDelete]
      );
    }

    // upsert: 추가/수정
    for (let i = 0; i < supplements.length; i++) {
      const s = supplements[i];
      const supId = String(s.id);
      const name = String(s.name || '').slice(0, 200);
      const manufacturer = String(s.manufacturer || '').slice(0, 200);
      const dailyDosage = Math.max(1, parseInt(s.dailyDosage) || 1);
      const customNutrients = Array.isArray(s.customNutrients) ? s.customNutrients : [];

      await client.query(
        `INSERT INTO tba_user_supplements
           (user_id, widget_id, supplement_id, name, manufacturer, daily_dosage, custom_nutrients, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, widget_id, supplement_id)
         DO UPDATE SET
           name = EXCLUDED.name,
           manufacturer = EXCLUDED.manufacturer,
           daily_dosage = EXCLUDED.daily_dosage,
           custom_nutrients = EXCLUDED.custom_nutrients,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [userId, widgetId, supId, name, manufacturer, dailyDosage, JSON.stringify(customNutrients), i]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [API] 유저 영양제 목록 저장 실패:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

module.exports = router;