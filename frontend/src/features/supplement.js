import { apiFetch } from '../services/api.js';
import { syncService } from '../services/sync.js';

// ───────── 영양소 메타데이터 (API nutrientId → 한국어 이름, 단위 변환) ─────────
// amountMg: DB에 mg 단위로 저장. μg 단위 영양소(A, D, B12 등)는 저장 시 factor 0.001 적용됨.
// → 값 < 1이면 μg로 환산해서 표시.
const NUTRIENT_META = {
  VIT_A:            { name: '비타민 A',    category: 'vitamin',    color: '#ff9800' }, // 주황 (당근)
  VIT_B1:           { name: '비타민 B1',   category: 'vitamin',    color: '#ffca28' }, // 황금
  VIT_B2:           { name: '비타민 B2',   category: 'vitamin',    color: '#c6e000' }, // 라임
  NIACIN:           { name: '나이아신',    category: 'vitamin',    color: '#ffb300' }, // 앰버
  PANTOTHENIC_ACID: { name: '판토텐산',    category: 'vitamin',    color: '#26c6da' }, // 시안
  VIT_B6:           { name: '비타민 B6',   category: 'vitamin',    color: '#29b6f6' }, // 스카이블루
  BIOTIN:           { name: '비오틴',      category: 'vitamin',    color: '#f48fb1' }, // 핑크
  FOLATE:           { name: '엽산',        category: 'vitamin',    color: '#81c784' }, // 연두
  VIT_B12:          { name: '비타민 B12',  category: 'vitamin',    color: '#ef9a9a' }, // 연빨강
  VIT_C:            { name: '비타민 C',    category: 'vitamin',    color: '#ff7043' }, // 시트러스 오렌지
  VIT_D:            { name: '비타민 D',    category: 'vitamin',    color: '#ffe57f' }, // 햇살 노랑
  VIT_E:            { name: '비타민 E',    category: 'vitamin',    color: '#66bb6a' }, // 초록
  VIT_K:            { name: '비타민 K',    category: 'vitamin',    color: '#26a69a' }, // 다크 틸
  CALCIUM:          { name: '칼슘',        category: 'mineral',    color: '#64b5f6' }, // 파랑
  MAGNESIUM:        { name: '마그네슘',    category: 'mineral',    color: '#9575cd' }, // 보라
  IRON:             { name: '철분',        category: 'mineral',    color: '#e57373' }, // 레드
  ZINC:             { name: '아연',        category: 'mineral',    color: '#ba68c8' }, // 바이올렛
  SELENIUM:         { name: '셀레늄',      category: 'mineral',    color: '#4db6ac' }, // 틸
  COPPER:           { name: '구리',        category: 'mineral',    color: '#a1887f' }, // 구릿빛
  MANGANESE:        { name: '망간',        category: 'mineral',    color: '#5c6bc0' }, // 인디고
  IODINE:           { name: '요오드',      category: 'mineral',    color: '#4dd0e1' }, // 아쿠아
  OMEGA3:           { name: '오메가3',     category: 'functional', color: '#1e88e5' }, // 오션블루
  PROBIOTICS:       { name: '유산균',      category: 'functional', color: '#43a047' }, // 바이오 그린
  LUTEIN:           { name: '루테인',      category: 'functional', color: '#f9a825' }, // 매리골드
  MILK_THISTLE:     { name: '밀크시슬',    category: 'functional', color: '#ab47bc' }, // 엉겅퀴 보라
  COQ10:            { name: '코엔자임Q10', category: 'functional', color: '#ffd600' }, // 골드
};

function formatNutrientAmount(amountMg) {
  if (amountMg == null || amountMg <= 0) return null;
  if (amountMg < 1) {
    const ug = amountMg * 1000;
    return `${parseFloat(ug.toFixed(1))}μg`;
  }
  return `${parseFloat(amountMg.toFixed(1))}mg`;
}

// ───────── API Mock Data (분석용은 아직 백엔드가 없으므로 유지) ─────────

// 백엔드 요청/응답 시뮬레이터 (추후 AI 분석 API 완성 시 교체)
const mockApiAnalysis = (payload) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("[Mock API] Received Request Payload:", JSON.stringify(payload, null, 2));
      resolve({
        success: true,
        data: {
          summary: {
            status: "WARNING",
            title: "영양제 밸런스 점검 필요!",
            message: "비타민 B군과 철분의 복용량이 일일 권장량을 초과했습니다. 주의하세요!"
          },
          nutrientDetails: [
            {
              nutrientId: "IRON", name: "철분", status: "과다", color: "RED",
              percentage: 180, currentAmount: 45, recommendedAmount: 25, unit: "mg",
              sources: [{ supplementId: "sup_001", name: "센트룸 멀티비타민", amount: 15, unit: "mg" }, { supplementId: "sup_042", name: "단독 철분제", amount: 30, unit: "mg" }],
              aiBotMessage: "복용 간격을 조절하거나 한 제품을 변경해 보세요."
            },
            {
              nutrientId: "VITAMIN_B", name: "비타민 B군", status: "과다", color: "ORANGE",
              percentage: 160, currentAmount: 2.1, recommendedAmount: 1.3, unit: "mg",
              sources: [{ supplementId: "sup_001", name: "센트룸 멀티비타민", amount: 2.1, unit: "mg" }]
            },
            {
              nutrientId: "VITAMIN_C", name: "비타민 C", status: "적정", color: "GREEN",
              percentage: 100, currentAmount: 100, recommendedAmount: 100, unit: "mg", sources: []
            },
            {
              nutrientId: "ZINC", name: "아연", status: "부족", color: "YELLOW",
              percentage: 40, currentAmount: 4, recommendedAmount: 10, unit: "mg", sources: []
            }
          ]
        }
      });
    }, 1500);
  });
};

