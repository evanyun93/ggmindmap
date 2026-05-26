// backend/services/supplementAnalysis.js
// 한국인 영양섭취기준(2020) 기반 영양소 분석 로직

// ── 영양소 한국어 이름 ──────────────────────────────────────────
const NUTRIENT_NAME_KO = {
  VIT_A: '비타민 A', VIT_B1: '비타민 B1', VIT_B2: '비타민 B2',
  NIACIN: '나이아신', PANTOTHENIC_ACID: '판토텐산', VIT_B6: '비타민 B6',
  BIOTIN: '비오틴', FOLATE: '엽산', VIT_B12: '비타민 B12',
  VIT_C: '비타민 C', VIT_D: '비타민 D', VIT_E: '비타민 E', VIT_K: '비타민 K',
  CALCIUM: '칼슘', MAGNESIUM: '마그네슘', IRON: '철분', ZINC: '아연',
  SELENIUM: '셀레늄', COPPER: '구리', MANGANESE: '망간', IODINE: '요오드',
  OMEGA3: '오메가3', PROBIOTICS: '유산균', LUTEIN: '루테인',
  MILK_THISTLE: '밀크시슬', COQ10: '코엔자임Q10',
};

// ── 항상 분석에 포함할 핵심 영양소 (복용 중이지 않아도 0mg으로 표시) ──────────
// 결핍 시 체감 영향이 크거나 한국인에게 부족하기 쉬운 영양소 위주
const CORE_NUTRIENTS = [
  'VIT_D',    // 햇빛 부족한 실내 생활자에 흔한 결핍
  'VIT_B12',  // 채식·고령에서 특히 중요
  'VIT_C',    // 기본 항산화
  'FOLATE',   // 여성·임산부 필수
  'CALCIUM',  // 뼈·치아
  'MAGNESIUM',// 에너지·신경 이완
  'IRON',     // 빈혈 예방, 여성에 중요
  'ZINC',     // 면역·상처 회복
  'OMEGA3',   // 한국인 평균 섭취 부족
  'VIT_B1',   // 에너지 대사
  'VIT_B6',   // 신경·호르몬
];

