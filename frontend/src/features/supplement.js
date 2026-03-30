import { apiFetch } from '../services/api.js';

// ───────── API Mock Data (분석용은 아직 백엔드가 없으므로 유지) ─────────
// MOCK_DB는 제거되었습니다. 이제 실제 API에서 검색 결과를 가져옵니다.

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
      userProfile: {
        gender: 'FEMALE', age: 32, weightKg: 55, heightCm: 165,
        isPregnant: false, medicalConditions: ["ANEMIA"], currentMedications: ["THYROID_HORMONE"]
      },
      supplements: [
        // 테스트용 기본 데이터 (필요 시 비워두셔도 됩니다)
        { 
          id: "sup_001", 
          name: "센트룸 멀티비타민", 
          manufacturer: "GSK Consumer Healthcare", 
          dailyDosage: 1,
          customNutrients: [
            { name: "비타민A", amount: 1000, unit: "IU" },
            { name: "비타민C", amount: 100, unit: "mg" },
            { name: "아연", amount: 8, unit: "mg" }
          ]
        },
      ],
      analysisStatus: 'IDLE', // 'IDLE' | 'LOADING' | 'SUCCESS'
      analysisResult: null
    };

    // 검색/폴백 폼 상태
    this.uiState = { isAddFormOpen: false, searchKeyword: '' };

    // 타임아웃
    this.debounceTimer = null;

    this.render();
  }

  // 전체 프레임 렌더링
  render() {
    this.container.innerHTML = `
      <h4 class="sup-section-title">내가 먹는 영양제 리스트</h4>
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
      listWrap.innerHTML += `
        <div class="sup-item" data-id="${sup.id}">
          <div class="sup-item-info">
            <div class="sup-item-icon">💊</div>
            <div class="sup-item-text">
              <span class="sup-item-name">${sup.name}</span>
              <span class="sup-item-maker">${sup.manufacturer}</span>
              ${sup.customNutrients && sup.customNutrients.length > 0
                ? `<div class="sup-item-nutrients">${sup.customNutrients.map(n => `${n.name} ${n.amount}${n.unit}`).join(', ')}</div>`
                : ''
              }
            </div>
          </div>
          <button class="sup-item-del-btn" data-idx="${idx}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            삭제
          </button>
        </div>
      `;
    });

    listWrap.querySelectorAll('.sup-item-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        this.state.supplements.splice(i, 1);
        this.renderSupplements();
        // 삭제 후 분석 상태 리셋
        if (this.state.analysisStatus === 'SUCCESS') this.resetAnalysis();
      });
    });
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
            const nutrientsText = h.customNutrients && h.customNutrients.length > 0
              ? `<div style="font-size: 10px; color: #10b981; margin-top: 2px;">${h.customNutrients.map(n => `${n.name} ${n.amount}${n.unit}`).join(', ')}</div>`
              : '';
            return `<div class="sup-auto-item" data-id="${h.id}">
              <div style="font-weight: 600;">${h.name}</div>
              <div style="font-size: 11px; color:#888;">${h.manufacturer}</div>
              ${nutrientsText}
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
          // 검색 결과가 없을 때 안내 메시지 표시
          autoList.style.display = 'block';
          autoList.innerHTML = `<div style="padding: 12px; text-align: center; color: #6b7280; font-size: 13px;">검색 결과가 없습니다. 아래 폼에서 직접 입력해주세요.</div>`;
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

    // 분석하기 클릭 (현재는 Mock API 유지, 추후 분석 백엔드 완성 시 연동)
    btnAnalyze.addEventListener('click', async () => {
      if (this.state.supplements.length === 0) return alert("영양제를 추가해주세요.");

      // 상태 변경 UI (LOADING)
      this.state.analysisStatus = 'LOADING';
      btnAnalyze.classList.add('loading');
      btnAnalyze.innerHTML = `<div class="sup-spinner"></div><span>AI 분석 중...</span>`;

      // Request Payload 구성
      const payload = {
        userProfile: this.state.userProfile,
        currentSupplements: this.state.supplements
      };

      try {
        const res = await mockApiAnalysis(payload);

        if (res.success) {
          this.state.analysisStatus = 'SUCCESS';
          this.state.analysisResult = res.data;
          this.renderAnalysisResults();
        }
      } catch (err) {
        console.error("분석 오류:", err);
      } finally {
        btnAnalyze.classList.remove('loading');
        btnAnalyze.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>분석 다시하기</span>`;
      }
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

  addSupplement(supInfo) {
    this.state.supplements.push(supInfo);
    this.renderSupplements();
    this.resetAnalysis();
  }

  // ───────── AI 분석 결과 렌더링 ─────────
  renderAnalysisResults() {
    const resBox = this.container.querySelector('.sup-results-container');
    resBox.style.display = 'block';

    if (!this.state.analysisResult) return;
    const { summary, nutrientDetails } = this.state.analysisResult;

    const alertBox = this.container.querySelector('.sup-ai-alert');
    if (summary.status === 'WARNING') {
      alertBox.className = 'sup-ai-alert visible alert-warning';
    } else {
      alertBox.className = 'sup-ai-alert visible alert-success';
    }

    alertBox.querySelector('.alert-title-text').textContent = summary.title;
    alertBox.querySelector('.sup-ai-message').textContent = summary.message;

    const grid = this.container.querySelector('.sup-nutrient-grid');
    grid.innerHTML = '';

    nutrientDetails.forEach(n => {
      let iconChar = '🧪';
      if (n.nutrientId === 'IRON') iconChar = '🩸';
      if (n.nutrientId === 'VITAMIN_B') iconChar = '🅱️';
      if (n.nutrientId === 'VITAMIN_C') iconChar = '🍋';
      if (n.nutrientId === 'ZINC') iconChar = '💎';

      grid.innerHTML += `
        <div class="sup-nutrient-card nc-${n.color}">
          <div class="sup-nc-header">
            <div class="sup-nc-icon">${iconChar}</div>
            <div class="sup-nc-title-wrap">
              <span class="sup-nc-name">${n.name}</span>
              <span class="sup-nc-status">${n.status} / ${n.percentage}%</span>
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
              <span>${n.recommendedAmount}${n.unit}</span>
            </div>
          </div>
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

    const overdoses = nutrientDetails.filter(n => n.status === '과다' || n.percentage > 100);
    if (overdoses.length > 0) {
      let html = `<div class="sup-ai-detail-box">`;
      overdoses.forEach(ov => {
        html += `<div style="font-weight:700; margin-bottom:8px;">${ov.name} 과다 복용 출처 확인</div>`;
        ov.sources.forEach(src => {
          html += `<div class="sup-ai-detail-item"><span>${src.name}</span><span>${src.amount}${src.unit}</span></div>`;
        });
        html += `
          <div class="sup-ai-detail-item" style="border-top:2px solid #e5e7eb; border-bottom:none; font-weight:700;">
            <span>총계</span><span style="color:#b91c1c;">${ov.currentAmount}${ov.unit} (권장량 초과)</span>
          </div>`;

        if (ov.aiBotMessage) {
          html += `<div class="sup-bot-msg"><div class="sup-bot-icon">🤖</div><div style="font-size:12px; line-height:1.4;">${ov.aiBotMessage}</div></div>`;
        }
      });
      html += `</div>`;
      botBox.innerHTML = html;
    }
  }
}

export function initSupplement(el, data) {
  new SupplementWidget(el, data);
}