/**
 * 실제 백엔드 API를 호출하여 검색 결과를 가져오는 비동기 함수
 */
async function fetchSupplements(keyword) {
  if (!keyword || keyword.trim() === '') return [];
  try {
    const response = await apiFetch(`/api/supplements/search?q=${encodeURIComponent(keyword)}`);
    if (!response.ok) throw new Error('네트워크 응답 실패');
    return await response.json();
  } catch (error) {
    console.error('영양제 검색 오류:', error);
    return [];
  }
}

// ───────── 위젯 상태(State) 및 로직 관리 클래스 ─────────
class SupplementWidget {
  constructor(el, data) {
    this.el = el;
    this.widgetData = data;
    this.container = el.querySelector('.supplement-view-container');

    // State 객체
    this.state = {
      healthInfo: null,  // /api/auth/health-info 에서 로드
      supplements: [],
      analysisStatus: 'IDLE', // 'IDLE' | 'LOADING' | 'SUCCESS'
      analysisResult: null
    };

    // 검색/폴백 폼 상태
    this.uiState = { isAddFormOpen: false, searchKeyword: '' };

    // 타임아웃
    this.debounceTimer = null;
    this.saveTimer = null;

    this.initCollapse(el);
    this.render();
    this._loadList();
  }

  get _widgetId() {
    return this.el.dataset.id;
  }