// ── 권장섭취량(RDA/AI) — mg 단위 ─────────────────────────────────
// 기준: 한국인 영양섭취기준 2020 (보건복지부/한국영양학회)
// 임신 여성은 별도 가산값 적용
const DRI = {
  // [male_young, male_adult, male_middle, male_senior, female_young, female_adult, female_middle, female_senior]
  // young=19~29, adult=30~49, middle=50~64, senior=65+
  VIT_A:            { male: [0.800, 0.800, 0.750, 0.700], female: [0.650, 0.650, 0.600, 0.550], pregnancyAdd: 0.070, unit: 'μg×1000' },
  VIT_B1:           { male: [1.2,   1.2,   1.2,   1.1  ], female: [1.1,   1.1,   1.1,   1.0  ], pregnancyAdd: 0.4,   unit: 'mg' },
  VIT_B2:           { male: [1.5,   1.5,   1.5,   1.3  ], female: [1.2,   1.2,   1.2,   1.1  ], pregnancyAdd: 0.4,   unit: 'mg' },
  NIACIN:           { male: [16,    16,    16,    14   ], female: [14,    14,    14,    13   ], pregnancyAdd: 4,     unit: 'mg NE' },
  PANTOTHENIC_ACID: { male: [5,     5,     5,     5    ], female: [5,     5,     5,     5    ], pregnancyAdd: 1,     unit: 'mg' },
  VIT_B6:           { male: [1.5,   1.5,   1.5,   1.5  ], female: [1.4,   1.4,   1.4,   1.4  ], pregnancyAdd: 0.6,   unit: 'mg' },
  BIOTIN:           { male: [0.030, 0.030, 0.030, 0.030], female: [0.030, 0.030, 0.030, 0.030], pregnancyAdd: 0,     unit: 'μg×1000' },
  FOLATE:           { male: [0.400, 0.400, 0.400, 0.400], female: [0.400, 0.400, 0.400, 0.400], pregnancyAdd: 0.200, unit: 'μg×1000' },
  VIT_B12:          { male: [0.0024,0.0024,0.0024,0.0024], female:[0.0024,0.0024,0.0024,0.0024], pregnancyAdd: 0.0002, unit:'μg×1000' },
  VIT_C:            { male: [100,   100,   100,   100  ], female: [100,   100,   100,   100  ], pregnancyAdd: 10,    unit: 'mg' },
  VIT_D:            { male: [0.015, 0.015, 0.015, 0.020], female: [0.015, 0.015, 0.015, 0.020], pregnancyAdd: 0,     unit: 'μg×1000' },
  VIT_E:            { male: [12,    12,    12,    12   ], female: [12,    12,    12,    12   ], pregnancyAdd: 0,     unit: 'mg α-TE' },
  VIT_K:            { male: [0.075, 0.075, 0.075, 0.075], female: [0.065, 0.065, 0.065, 0.065], pregnancyAdd: 0,     unit: 'μg×1000' },
  CALCIUM:          { male: [800,   800,   750,   700  ], female: [700,   700,   800,   800  ], pregnancyAdd: 0,     unit: 'mg' },
  MAGNESIUM:        { male: [360,   370,   370,   370  ], female: [280,   280,   280,   280  ], pregnancyAdd: 40,    unit: 'mg' },
  IRON:             { male: [10,    10,    10,    9    ], female: [14,    14,    8,     7    ], pregnancyAdd: 10,    unit: 'mg' },
  ZINC:             { male: [10,    10,    10,    9    ], female: [8,     8,     8,     7    ], pregnancyAdd: 2.5,   unit: 'mg' },
  SELENIUM:         { male: [0.060, 0.060, 0.060, 0.060], female: [0.055, 0.055, 0.055, 0.055], pregnancyAdd: 0.005, unit: 'μg×1000' },
  COPPER:           { male: [0.900, 0.900, 0.900, 0.900], female: [0.800, 0.800, 0.800, 0.800], pregnancyAdd: 0.1,   unit: 'mg' },
  MANGANESE:        { male: [4.0,   4.0,   4.0,   4.0  ], female: [3.5,   3.5,   3.5,   3.5  ], pregnancyAdd: 0,     unit: 'mg' },
  IODINE:           { male: [0.150, 0.150, 0.150, 0.150], female: [0.150, 0.150, 0.150, 0.150], pregnancyAdd: 0.070, unit: 'μg×1000' },
  OMEGA3:           { male: [500,   500,   500,   500  ], female: [500,   500,   500,   500  ], pregnancyAdd: 200,   unit: 'mg' },
  // 아래는 공식 DRI 없음 — 참고값(beneficial threshold)
  PROBIOTICS:       null,
  LUTEIN:           null,
  MILK_THISTLE:     null,
  COQ10:            null,
};

// ── 상한섭취량(UL) — mg 단위, null = 설정 없음 ────────────────────
const UL = {
  VIT_A: 3.0, VIT_B1: null, VIT_B2: null,
  NIACIN: 35, PANTOTHENIC_ACID: null, VIT_B6: 100,
  BIOTIN: null, FOLATE: 1.0, VIT_B12: null,
  VIT_C: 2000, VIT_D: 0.100, VIT_E: 540, VIT_K: null,
  CALCIUM: 2500, MAGNESIUM: 350, IRON: 45, ZINC: 35,
  SELENIUM: 0.400, COPPER: 10, MANGANESE: 11, IODINE: 2.4,
  OMEGA3: 3000, PROBIOTICS: null, LUTEIN: null, MILK_THISTLE: null, COQ10: null,
};

function getAgeGroup(age) {
  if (age < 30) return 0;   // young 19-29
  if (age < 50) return 1;   // adult 30-49
  if (age < 65) return 2;   // middle 50-64
  return 3;                  // senior 65+
}

/**
 * healthInfo(저장된 사용자 정보)로부터 분석에 필요한 프로필을 정규화
 */
