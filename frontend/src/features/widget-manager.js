/**
 * @file widget-manager.js
 * @description 동적 위젯(To-Do, 마일스톤 등)의 생성 및 상태 관리를 총괄합니다.
 */

import { apiFetch } from '../services/api.js';

export class WidgetManager {
  constructor() {
    this.widgets = [];
    this.grid = null;
    this.setupGridListeners();
  }

  setupGridListeners() {
    // 그리드 내 공통 이벤트 위임 (마인드맵 시작 등)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.mindmap-start-btn')) {
        e.stopPropagation();
        import('./mindmap.js').then(module => module.initMindmap());
      }
    });
  }

  /**
   * 현재 활성화된 위젯 그리드를 반환 (동적 할당)
   */
  getGrid() {
    if (!this.grid || !document.contains(this.grid)) {
      this.grid = document.getElementById('widgetGrid');
    }
    return this.grid;
  }

  /**
   * 서버에서 사용자의 위젯 목록을 가져와 렌더링
   */
  async loadWidgets() {
    const grid = this.getGrid();
    if (!grid) {
      console.error('[WidgetManager] 위젯 그리드(#widgetGrid)를 찾을 수 없습니다.');
      return;
    }

    const token = localStorage.getItem('token') || localStorage.getItem('mindmap_token') ||
      sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token');

    try {
      const res = await apiFetch('/api/widgets');

      if (!res.ok) {
        console.error(`[WidgetManager] 위젯 로드 실패 (HTTP ${res.status})`);
        return;
      }

      const data = await res.json();
      if (data.success) {
        if (!data.widgets || data.widgets.length === 0) {
          console.warn('[WidgetManager] 저장된 위젯이 없습니다. 초기 배치를 진행합니다.');
          await this.createInitialWidgets();
          return;
        }

        console.log(`[WidgetManager] ${data.widgets.length}개의 위젯을 로드했습니다. 렌더링을 시작합니다.`);

        grid.querySelectorAll('.draggable-widget').forEach(w => w.remove());
        data.widgets.forEach(w => {
          console.log(`[WidgetManager] 위젯 데이터 처리 중: ${w.widget_type}`);
          this.renderWidget(w);
        });
      } else {
        console.error('[WidgetManager] 위젯 API 응답 오류:', data.message);
      }
    } catch (err) {
      console.error('[WidgetManager] 위젯 로드 도중 예외 발생:', err);
      // window.appAlert('대시보드 위젯 로딩 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    }
  }

  /**
   * 초기 기본 위젯 3종 생성
   */
  async createInitialWidgets() {
    const defaults = [
      { type: 'milestone', x: 20, y: 20, w: 700, h: 340 },
      { type: 'todo', x: 740, y: 20, w: 400, h: 540 },
      { type: 'mindmap', x: 20, y: 380, w: 700, h: 180 },
      { type: 'notepad', x: 20, y: 580, w: 700, h: 450 },
      { type: 'recipe', x: 740, y: 580, w: 400, h: 540 }
    ];

    for (const d of defaults) {
      await this.createWidget(d.type, d.x, d.y, d.w, d.h);
    }
  }

  /**
   * 새 위젯 추가
   */
  async createWidget(type, x = 100, y = 100, width, height) {
    console.log(`[WidgetManager] 새 위젯 생성 요청: type=${type}, x=${x}, y=${y}`);
    try {
      const res = await apiFetch('/api/widgets', {
        method: 'POST',
        body: JSON.stringify({
          widgetType: type,
          x: Math.round(Number(x)),
          y: Math.round(Number(y)),
          width: Math.round(Number(width || (type === 'todo' ? 400 : (type === 'recipe' ? 500 : 700)))),
          height: Math.round(Number(height || (type === 'todo' ? 500 : (type === 'recipe' ? 600 : 350)))),
          settings: {
            ...(type === 'milestone'
              ? { syncWithMemo: false, summaryData: [{ label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }] }
              : (type === 'recipe' ? { recipes: [] } : {})
            ),
            layouts: {
              [`${window.innerWidth <= 768 ? 'mobile' : 'pc'}_expanded`]: {
                x: Math.round(Number(x)),
                y: Math.round(Number(y)),
                w: Math.round(Number(width || (type === 'todo' ? 400 : (type === 'recipe' ? 500 : 700)))),
                h: Math.round(Number(height || (type === 'todo' ? 500 : (type === 'recipe' ? 600 : 350)))),
                z: 100
              }
            }
          }
        })
      });
      const data = await res.json();
      console.log('[WidgetManager] API 응답 데이터:', data);
      if (data.success) {
        this.renderWidget(data.widget);
        console.log('[WidgetManager] 위젯 렌더링 완료');
      }
    } catch (err) {
      console.error('[WidgetManager] 위젯 생성 실패:', err);
    }
  }

  /**
   * 위젯을 DOM에 렌더링하고 이벤트 바인딩
   */
  renderWidget(widgetData) {
    console.warn(`[WidgetManager] 위젯 렌더링 시작: ${widgetData.widget_type} (ID: ${widgetData.id})`);
    const grid = this.getGrid();
    if (!grid) return;

    const isMobile = window.innerWidth <= 768;
    const widgetId = widgetData.id;
    const isCollapsed = localStorage.getItem(`${widgetData.widget_type}_collapsed_${widgetId}`) === 'true';

    const widget = document.createElement('div');
    widget.className = `draggable-widget dashboard-card premium-glass-card widget-${widgetData.widget_type}`;
    widget.dataset.id = widgetData.id;
    if (isCollapsed) widget.classList.add('collapsed');

    // 기기 및 상태별 레이아웃 키 결정
    const platform = isMobile ? 'mobile' : 'pc';
    const state = isCollapsed ? 'collapsed' : 'expanded';
    const layoutKey = `${platform}_${state}`;

    // 기본값 설정
    let x = widgetData.x;
    let y = widgetData.y;
    let w = widgetData.width;
    let h = widgetData.height;
    let z = widgetData.z_index;

    // settings.layouts에 저장된 값이 있으면 우선 적용
    const layouts = widgetData.settings?.layouts;
    if (layouts && layouts[layoutKey]) {
      const l = layouts[layoutKey];
      if (l.x !== undefined) x = l.x;
      if (l.y !== undefined) y = l.y;
      if (l.w !== undefined) w = l.w;
      if (l.h !== undefined) h = l.h;
      if (l.z !== undefined) z = l.z;
    }

    widget.style.left = `${x}px`;
    widget.style.top = `${y}px`;
    widget.style.width = `${w}px`;
    widget.style.height = `${h}px`;
    widget.style.zIndex = z;
    widget.style.position = 'absolute';

    // 위젯 내용 생성
    widget.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            ${this.getWidgetHTML(widgetData)}
            <div class="resize-handle"></div>
        `;

    grid.appendChild(widget);

    // 기능 바인딩 (순환 참조 방지를 위해 동적 임포트 사용)
    import('./dashboard-grid.js').then(m => {
      if (m.updateMaxZIndex) m.updateMaxZIndex(parseInt(z) || 100);
      if (m.setupDraggable) m.setupDraggable(widget, grid);
      if (m.setupResizable) m.setupResizable(widget, grid);

      // 카드 전체 클릭 시 앞으로 가져오기 (캡처링 단계에서 선제적 적용)
      widget.addEventListener('mousedown', () => {
        if (m.bringToFront) m.bringToFront(widget);
      }, true);
    });

    // 위젯 내부 로직 초기화
    this.initWidgetLogic(widget, widgetData);
  }

  getWidgetHTML(data) {
    if (data.widget_type === 'todo') {
      return `
                <div class="widget-header clickable-header todo-header">
                  <div class="header-main">
                    <div class="card-icon">✅</div>
                    <h3 class="todo-widget-title">${data.title || data.settings?.title || '오늘의 할 일'}</h3>
                    <button class="btn-edit-title edit-todo-title-btn" title="제목 수정">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                  </div>
                  <div class="header-actions">
                    <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
                <div class="todo-collapsible-wrapper">
                  <div class="todo-options-bar">
                    <div class="todo-auto-delete-container">
                      <span class="todo-auto-delete-text">오늘만 유지</span>
                      <label class="premium-switch">
                        <input type="checkbox" class="todo-auto-delete-check" ${(data.settings?.autoDelete === true || data.settings?.autoDelete === 'true') ? 'checked' : ''}>
                        <span class="switch-slider"></span>
                      </label>
                    </div>
                  </div>
                  <div class="todo-input-group-premium">
                    <div class="premium-input-wrapper">
                      <div class="color-palette-btn-wrap">
                        <button class="todo-color-btn" title="체크박스 색상 변경">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="2.5" fill="currentColor" stroke="none" opacity="0.7"/><circle cx="8.5" cy="7.5" r="2.5" fill="currentColor" stroke="none" opacity="0.5"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>
                        </button>
                        <div class="color-palette-pop hidden todo-color-palette">
                          <button class="color-chip" data-color="#8B5CF6" style="background:#8B5CF6;"></button>
                          <button class="color-chip" data-color="#06B6D4" style="background:#06B6D4;"></button>
                          <button class="color-chip" data-color="#10B981" style="background:#10B981;"></button>
                          <button class="color-chip" data-color="#F59E0B" style="background:#F59E0B;"></button>
                          <button class="color-chip" data-color="#EF4444" style="background:#EF4444;"></button>
                          <button class="color-chip" data-color="#EC4899" style="background:#EC4899;"></button>
                          <button class="color-chip" data-color="#FFFFFF" style="background:#FFFFFF;outline:1px solid rgba(255,255,255,0.3);"></button>
                        </div>
                      </div>
                      <input type="text" class="todo-input" placeholder="할 일을 입력하세요...">
                      <button class="btn-add-todo add-todo-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      </button>
                    </div>
                  </div>
                  <div class="todo-list-container"></div>
                </div>
            `;
    }
    if (data.widget_type === 'milestone') {
      const settings = data.settings || {};
      const isSync = settings.syncWithMemo !== false; // 기본값 true
      return `
                <div class="widget-header clickable-header milestone-header">
                  <div class="header-main">
                    <div class="card-icon">📅</div>
                    <h3 class="milestone-widget-title">${data.title || data.settings?.title || '나의 마일스톤'}</h3>
                    <button class="btn-edit-title edit-milestone-title-btn" title="제목 수정">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                  </div>
                  <div class="header-actions">
                    <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
                <div class="milestone-collapsible-wrapper">
                  <div class="milestone-content">
                    <div class="milestone-options-bar">
                      <div class="memo-sync-container">
                        <span class="sync-text">빠른 메모 연동</span>
                        <label class="premium-switch mini">
                          <input type="checkbox" class="milestone-memo-sync" ${isSync ? 'checked' : ''}>
                          <span class="switch-slider"></span>
                        </label>
                      </div>
                    </div>
                    
                    <div class="milestone-main-info">
                      <div class="milestone-dday-badge" id="milestoneDdayBadge">-</div>
                      <div class="milestone-text-info">
                        <p class="target-date" id="milestoneTargetDate">D-DAY</p>
                        <p class="sub-info" id="milestoneSubInfo">남은 토요일: -회</p>
                      </div>
                    </div>

                    <div class="milestone-date-controls compact ${isSync ? 'hidden' : ''}">
                      <div class="date-input-group-row">
                        <div class="date-field">
                          <label>기준일</label>
                          <input type="date" class="milestone-base-date" value="${settings.baseDate || ''}">
                        </div>
                        <div class="date-arrow">→</div>
                        <div class="date-field">
                          <label>목표일</label>
                          <input type="date" class="milestone-target-date" value="${settings.targetDate || ''}">
                        </div>
                      </div>
                    </div>

                    <div class="milestone-separator"></div>

                    <div class="milestone-memo-section">
                      <div class="memo-header-mini">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>MEMO</span>
                      </div>
                      <textarea class="milestone-premium-memo" placeholder="프로젝트 관련 메모를 남겨보세요...">${settings.memoContent || ''}</textarea>
                    </div>
                    
                    <div class="milestone-data-area">
                      <div class="milestone-sync-summary ${!isSync ? 'hidden' : ''}">
                        <div class="milestone-sheet-summary"></div>
                      </div>
                      <div class="milestone-independent-summary ${isSync ? 'hidden' : ''}">
                        <div class="independent-data-grid">
                          ${(settings.summaryData || [{}, {}, {}, {}]).map((item, idx) => `
                            <div class="independent-item">
                              <input type="text" class="indie-label" placeholder="항목 ${idx + 1}" value="${item.label || ''}" data-idx="${idx}">
                              <div class="indie-divider"></div>
                              <input type="text" class="indie-value" placeholder="값" value="${item.value || ''}" data-idx="${idx}">
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            `;
    }
    if (data.widget_type === 'mindmap') {
      return `
                <div class="widget-header clickable-header mindmap-cta-header">
                  <div class="header-main">
                    <div class="card-icon">🧠</div>
                    <h3 class="mindmap-widget-title">생각 그리기</h3>
                  </div>
                  <div class="header-actions">
                    <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
                <div class="cta-content-wrapper">
                  <div class="cta-text">
                    <p>마인드맵으로 아이디어를 시각화하세요.</p>
                  </div>
                  <button class="cta-button-premium mindmap-start-btn">시작하기</button>
                </div>
            `;
    }
    if (data.widget_type === 'recipe') {
      return `
          <div class="widget-header clickable-header recipe-header">
            <div class="header-main">
              <div class="recipe-icon-wrapper">
                <div class="card-icon recipe-main-icon" style="cursor: pointer;" title="아이콘 변경">${data.settings?.icon || '🍳'}</div>
                <div class="recipe-icon-palette hidden">
                  <button class="icon-chip">🍳</button>
                  <button class="icon-chip">🍚</button>
                  <button class="icon-chip">🍜</button>
                  <button class="icon-chip">🍝</button>
                  <button class="icon-chip">🥩</button>
                  <button class="icon-chip">🥗</button>
                  <button class="icon-chip">🍰</button>
                  <button class="icon-chip" title="아침">🌅</button>
                  <button class="icon-chip" title="점심">☀️</button>
                  <button class="icon-chip" title="저녁">🌙</button>
                </div>
              </div>
              <h3 class="recipe-widget-title">${data.title || data.settings?.title || '나만의 레시피 북'}</h3>
              <button class="btn-edit-title edit-recipe-title-btn" title="제목 수정">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            </div>
            <div class="header-actions">
              <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="recipe-content-wrapper">
             <!-- 레시피 목록, 상세, 작성 뷰가 이곳에 렌더링됩니다 -->
             <div class="recipe-view-container"></div>
          </div>
      `;
    }
    if (data.widget_type === 'notepad') {
      return `
        <div class="widget-header clickable-header notepad-header">
          <div class="header-main">
            <div class="card-icon">💡</div>
            <h3 class="notepad-widget-title">${data.title || data.settings?.title || '나의 메모장'}</h3>
            <button class="btn-edit-title edit-title-btn" title="제목 수정">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
          </div>
          <div class="header-actions">
            <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="notepad-content-wrapper">
          <div class="notepad-toolbar">
            <button class="toolbar-btn" data-command="bold" title="굵게 (Ctrl+B)"><b>B</b></button>
            <button class="toolbar-btn" data-command="underline" title="밑줄 (Ctrl+U)"><u>U</u></button>
            <button class="toolbar-btn" data-command="strikeThrough" title="취소선"><s>S</s></button>
            <span class="toolbar-separator"></span>
            <button class="toolbar-btn font-size-btn" data-command="fontSize" data-value="3" title="보통 글씨">A</button>
            <button class="toolbar-btn font-size-btn" data-command="fontSize" data-value="5" title="큰 글씨" style="font-size: 1.1em;">A</button>
            <button class="toolbar-btn font-size-btn" data-command="fontSize" data-value="6" title="매우 큰 글씨" style="font-size: 1.2em;">A</button>
            <span class="toolbar-separator"></span>
            <button class="toolbar-btn" data-command="insertUnorderedList" title="글머리 기호">•</button>
            <button class="toolbar-btn" data-command="insertCheckbox" title="체크박스 삽입 ([ ])">☑</button>
          </div>
          <div class="notepad-editor" contenteditable="true" placeholder="자유롭게 아이디어를 적어보세요...">${data.settings?.content || ''}</div>
          <div class="notepad-status-bar">
            <span class="notepad-save-status"></span>
          </div>
        </div>
      `;
    }
    if (data.widget_type === 'supplement') {
      return `
        <div class="widget-header clickable-header supplement-header">
          <div class="header-main">
            <div class="card-icon">💊</div>
            <h3 class="supplement-widget-title">${data.title || data.settings?.title || '영양제 신호등 분석'}</h3>
            <button class="btn-edit-title edit-supplement-title-btn" title="제목 수정">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
          </div>
          <div class="header-actions">
            <button class="btn-del-widget" onclick="window.widgetManager.deleteWidget(${data.id})" title="위젯 삭제">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="supplement-content-wrapper">
           <!-- 앱 로직 컨테이너 -->
           <div class="supplement-view-container"></div>
        </div>
      `;
    }
  }

  initWidgetLogic(el, data) {
    if (data.widget_type === 'todo') {
      import('./todo.js').then(m => {
        if (m.initTodo) m.initTodo(el, data);
      });
    }
    if (data.widget_type === 'milestone') {
      import('./milestone.js').then(m => {
        if (m.initMilestone) m.initMilestone(el, data);
      });
    }
    if (data.widget_type === 'recipe') {
      import('./recipe.js').then(m => {
        if (m.initRecipe) m.initRecipe(el, data);
      });
    }
    if (data.widget_type === 'mindmap') {
      import('./mindmap-cta.js').then(m => {
        if (m.initMindmapCTA) m.initMindmapCTA(el);
      });
    }
    if (data.widget_type === 'notepad') {
      import('./notepad.js').then(m => {
        if (m.initNotepad) m.initNotepad(el, data);
      });
    }
    if (data.widget_type === 'supplement') {
      import('./supplement.js').then(m => {
        if (m.initSupplement) m.initSupplement(el, data);
      });
    }
  }

  async deleteWidget(id) {
    if (!(await window.appConfirm('이 위젯을 삭제하시겠습니까?'))) return;
    try {
      const res = await apiFetch(`/api/widgets/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        const grid = this.getGrid();
        if (grid) {
          const el = grid.querySelector(`[data-id="${id}"]`);
          if (el) el.remove();
        }
      }
    } catch (err) {
      console.error('위젯 삭제 실패:', err);
    }
  }
}

export const widgetManager = new WidgetManager();
window.widgetManager = widgetManager; 
