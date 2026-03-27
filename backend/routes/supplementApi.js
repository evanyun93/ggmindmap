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
        COALESCE(
          json_agg(
            json_build_object('nutrientId', n.nutrient_id, 'amountMg', n.amount_mg)
          ) FILTER (WHERE n.nutrient_id IS NOT NULL), '[]'
        ) AS "customNutrients"
      FROM tba_supplements s
      LEFT JOIN tba_supplement_nutrients n ON s.id = n.supplement_id
      WHERE s.name ILIKE $1 OR s.manufacturer ILIKE $1
      GROUP BY s.id
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