function resolveProfile(healthInfo) {
  const gender = (healthInfo?.gender || 'FEMALE').toUpperCase();
  const birthYear = parseInt(healthInfo?.birthYear) || 0;
  const age = birthYear > 0 ? (new Date().getFullYear() - birthYear) : 30;
  const isPregnant = gender === 'FEMALE' && healthInfo?.isPregnant === 'yes';
  return { gender, age, isPregnant };
}

/**
 * 영양소 일일 총 섭취량 계산
 * supplements: [{ id, name, manufacturer, dailyDosage, customNutrients: [{nutrientId, amountMg}] }]
 */
function calcTotalIntake(supplements) {
  const totals = {};   // nutrientId → { totalMg, sources }
  for (const sup of supplements) {
    const dosage = Math.max(1, parseInt(sup.dailyDosage) || 1);
    for (const nut of (sup.customNutrients || [])) {
      const { nutrientId, amountMg } = nut;
      if (!amountMg || amountMg <= 0) continue;
      if (!totals[nutrientId]) totals[nutrientId] = { totalMg: 0, sources: [] };
      totals[nutrientId].totalMg += amountMg * dosage;
      totals[nutrientId].sources.push({
        supplementId: sup.id,
        name: sup.name,
        amountMg: amountMg * dosage,
      });
    }
  }
  return totals;
}

/**
 * 섭취량 vs DRI/UL 비교 결과 계산
 * Returns: [{ nutrientId, name, totalMg, rda, ul, percentage, status, sources }]
 */
function calcNutrientStatus(totals, profile) {
  const { gender, age, isPregnant } = profile;
  const gKey = gender === 'MALE' ? 'male' : 'female';
  const ageIdx = getAgeGroup(age);
  const results = [];

  for (const [nutrientId, data] of Object.entries(totals)) {
    const driMeta = DRI[nutrientId];
    const ul = UL[nutrientId] ?? null;
    const name = NUTRIENT_NAME_KO[nutrientId] || nutrientId;
    const totalMg = data.totalMg;

    let rda = null;
    if (driMeta) {
      rda = driMeta[gKey]?.[ageIdx] ?? null;
      if (rda && isPregnant && driMeta.pregnancyAdd) rda += driMeta.pregnancyAdd;
    }

    const percentage = rda ? Math.round((totalMg / rda) * 100) : null;

    let status;
    if (ul && totalMg > ul) {
      status = 'DANGER';
    } else if (percentage !== null && percentage > 150 && ul !== null) {
      // UL이 명시된 영양소만 EXCESS(과잉) — 지용성·미네랄 등 축적 위험 있는 경우
      status = 'EXCESS';
    } else if (percentage !== null && percentage > 150 && ul === null) {
      // UL 없는 수용성 비타민(B군 등) 고용량 → HIGH(고용량) — 과잉 배출되므로 경고 등급 낮춤
      status = 'HIGH';
    } else if (percentage !== null && percentage > 100) {
      status = 'OVER';
    } else if (percentage !== null && percentage >= 50) {
      status = 'GOOD';
    } else if (percentage !== null) {
      status = 'LOW';
    } else {
      status = 'INFO';  // DRI 없는 영양소
    }

    const sources = data.sources.map(s => ({
      supplementId: s.supplementId,
      name: s.name,
      amountMg: parseFloat(s.amountMg.toFixed(4)),
    }));

    results.push({ nutrientId, name, totalMg: parseFloat(totalMg.toFixed(4)), rda, ul, percentage, status, sources });
  }

  // 복용 중이지 않은 핵심 영양소를 0mg으로 추가
  const presentIds = new Set(Object.keys(totals));
  for (const nutrientId of CORE_NUTRIENTS) {
    if (presentIds.has(nutrientId)) continue;
    const driMeta = DRI[nutrientId];
    const ul = UL[nutrientId] ?? null;
    const name = NUTRIENT_NAME_KO[nutrientId] || nutrientId;
    let rda = null;
    if (driMeta) {
      rda = driMeta[gKey]?.[ageIdx] ?? null;
      if (rda && isPregnant && driMeta.pregnancyAdd) rda += driMeta.pregnancyAdd;
    }
    const percentage = rda ? 0 : null;
    const status = rda ? 'LOW' : 'INFO';
    results.push({ nutrientId, name, totalMg: 0, rda, ul, percentage, status, sources: [], missing: true });
  }

  // 위험>과잉>초과>양호>부족>고용량>정보 순 정렬
  // 같은 status 안에서는 복용 중인 영양소가 앞, missing(미복용)이 뒤
  const order = { DANGER: 0, EXCESS: 1, OVER: 2, GOOD: 3, LOW: 4, HIGH: 5, INFO: 6 };
  results.sort((a, b) => {
    const statusDiff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return (a.missing ? 1 : 0) - (b.missing ? 1 : 0);
  });
  return results;
}