  async _loadList() {
    try {
      const [listRes, healthRes] = await Promise.all([
        apiFetch(`/api/supplements/user-list?widgetId=${encodeURIComponent(this._widgetId)}`),
        apiFetch('/api/auth/health-info'),
      ]);
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list) && list.length > 0) {
          this.state.supplements = list;
          this.renderSupplements();
        }
      }
      if (healthRes.ok) {
        const { healthInfo } = await healthRes.json();
        this.state.healthInfo = healthInfo || null;
      }
    } catch (err) {
      console.error('[Supplement] 초기 데이터 로드 실패:', err);
    }
  }

  _saveList() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await apiFetch('/api/supplements/user-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgetId: this._widgetId, supplements: this.state.supplements }),
        });
      } catch (err) {
        console.error('[Supplement] 목록 저장 실패:', err);
      }
    }, 800);
  }

  // 💡 [V6 추가] 접기/펼치기 기능 및 초기 상태 로드
  initCollapse(el) {
    const header = el.querySelector('.supplement-header');
    if (!header) return;

    const widgetId = el.dataset.id;

    // 초기 상태 로드 (기기별 독립 저장 V6)
    syncService.getData('SUPPLEMENT_COLLAPSED', widgetId).then(val => {
      if (val === true || val === 'true') {
        el.classList.add('collapsed');
      }
    });

    // 헤더 클릭 시 접기 토글
    header.addEventListener('mousedown', (e) => {
      // 버튼 클릭 시에는 무시
      if (e.target.closest('button, input, .supplement-widget-title')) return;

      let isDragging = false;
      const startY = e.clientY;
      const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!isDragging) {
          const collapsed = el.classList.toggle('collapsed');
          // 기기별 상태 자동 분리 저장
          syncService.setData('SUPPLEMENT_COLLAPSED', widgetId, collapsed);

          // 레이아웃 동기화 트리거
          import('./dashboard-grid.js').then(m => {
            if (m.saveLayout) m.saveLayout();
          });
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // 전체 프레임 렌더링
  render() {
    this.container.innerHTML = `
      <h4 class="sup-section-title">내가 먹는 영양제 리스트 <span class="sup-daily-badge">1일 섭취 기준</span></h4>
      <div class="sup-list-container"></div>
      
      <div class="sup-add-container">
        <button class="sup-add-btn">
          <span>영양제 추가하기</span>
          <div class="sup-add-icons">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </button>

        <div class="sup-fallback-wrapper">
          <div class="sup-input-row">
            <label>영양제 검색</label>
            <input type="text" class="sup-input sup-search-input" placeholder="제품명 검색...">
          </div>
          <div class="sup-auto-list" style="display:none;"></div>

          <div class="sup-manual-form" style="display:none; flex-direction:column; gap:8px;">
            <div style="font-size:12px; color:#6b7280; text-align:center; padding:4px 0;">찾는 제품이 없나요? 직접 입력해주세요.</div>
            <div class="sup-input-row">
              <label>제품명</label>
              <input type="text" class="sup-input sup-manual-name" placeholder="예: 직접 만든 비타민">
            </div>
            <div class="sup-input-row">
              <label>제조사</label>
              <input type="text" class="sup-input sup-manual-maker" placeholder="예: 수제제약">
            </div>
            <div class="sup-btn-group">
              <button class="sup-btn-action sup-btn-cancel">취소</button>
              <button class="sup-btn-action sup-btn-save">추가 저장</button>
            </div>
          </div>
        </div>
      </div>

      <button class="sup-btn-analyze">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sup-btn-icon"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span>분석하기</span>
      </button>

      <div class="sup-results-container" style="display:none;">
        <div class="sup-ai-alert">
          <svg class="sup-ai-bg-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div class="sup-ai-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="alert-title-text"></span>
          </div>
          <div class="sup-ai-message"></div>
        </div>

        <h4 class="sup-section-title">오늘의 영양소 섭취 현황</h4>
        <div class="sup-nutrient-grid"></div>
        <div class="sup-bottom-details"></div>
      </div>
    `;

    this.bindEvents();
    this.renderSupplements();
  }

  // 영양제 목록 렌더링
  renderSupplements() {
    const listWrap = this.container.querySelector('.sup-list-container');
    listWrap.innerHTML = '';

    this.state.supplements.forEach((sup, idx) => {
      const dosage = sup.dailyDosage || 1;
      const pillsHtml = this._buildNutrientPills(sup.customNutrients, dosage);
      const isCustom = String(sup.id).startsWith('custom_');
      listWrap.innerHTML += `
        <div class="sup-item" data-id="${sup.id}" data-idx="${idx}">
          <div class="sup-item-top">
            <div class="sup-item-info">
              <div class="sup-item-icon">💊</div>
              <div class="sup-item-text">
                <span class="sup-item-name">${sup.name}</span>
                <div class="sup-item-meta-row">
                  <span class="sup-item-maker">${sup.manufacturer || '직접입력'}</span>
                  <div class="sup-item-dosage">
                    <button class="sup-dosage-btn sup-dosage-minus" data-idx="${idx}">−</button>
                    <span class="sup-dosage-val">${dosage}</span>
                    <span class="sup-dosage-unit">회/일</span>
                    <button class="sup-dosage-btn sup-dosage-plus" data-idx="${idx}">+</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="sup-item-actions">
              <button class="sup-item-edit-btn" data-idx="${idx}" title="영양성분 수정 (1회 섭취량 기준)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                수정
              </button>
              <button class="sup-item-del-btn" data-idx="${idx}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                삭제
              </button>
            </div>
          </div>
          ${pillsHtml}
        </div>
      `;
    });

    listWrap.querySelectorAll('.sup-dosage-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        const sup = this.state.supplements[i];
        if (btn.classList.contains('sup-dosage-plus')) {
          sup.dailyDosage = (sup.dailyDosage || 1) + 1;
        } else {
          sup.dailyDosage = Math.max(1, (sup.dailyDosage || 1) - 1);
        }
        this.renderSupplements();
        this._saveList();
        if (this.state.analysisStatus === 'SUCCESS') this.resetAnalysis();
      });
    });

    listWrap.querySelectorAll('.sup-item-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        this.state.supplements.splice(i, 1);
        this.renderSupplements();
        this._saveList();
        if (this.state.analysisStatus === 'SUCCESS') this.resetAnalysis();
      });
    });

    listWrap.querySelectorAll('.sup-item-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        this._openNutrientEditModal(i);
      });
    });
  }

  _openNutrientEditModal(idx) {
    const sup = this.state.supplements[idx];
    const existingModal = document.getElementById('sup-edit-modal');
    if (existingModal) existingModal.remove();

    // 현재 영양소 값을 nutrientId → amountMg 맵으로 변환
    const currentMap = {};
    (sup.customNutrients || []).forEach(n => { currentMap[n.nutrientId] = n.amountMg; });

    const categories = {
      '비타민': ['VIT_A','VIT_B1','VIT_B2','NIACIN','PANTOTHENIC_ACID','VIT_B6','BIOTIN','FOLATE','VIT_B12','VIT_C','VIT_D','VIT_E','VIT_K'],
      '미네랄': ['CALCIUM','MAGNESIUM','IRON','ZINC','SELENIUM','COPPER','MANGANESE','IODINE'],
      '기능성': ['OMEGA3','PROBIOTICS','LUTEIN','MILK_THISTLE','COQ10'],
    };

    const buildRows = (ids) => ids.map(id => {
      const meta = NUTRIENT_META[id];
      const val = currentMap[id] || '';
      const displayVal = val ? (val < 1 ? parseFloat((val * 1000).toFixed(1)) : parseFloat(val.toFixed(1))) : '';
      const unit = val && val < 1 ? 'μg' : 'mg';
      return `
        <div class="sup-edit-row">
          <label class="sup-edit-label" style="color:${meta.color}">${meta.name}</label>
          <input class="sup-edit-input" type="number" min="0" step="any"
            data-nutrient-id="${id}" data-unit="${unit}"
            value="${displayVal}" placeholder="-">
          <span class="sup-edit-unit">${unit}</span>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'sup-edit-modal';
    modal.className = 'sup-edit-modal-overlay';
    modal.innerHTML = `
      <div class="sup-edit-modal">
        <div class="sup-edit-modal-header">
          <div>
            <div class="sup-edit-modal-title">영양성분 수정 <span class="sup-edit-per-serving">1회 섭취량 기준</span></div>
            <div class="sup-edit-modal-sub">${sup.name} · ${sup.manufacturer || '직접입력'}</div>
          </div>
          <button class="sup-edit-close-btn">✕</button>
        </div>
        <div class="sup-edit-modal-body">
          ${Object.entries(categories).map(([cat, ids]) => `
            <div class="sup-edit-category">
              <div class="sup-edit-cat-title">${cat}</div>
              ${buildRows(ids)}
            </div>
          `).join('')}
        </div>
        <div class="sup-edit-modal-footer">
          <span class="sup-edit-hint">값을 비워두면 해당 성분은 제거됩니다</span>
          <div class="sup-edit-footer-btns">
            <button class="sup-edit-cancel-btn">취소</button>
            <button class="sup-edit-save-btn">저장</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('.sup-edit-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.sup-edit-cancel-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('.sup-edit-save-btn').addEventListener('click', async () => {
      const inputs = modal.querySelectorAll('.sup-edit-input');
      const newNutrients = {};
      inputs.forEach(input => {
        const id = input.dataset.nutrientId;
        const unit = input.dataset.unit;
        const raw = parseFloat(input.value);
        if (!isNaN(raw) && raw > 0) {
          // μg로 표시된 경우 mg으로 환산해서 저장
          newNutrients[id] = unit === 'μg' ? raw / 1000 : raw;
        } else {
          newNutrients[id] = 0;
        }
      });

      // DB 반영 (직접입력 제품은 스킵)
      if (!String(sup.id).startsWith('custom_')) {
        const dbPayload = {};
        Object.entries(newNutrients).forEach(([id, mg]) => {
          dbPayload[id.toLowerCase()] = mg;
        });
        try {
          await apiFetch(`/api/supplements/${sup.id}/nutrients`, {
            method: 'PUT',
            body: JSON.stringify(dbPayload),
          });
        } catch (e) {
          console.warn('DB 저장 실패, 로컬만 반영:', e);
        }
      }

      // state 업데이트
      sup.customNutrients = Object.entries(newNutrients)
        .filter(([, mg]) => mg > 0)
        .map(([id, mg]) => ({ nutrientId: id, amountMg: mg }));

      modal.remove();
      this.renderSupplements();
      this._saveList();
    });
  }

  _openSuggestModal(prefillName = '') {
    const existing = document.getElementById('sup-suggest-modal');
    if (existing) existing.remove();

    const categories = {
      '비타민': ['VIT_A','VIT_B1','VIT_B2','NIACIN','PANTOTHENIC_ACID','VIT_B6','BIOTIN','FOLATE','VIT_B12','VIT_C','VIT_D','VIT_E','VIT_K'],
      '미네랄': ['CALCIUM','MAGNESIUM','IRON','ZINC','SELENIUM','COPPER','MANGANESE','IODINE'],
      '기능성': ['OMEGA3','PROBIOTICS','LUTEIN','MILK_THISTLE','COQ10'],
    };

    const buildRows = (ids) => ids.map(id => {
      const meta = NUTRIENT_META[id];
      const unit = ['VIT_A','VIT_D','FOLATE','VIT_B12','BIOTIN','SELENIUM','IODINE'].includes(id) ? 'μg' : 'mg';
      return `
        <div class="sup-edit-row">
          <label class="sup-edit-label" style="color:${meta.color}">${meta.name}</label>
          <input class="sup-edit-input" type="number" min="0" step="any"
            data-nutrient-id="${id}" data-unit="${unit}" placeholder="-">
          <span class="sup-edit-unit">${unit}</span>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'sup-suggest-modal';
    modal.className = 'sup-edit-modal-overlay';
    modal.innerHTML = `
      <div class="sup-edit-modal">
        <div class="sup-edit-modal-header">
          <div>
            <div class="sup-edit-modal-title">영양제 사전 추가 제안 <span class="sup-suggest-badge">위키</span></div>
            <div class="sup-edit-modal-sub">공식 성분표 기준 확인된 값만 입력해주세요</div>
          </div>
          <button class="sup-edit-close-btn">✕</button>
        </div>
        <div class="sup-suggest-meta">
          <div class="sup-input-row" style="margin-bottom:0">
            <label style="min-width:52px;font-size:12px;color:#9ca3af">제품명</label>
            <input type="text" class="sup-input sup-suggest-name" value="${prefillName.replace(/"/g, '&quot;')}" placeholder="예: 센트룸 실버">
          </div>
          <div class="sup-input-row" style="margin-bottom:0">
            <label style="min-width:52px;font-size:12px;color:#9ca3af">제조사</label>
            <input type="text" class="sup-input sup-suggest-maker" placeholder="예: 한국화이자">
          </div>
        </div>
        <div class="sup-edit-modal-body">
          ${Object.entries(categories).map(([cat, ids]) => `
            <div class="sup-edit-category">
              <div class="sup-edit-cat-title">${cat}</div>
              ${buildRows(ids)}
            </div>
          `).join('')}
        </div>
        <div class="sup-suggest-status" style="display:none;"></div>
        <div class="sup-edit-modal-footer">
          <span class="sup-edit-hint">2명 이상이 동일 정보를 제출하면 자동 반영됩니다</span>
          <div class="sup-edit-footer-btns">
            <button class="sup-edit-cancel-btn">취소</button>
            <button class="sup-suggest-submit-btn">제안 제출하기</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('.sup-edit-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.sup-edit-cancel-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('.sup-suggest-submit-btn').addEventListener('click', async () => {
      const name = modal.querySelector('.sup-suggest-name').value.trim();
      const manufacturer = modal.querySelector('.sup-suggest-maker').value.trim();
      if (!name) { alert('제품명을 입력해주세요.'); return; }

      // 입력된 영양소 수집 (μg 입력값은 mg으로 변환)
      const nutrients = {};
      modal.querySelectorAll('.sup-edit-input').forEach(input => {
        const raw = parseFloat(input.value);
        if (!isNaN(raw) && raw > 0) {
          const col = input.dataset.nutrientId.toLowerCase();
          nutrients[col] = input.dataset.unit === 'μg' ? raw / 1000 : raw;
        }
      });

      const submitBtn = modal.querySelector('.sup-suggest-submit-btn');
      const statusEl  = modal.querySelector('.sup-suggest-status');
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';

      try {
        const resp = await apiFetch('/api/supplements/submit', {
          method: 'POST',
          body: JSON.stringify({ name, manufacturer, nutrients }),
        });
        const data = await resp.json();

        if (!resp.ok) {
          statusEl.className = 'sup-suggest-status error';
          statusEl.textContent = data.error || '오류가 발생했습니다.';
          statusEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = '제안 제출하기';
          return;
        }

        statusEl.className = `sup-suggest-status ${data.status}`;
        statusEl.textContent = data.message;
        statusEl.style.display = 'block';
        submitBtn.style.display = 'none';

        // 내 리스트에도 추가 (영양소 포함)
        const customNutrients = Object.entries(nutrients).map(([col, mg]) => ({
          nutrientId: col.toUpperCase(),
          amountMg: mg,
        }));
        this.addSupplement({
          id: data.supplementId || `custom_${Date.now()}`,
          name,
          manufacturer,
          dailyDosage: 1,
          customNutrients,
        });

        setTimeout(() => modal.remove(), 3000);
      } catch (err) {
        console.error('제안 실패:', err);
        statusEl.className = 'sup-suggest-status error';
        statusEl.textContent = '네트워크 오류가 발생했습니다.';
        statusEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = '제안 제출하기';
      }
    });
  }

  _buildNutrientPills(customNutrients, dosage = 1) {
    if (!customNutrients || customNutrients.length === 0) {
      return `<div class="sup-item-nutrients-empty">성분 정보 없음 (직접 입력한 제품)</div>`;
    }

    const pills = customNutrients
      .filter(n => n.amountMg > 0)
      .sort((a, b) => b.amountMg - a.amountMg)
      .slice(0, 7)
      .map(n => {
        const meta = NUTRIENT_META[n.nutrientId];
        if (!meta) return '';
        const val = formatNutrientAmount(n.amountMg * dosage);
        if (!val) return '';
        const c = meta.color;
        return `<span class="sup-nutrient-pill" style="background:${c}1a;border-color:${c}4d;color:${c}">${meta.name} <strong>${val}</strong></span>`;
      })
      .join('');

    return pills ? `<div class="sup-item-nutrients">${pills}</div>` : '';
  }

  _showCriteriaModal() {
    const existing = document.getElementById('sup-criteria-modal');
    if (existing) existing.remove();

    const { nutrientDetails, profile } = this.state.analysisResult || {};
    if (!nutrientDetails) return;

    // 적용된 프로필 텍스트
    const genderLabel = profile?.gender === 'MALE' ? '남성' : '여성';
    const age = profile?.age || 30;
    const ageGroupLabel = age < 30 ? '19–29세 (청년)' : age < 50 ? '30–49세 (성인)' : age < 65 ? '50–64세 (중장년)' : '65세 이상 (노년)';
    const profileText = profile?.hasHealthInfo
      ? `${genderLabel} · ${ageGroupLabel}${profile.isPregnant ? ' · 임신 중' : ''}`
      : '일반 성인 기준 (건강 정보 미입력 → 30세 여성 기준)';

    // 평가 기준 색상/설명
    const STATUS_INFO = {
      '위험': { color: '#f87171', desc: '상한섭취량(UL) 초과 — 독성 위험' },
      '과다': { color: '#fb923c', desc: '권장량 150% 초과 (UL 있는 영양소) — 축적 주의' },
      '초과': { color: '#fbbf24', desc: '권장량 100–150% — 약간 초과' },
      '적정': { color: '#34d399', desc: '권장량 50–100% — 적정 범위' },
      '부족': { color: '#60a5fa', desc: '권장량 50% 미만 — 보충 고려' },
      '고용량': { color: '#2dd4bf', desc: '권장량 150% 초과 (UL 없는 수용성) — 초과분은 체외 배출' },
      '참고': { color: '#9ca3af', desc: '공식 권장량 없음 — 참고 정보' },
    };

    const rowsHtml = nutrientDetails.map(n => {
      const si = STATUS_INFO[n.status] || STATUS_INFO['참고'];
      const rdaStr = n.recommendedAmount != null ? `${n.recommendedAmount}${n.unit}` : '기준 없음';
      const amtStr = `${n.currentAmount}${n.unit}`;
      return `
        <tr>
          <td>${n.name}</td>
          <td>${amtStr}</td>
          <td>${rdaStr}</td>
          <td style="color:${si.color}; font-weight:700;">${n.status}</td>
        </tr>`;
    }).join('');

    const legendHtml = Object.entries(STATUS_INFO).map(([label, v]) => `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="width:9px; height:9px; border-radius:50%; background:${v.color}; flex-shrink:0;"></span>
        <span style="color:${v.color}; font-weight:700; min-width:28px;">${label}</span>
        <span style="color:#9ca3af; font-size:11px;">${v.desc}</span>
      </div>`).join('');

    const modal = document.createElement('div');
    modal.id = 'sup-criteria-modal';
    modal.className = 'sup-edit-modal-overlay';
    modal.innerHTML = `
      <div class="sup-edit-modal sup-criteria-modal-inner">
        <div class="sup-edit-modal-header">
          <div>
            <div class="sup-edit-modal-title">분석 기준 안내</div>
            <div class="sup-edit-modal-sub">한국인 영양섭취기준 2020 (보건복지부·한국영양학회)</div>
          </div>
          <button class="sup-edit-close-btn">✕</button>
        </div>
        <div class="sup-edit-modal-body" style="padding:0 20px 16px;">
          <div class="sup-criteria-profile">
            적용된 프로필: <strong>${profileText}</strong>
          </div>
          <table class="sup-criteria-table">
            <thead>
              <tr>
                <th>영양소</th>
                <th>섭취량</th>
                <th>권장량(RDA)</th>
                <th>평가</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="sup-criteria-legend">
            <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">평가 기준</div>
            ${legendHtml}
          </div>
          <div class="sup-criteria-source">출처: 보건복지부·한국영양학회 「한국인 영양섭취기준」 2020년</div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector('.sup-edit-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  resetAnalysis() {
    this.state.analysisStatus = 'IDLE';
    this.state.analysisResult = null;
    this.container.querySelector('.sup-results-container').style.display = 'none';
  }

  bindEvents() {
    const btnAdd = this.container.querySelector('.sup-add-btn');
    const fallbackWrapper = this.container.querySelector('.sup-fallback-wrapper');
    const searchInput = this.container.querySelector('.sup-search-input');
    const autoList = this.container.querySelector('.sup-auto-list');
    const manualForm = this.container.querySelector('.sup-manual-form');

    const btnAnalyze = this.container.querySelector('.sup-btn-analyze');

    // 추가 폼 토글
    btnAdd.addEventListener('click', () => {
      this.uiState.isAddFormOpen = !this.uiState.isAddFormOpen;
      if (this.uiState.isAddFormOpen) {
        fallbackWrapper.classList.add('visible');
        searchInput.focus();
        manualForm.style.display = 'flex';
      } else {
        fallbackWrapper.classList.remove('visible');
        searchInput.value = '';
        autoList.style.display = 'none';
      }
    });

    // 💡 실제 API 연동으로 수정된 자동완성 검색 로직
    searchInput.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      clearTimeout(this.debounceTimer);

      if (!v) {
        autoList.style.display = 'none';
        return;
      }

      this.debounceTimer = setTimeout(async () => {
        // 백엔드 API 호출하여 검색 결과 받아오기
        const hits = await fetchSupplements(v);

        if (hits.length > 0) {
          autoList.style.display = 'block';
          // 검색 결과 리스트 렌더링
          autoList.innerHTML = hits.map(h => {
            const topNutrients = (h.customNutrients || [])
              .filter(n => n.amountMg > 0)
              .sort((a, b) => b.amountMg - a.amountMg)
              .slice(0, 4)
              .map(n => {
                const meta = NUTRIENT_META[n.nutrientId];
                return meta ? `${meta.name} ${formatNutrientAmount(n.amountMg)}` : null;
              })
              .filter(Boolean)
              .join(' · ');
            return `<div class="sup-auto-item" data-id="${h.id}">
              <div style="font-weight: 600;">${h.name}</div>
              <div style="font-size: 11px; color:#888;">${h.manufacturer}</div>
              ${topNutrients ? `<div style="font-size: 10px; color: #10b981; margin-top: 3px;">${topNutrients}</div>` : ''}
            </div>`;
          }).join('');

          // 리스트 항목 클릭 이벤트
          autoList.querySelectorAll('.sup-auto-item').forEach(el => {
            el.addEventListener('click', () => {
              const selected = hits.find(d => d.id === el.dataset.id);
              this.addSupplement({
                id: selected.id,
                name: selected.name,
                manufacturer: selected.manufacturer,
                dailyDosage: 1,
                customNutrients: selected.customNutrients || [] // API에서 가져온 영양소 정보 매핑
              });

              // UI 초기화
              fallbackWrapper.classList.remove('visible');
              searchInput.value = '';
              autoList.style.display = 'none';
              this.uiState.isAddFormOpen = false;
            });
          });
        } else {
          // 검색 결과가 없을 때: 직접입력 안내 + 사전 제안 버튼
          autoList.style.display = 'block';
          autoList.innerHTML = `
            <div class="sup-no-result">
              <span>검색 결과가 없습니다.</span>
              <button class="sup-suggest-open-btn" data-keyword="${v.replace(/"/g, '&quot;')}">
                사전에 추가 제안하기
              </button>
            </div>`;
          autoList.querySelector('.sup-suggest-open-btn').addEventListener('click', (e) => {
            const keyword = e.currentTarget.dataset.keyword;
            autoList.style.display = 'none';
            this._openSuggestModal(keyword);
          });
        }
      }, 300); // 300ms 디바운스 적용
    });

    // 직접입력 저장 (Fallback Save)
    this.container.querySelector('.sup-btn-save').addEventListener('click', () => {
      const name = this.container.querySelector('.sup-manual-name').value.trim();
      const maker = this.container.querySelector('.sup-manual-maker').value.trim();

      if (!name) return alert("제품명을 입력해주세요.");

      this.addSupplement({
        id: `custom_${Date.now()}`,
        name: name,
        manufacturer: maker || "수동입력",
        dailyDosage: 1,
        customNutrients: [] // 직접 입력 시 기본 영양소는 빈 배열 (추후 고도화 가능)
      });

      fallbackWrapper.classList.remove('visible');
      searchInput.value = '';
      this.container.querySelector('.sup-manual-name').value = '';
      this.container.querySelector('.sup-manual-maker').value = '';
      this.uiState.isAddFormOpen = false;
    });

    // 분석하기 클릭
    btnAnalyze.addEventListener('click', async () => {
      if (this.state.supplements.length === 0) return alert('영양제를 추가해주세요.');

      // healthInfo 없으면 선택 배너 표시
      if (!this.state.healthInfo) {
        const proceed = await this._askHealthInfoChoice();
        if (proceed === null) return; // 취소
      }

      this._runAnalysis(btnAnalyze);
    });

    this.container.querySelector('.sup-btn-cancel').addEventListener('click', () => {
      fallbackWrapper.classList.remove('visible');
      this.uiState.isAddFormOpen = false;
    });

    // 자동완성 리스트 외부 영역 클릭 시 닫기
    this.handleOutsideClick = (e) => {
      if (!document.contains(this.container)) {
        this.destroy();
        return;
      }
      if (!searchInput.contains(e.target) && !autoList.contains(e.target)) {
        autoList.style.display = 'none';
      }
    };
    document.addEventListener('click', this.handleOutsideClick);

    // ESC 키 누를 시 자동완성 리스트 닫기
    this.handleEscapeKey = (e) => {
      if (!document.contains(this.container)) {
        this.destroy();
        return;
      }
      if (e.key === 'Escape') {
        autoList.style.display = 'none';
      }
    };
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  destroy() {
    if (this.handleOutsideClick) {
      document.removeEventListener('click', this.handleOutsideClick);
    }
    if (this.handleEscapeKey) {
      document.removeEventListener('keydown', this.handleEscapeKey);
    }
  }

  // healthInfo 없을 때 선택지 제시 → Promise: true(바로 분석) | false(대시보드로) | null(취소)
  _askHealthInfoChoice() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sup-edit-modal-overlay';
      overlay.innerHTML = `
        <div class="sup-edit-modal" style="max-width:360px; padding:24px;">
          <div style="font-size:15px; font-weight:700; margin-bottom:8px;">건강 정보가 없어요</div>
          <div style="font-size:13px; color:#6b7280; line-height:1.6; margin-bottom:20px;">
            성별·나이 등 건강 정보를 입력하면 더 정확한 분석이 가능해요.<br>
            지금 입력하거나, 일반 성인 기준으로 바로 분석할 수 있어요.
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="sup-suggest-submit-btn" id="sup-goto-health">건강 정보 입력하러 가기</button>
            <button style="padding:10px; border-radius:8px; border:1px solid #d1d5db; background:#f9fafb; cursor:pointer; font-size:13px;" id="sup-analyze-anyway">일반 기준으로 바로 분석</button>
            <button style="padding:8px; background:none; border:none; color:#9ca3af; cursor:pointer; font-size:12px;" id="sup-health-cancel">취소</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('#sup-goto-health').addEventListener('click', () => {
        overlay.remove();
        // 대시보드 건강정보 섹션으로 스크롤/열기 시도
        const healthBtn = document.querySelector('[data-action="open-health-info"], .health-info-btn, #healthInfoBadge');
        if (healthBtn) healthBtn.click();
        resolve(false);
      });
      overlay.querySelector('#sup-analyze-anyway').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });
      overlay.querySelector('#sup-health-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    });
  }

  async _runAnalysis(btnAnalyze) {
    this.state.analysisStatus = 'LOADING';
    btnAnalyze.classList.add('loading');
    btnAnalyze.innerHTML = `<div class="sup-spinner"></div><span>AI 분석 중...</span>`;

    try {
      const res = await apiFetch('/api/supplements/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplements: this.state.supplements }),
      });
      const result = await res.json();

      if (result.success) {
        this.state.analysisStatus = 'SUCCESS';
        this.state.analysisResult = result.data;
        this.renderAnalysisResults();
      } else {
        alert(result.error || '분석 중 오류가 발생했습니다.');
        this.state.analysisStatus = 'IDLE';
      }
    } catch (err) {
      console.error('분석 오류:', err);
      alert('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      this.state.analysisStatus = 'IDLE';
    } finally {
      btnAnalyze.classList.remove('loading');
      const isDone = this.state.analysisStatus === 'SUCCESS';
      btnAnalyze.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>${isDone ? '분석 다시하기' : '분석하기'}</span>`;
    }
  }

  addSupplement(supInfo) {
    this.state.supplements.push(supInfo);
    this.renderSupplements();
    this._saveList();
    this.resetAnalysis();
  }

  // ───────── AI 분석 결과 렌더링 ─────────
  renderAnalysisResults() {
    const resBox = this.container.querySelector('.sup-results-container');
    resBox.style.display = 'block';

    if (!this.state.analysisResult) return;
    const { summary, nutrientDetails, usedAI } = this.state.analysisResult;

    const alertBox = this.container.querySelector('.sup-ai-alert');
    if (summary.status === 'WARNING' || summary.status === 'CAUTION') {
      alertBox.className = 'sup-ai-alert visible alert-warning';
    } else {
      alertBox.className = 'sup-ai-alert visible alert-success';
    }

    alertBox.querySelector('.alert-title-text').textContent = summary.title;
    alertBox.querySelector('.sup-ai-message').textContent = summary.message;
    // AI vs 룰 기반 뱃지
    const existingBadge = alertBox.querySelector('.sup-analysis-badge');
    if (existingBadge) existingBadge.remove();
    const badge = document.createElement('span');
    if (usedAI) {
      badge.className = 'sup-analysis-badge badge-ai';
      badge.textContent = '🤖 AI 분석';
    } else {
      badge.className = 'sup-analysis-badge badge-rule';
      badge.innerHTML = '📊 기준 분석 <span class="sup-badge-info">ⓘ</span>';
      badge.title = '분석 기준 보기';
      badge.addEventListener('click', () => this._showCriteriaModal());
    }
    alertBox.querySelector('.sup-ai-message').after(badge);

    const grid = this.container.querySelector('.sup-nutrient-grid');
    grid.innerHTML = '';

    nutrientDetails.forEach(n => {
      let iconChar = '🧪';
      if (n.nutrientId === 'IRON') iconChar = '🩸';
      if (n.nutrientId === 'VITAMIN_B') iconChar = '🅱️';
      if (n.nutrientId === 'VITAMIN_C') iconChar = '🍋';
      if (n.nutrientId === 'ZINC') iconChar = '💎';

      const highNote = n.color === 'TEAL'
      ? `<div class="sup-nc-footnote sup-nc-high-note">💧 수용성 — 초과분은 체외 배출</div>`
      : '';
    const missingNote = n.missing
      ? `<div class="sup-nc-footnote sup-nc-missing-note">현재 복용 중인 영양제에 없음</div>`
      : '';

    grid.innerHTML += `
        <div class="sup-nutrient-card nc-${n.color}${n.missing ? ' nc-missing' : ''}">
          <div class="sup-nc-header">
            <div class="sup-nc-icon">${iconChar}</div>
            <div class="sup-nc-title-wrap">
              <span class="sup-nc-name">${n.name}</span>
              <span class="sup-nc-status">${n.status} / ${n.percentage != null ? n.percentage + '%' : '-'}</span>
            </div>
          </div>
          <div class="sup-progress-wrapper">
            <div class="sup-progress-bar-bg">
              <div class="sup-progress-fill" style="width: 0%"></div>
              ${n.percentage > 100 ? `<div class="sup-progress-marker" title="권장량(100%)"></div>` : ''}
            </div>
            <div class="sup-progress-labels">
              <span>${n.currentAmount}${n.unit}</span>
              <span>100%</span>
              <span>${n.recommendedAmount != null ? n.recommendedAmount + n.unit : '-'}</span>
            </div>
          </div>
          ${highNote}${missingNote}
        </div>
      `;
    });

    // 바 애니메이션 트리거
    setTimeout(() => {
      nutrientDetails.forEach((n, idx) => {
        const fill = grid.querySelectorAll('.sup-progress-fill')[idx];
        if (fill) fill.style.width = `${Math.min(n.percentage, 100)}%`;
      });
    }, 50);

    const botBox = this.container.querySelector('.sup-bottom-details');
    botBox.innerHTML = '';

    // 위험/과다/초과 항목 + AI 코멘트 있는 항목 포함
    const notable = nutrientDetails.filter(n =>
      ['위험', '과다', '초과'].includes(n.status) || n.aiBotMessage
    );
    if (notable.length > 0) {
      const colorByStatus = { '위험': '#f87171', '과다': '#fb923c', '초과': '#fbbf24' };
      let html = `<h4 class="sup-section-title" style="margin-top:24px;">복용량 상세 확인</h4><div class="sup-detail-cards">`;
      notable.forEach(ov => {
        const accentColor = colorByStatus[ov.status] || '#9ca3af';
        const sourcesHtml = ov.sources.length > 0
          ? ov.sources.map(src =>
              `<div class="sup-detail-source-row"><span>${src.name}</span><span>${src.amount}${src.unit}</span></div>`
            ).join('')
          : `<div class="sup-detail-source-row sup-detail-no-source"><span>출처 정보 없음</span></div>`;
        const botHtml = ov.aiBotMessage
          ? `<div class="sup-bot-msg"><div class="sup-bot-icon">🤖</div><div style="font-size:12px;line-height:1.5;">${ov.aiBotMessage}</div></div>`
          : '';

        html += `
          <div class="sup-detail-card" style="--accent:${accentColor}">
            <div class="sup-detail-card-header">
              <span class="sup-detail-nutrient-name">${ov.name}</span>
              <span class="sup-detail-total">${ov.currentAmount}${ov.unit}</span>
            </div>
            <div class="sup-detail-sources">${sourcesHtml}</div>
            <div class="sup-detail-rda-row">
              <span>권장량 ${ov.recommendedAmount != null ? ov.recommendedAmount + ov.unit : '-'}</span>
              <span class="sup-detail-pct">${ov.percentage != null ? ov.percentage + '%' : ''}</span>
            </div>
            ${botHtml}
          </div>`;
      });
      html += `</div>`;
      botBox.innerHTML = html;
    }
  }
}

export function initSupplement(el, data) {
  new SupplementWidget(el, data);
}