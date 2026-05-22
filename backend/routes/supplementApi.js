// backend/routes/supplementApi.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database'); // 기존 DB 풀 가져오기

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

module.exports = router;