// ── 안전 조언 메시지 (룰 기반 fallback용) ───────────────────────
const NUTRIENT_ADVICE = {
  VIT_A:            { over: '비타민 A는 지용성이라 과잉 섭취 시 간에 축적될 수 있어요. 용량을 줄이거나 주기를 조정해보세요.', low: '비타민 A는 야간 시력과 면역에 중요해요. 식품(당근, 간)으로도 보충할 수 있어요.' },
  VIT_D:            { over: '비타민 D는 지용성이라 상한량 초과 시 고칼슘혈증 위험이 있어요. 의사와 상담을 권장해요.', low: '비타민 D는 뼈 건강과 면역에 필수예요. 햇빛 노출이 적다면 보충제가 도움이 돼요.' },
  VIT_E:            { over: '비타민 E 고용량은 혈액 응고에 영향을 줄 수 있어요. 특히 항응고제 복용 중이라면 주의하세요.' },
  IRON:             { over: '철분 과잉은 소화장애와 산화 스트레스를 유발할 수 있어요. 특히 공복 복용은 피해주세요.', low: '철분이 부족하면 피로감이 생길 수 있어요. 비타민 C와 함께 섭취하면 흡수율이 높아져요.' },
  ZINC:             { over: '아연 과잉은 구리 흡수를 방해하고 면역 기능을 오히려 떨어뜨릴 수 있어요.' },
  SELENIUM:         { over: '셀레늄은 상한량이 낮아요. 과잉 시 탈모·손발톱 이상 등 부작용이 생길 수 있어요.' },
  VIT_B6:           { over: '비타민 B6 장기 고용량 복용은 말초신경 이상을 일으킬 수 있어요. 용량을 확인해보세요.' },
  CALCIUM:          { over: '칼슘 과잉은 신장결석 위험을 높일 수 있어요. 마그네슘과 함께 복용하면 균형이 좋아요.' },
  MAGNESIUM:        { over: '마그네슘 과잉(보충제 기준)은 설사를 유발할 수 있어요. 분할 복용을 고려해보세요.' },
  IODINE:           { over: '요오드 과잉은 갑상선 기능에 영향을 줄 수 있어요. 갑상선 질환이 있다면 특히 주의하세요.' },
  OMEGA3:           { over: '오메가3 고용량은 혈액 응고를 저하시킬 수 있어요. 수술 전이라면 중단을 고려해보세요.' },
  FOLATE:           { over: '엽산(보충제) 과잉은 B12 결핍을 가릴 수 있어요. 특히 고령이라면 B12 상태도 확인해보세요.' },
};

/**
 * 룰 기반 분석 코멘트 생성 (AI 없이도 의미 있는 피드백 제공)
 */
function buildRuleBasedComments(nutrientStatuses, profile) {
  const dangers  = nutrientStatuses.filter(n => n.status === 'DANGER');
  const excesses = nutrientStatuses.filter(n => n.status === 'EXCESS');
  const highs    = nutrientStatuses.filter(n => n.status === 'HIGH');
  const overs    = nutrientStatuses.filter(n => n.status === 'OVER');
  const lows     = nutrientStatuses.filter(n => n.status === 'LOW');

  let overallStatus, summaryTitle, summaryMessage;
  const nutrientComments = {};

  if (dangers.length > 0) {
    overallStatus = 'WARNING';
    const names = dangers.map(n => n.name).join(', ');
    summaryTitle = `상한량 초과 영양소 ${dangers.length}개`;
    summaryMessage = `${names}이(가) 상한섭취량을 초과했어요. 지속 복용 시 건강에 악영향을 줄 수 있으니 용량을 즉시 조정하거나 전문가와 상담하세요.`;
    for (const n of dangers) {
      const advice = NUTRIENT_ADVICE[n.nutrientId];
      nutrientComments[n.nutrientId] = advice?.over ?? `${n.name}이(가) 상한섭취량(${n.ul}mg)을 ${((n.totalMg / n.ul - 1) * 100).toFixed(0)}% 초과했어요. 즉시 줄이는 것을 권장해요.`;
    }
  } else if (excesses.length > 0) {
    overallStatus = 'CAUTION';
    const names = excesses.map(n => n.name).join(', ');
    summaryTitle = `과잉 섭취 영양소 ${excesses.length}개`;
    summaryMessage = `${names}의 섭취량이 권장량의 150%를 넘었어요. 지용성 비타민이나 미네랄은 축적될 수 있으니 주기적으로 용량을 점검해보세요.`;
    for (const n of excesses) {
      const advice = NUTRIENT_ADVICE[n.nutrientId];
      nutrientComments[n.nutrientId] = advice?.over ?? `${n.name} 섭취량이 권장량의 ${n.percentage}%예요. 적정 수준(100~150%)으로 조절을 고려해보세요.`;
    }
    // HIGH도 있으면 요약에 추가 안내
    if (highs.length > 0) {
      summaryMessage += ` ${highs.map(n => n.name).join(', ')}은 고용량이지만 수용성이라 큰 위험은 없어요.`;
    }
  } else if (highs.length > 0) {
    // EXCESS 없이 HIGH만 있는 경우: 안심 메시지
    overallStatus = 'GOOD';
    const names = highs.map(n => n.name).join(', ');
    summaryTitle = '고용량 수용성 비타민 포함';
    summaryMessage = `${names}의 섭취량이 일일 권장량보다 많지만, 수용성 비타민이라 과잉분은 대부분 체외로 배출돼요. 상한섭취량(UL)이 설정되어 있지 않은 영양소들입니다.`;
    for (const n of highs) {
      nutrientComments[n.nutrientId] = `${n.name}은 권장량의 ${n.percentage}%로 고용량이지만, 수용성 비타민이라 초과분은 소변으로 배출돼요. 장기 고용량 복용 시에는 주기적으로 전문가와 상담을 권장해요.`;
    }
  } else if (overs.length > 0) {
    overallStatus = 'CAUTION';
    summaryTitle = '일부 영양소 권장량 초과';
    summaryMessage = `${overs.map(n => n.name).join(', ')}의 섭취량이 권장량을 약간 초과했어요. 단기적으로는 큰 문제가 없지만 지속 여부를 체크해보세요.`;
  } else if (lows.length > 0) {
    overallStatus = 'GOOD';
    summaryTitle = '전반적으로 균형 잡힌 복용';
    summaryMessage = `복용 중인 영양제의 용량은 안전 범위 내에 있어요. ${lows.map(n => n.name).join(', ')}은 섭취량이 낮으니 식품으로 보충하면 좋을 수 있어요.`;
    for (const n of lows) {
      const advice = NUTRIENT_ADVICE[n.nutrientId];
      if (advice?.low) nutrientComments[n.nutrientId] = advice.low;
    }
  } else {
    overallStatus = 'GOOD';
    summaryTitle = '균형 잡힌 영양제 복용';
    summaryMessage = '현재 복용 중인 영양제 모두 권장 범위 내에 있어요. 식사와 함께 꾸준히 복용하면 더욱 효과적이에요.';
  }

  if (profile.isPregnant) {
    summaryMessage += ' 임신 중이시므로 영양소 요구량이 높아졌어요. 산부인과 전문의와 정기적으로 상담하세요.';
  }

  return { overallStatus, summaryTitle, summaryMessage, nutrientComments };
}

module.exports = { resolveProfile, calcTotalIntake, calcNutrientStatus, buildRuleBasedComments, NUTRIENT_NAME_KO, UL };
