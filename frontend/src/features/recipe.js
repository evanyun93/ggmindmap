/**
 * @file recipe.js
 * @description 레시피 위젯의 목록(Book 뷰), 단일 상세 보기, 작성/수정 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { safeLocalStorage } from '../utils/storage.js';

export function initRecipe(el, data) {
    const container = el.querySelector('.recipe-view-container');
    const header = el.querySelector('.recipe-header');
    const headerTitle = el.querySelector('.recipe-widget-title');
    const editTitleBtn = el.querySelector('.edit-recipe-title-btn');
    const iconBtn = el.querySelector('.recipe-main-icon');
    const iconPalette = el.querySelector('.recipe-icon-palette');

    // 데이터 로드
    let settings = data.settings || {};
    let recipes = Array.isArray(settings.recipes) ? settings.recipes : [];
    let customTitle = settings.title || '나만의 레시피 북';
    let customIcon = settings.icon || '🍳';
    const widgetId = data.id;

    // 단위 자동 인식 맵 (100선 대폭 확장)
    const UNIT_MAP = {
        // --- 액체 및 유지류 ---
        '물': 'ml', '생수': 'ml', '육수': 'ml', '멸치육수': 'ml', '다시마물': 'ml', '사골육수': 'ml', '채수': 'ml',
        '우유': 'ml', '두유': 'ml', '생크림': 'ml', '코코넛밀크': 'ml', '요거트': 'g',
        '식용유': 'ml', '올리브유': 'ml', '포도씨유': 'ml', '카놀라유': 'ml', '참기름': '스푼', '들기름': '스푼', '고추기름': '스푼',
        '간장': '스푼', '국간장': '스푼', '진간장': '스푼', '양조간장': '스푼', '액젓': '스푼', '멸치액젓': '스푼', '까나리액젓': '스푼', '참치액': '스푼',
        '식초': '스푼', '맛술': '스푼', '미림': '스푼', '청주': '스푼', '소주': '스푼', '와인': 'ml', '발사믹식초': '스푼',
        '꿀': '스푼', '올리고당': '스푼', '요리당': '스푼', '물엿': '스푼', '메이플시럽': '스푼',

        // --- 채소류 ---
        '양파': '개', '작은양파': '개', '당근': '개', '감자': '개', '고구마': '개', '오이': '개', '무': '토막', '단호박': '개', '애호박': '개', '쥬키니': '개',
        '가지': '개', '토마토': '개', '방울토마토': '알', '완두콩': '줌', '옥수수': '개', '연근': '토막', '우엉': '대', '마': '토막',
        '대파': '대', '쪽파': '대', '실파': '줌', '부추': '줌', '마늘': '쪽', '생강': '톨', '청양고추': '개', '홍고추': '개', '풋고추': '개', '꽈리고추': '줌',
        '파프리카': '개', '피망': '개', '브로콜리': '송이', '콜리플라워': '송이', '아스파라거스': '대', '셀러리': '대',
        '양배추': '잎', '배추': '잎', '알배기배추': '통', '깻잎': '장', '상추': '장', '쑥갓': '줌', '미나리': '줌', '시금치': '단', '청경채': '포기',
        '콩나물': '봉지', '숙주': '봉지', '고사리': '줌', '취나물': '줌', '도라지': '줌', '더덕': '개',
        '표고버섯': '개', '팽이버섯': '봉지', '느타리버섯': '팩', '양송이버섯': '개', '새송이버섯': '개', '목이버섯': '줌',

        // --- 육류 및 가공육 ---
        '소고기': 'g', '쇠고기': 'g', '등심': 'g', '안심': 'g', '차돌박이': 'g', '불고기용소고기': 'g', '다짐육': 'g', '국거리': 'g',
        '돼지고기': 'g', '삼겹살': 'g', '목살': 'g', '앞다리살': 'g', '뒷다리살': 'g', '항정살': 'g', '갈비': 'g',
        '닭고기': 'g', '닭다슴살': 'g', '닭다리': '개', '닭봉': '개', '닭날개': '개', '생닭': '마리',
        '오리고기': 'g', '훈제오리': 'g', '양고기': 'g',
        '베이컨': '줄', '햄': '개', '스팸': '캔', '소시지': '개', '비엔나소시지': '개', '어묵': '장', '맛살': '개', '크래미': '개',

        // --- 해산물류 ---
        '멸치': '줌', '디포리': '개', '다시마': '장', '김': '장', '미역': '줌', '파래': '줌', '톳': '줌',
        '고등어': '마리', '갈치': '토막', '조기': '마리', '꽁치': '마리', '연어': 'g', '명태': '마리', '대구': '마리',
        '오징어': '마리', '문어': 'g', '낙지': '마리', '주꾸미': '마리', '새우': '마리', '칵테일새우': '알', '꽃게': '마리',
        '전복': '개', '굴': 'g', '홍합': '개', '바지락': '줌', '모시조개': '줌', '백합': '개', '가리비': '개', '소라': '개', '꼬막': '줌',

        // --- 유제품 및 알류 ---
        '달걀': '개', '계란': '개', '메추리알': '개', '두부': '모', '연두부': '팩', '순두부': '봉지',
        '치즈': '장', '체다치즈': '장', '모짜렐라치즈': 'g', '슬라이스치즈': '장', '파마산치즈': '스푼', '크림치즈': '스푼',
        '버터': 'g', '마가린': 'g',

        // --- 양념 및 조미료/분말 ---
        '설탕': '스푼', '황설탕': '스푼', '흑설탕': '스푼', '소금': '스푼', '천일염': '스푼', '꽃소금': '스푼', '맛소금': '약간',
        '고춧가루': '스푼', '고추장': '스푼', '된장': '스푼', '쌈장': '스푼', '춘장': '스푼', '청국장': '개',
        '다진마늘': '스푼', '다진생강': '작은술', '통깨': '솔솔', '깨소금': '스푼', '검은깨': '솔솔',
        '후추': '약간', '허브솔트': '약간', '와사비': '약간', '겨자': '작은술', '산초가루': '약간',
        '굴소스': '스푼', '돈까스소스': '스푼', '케첩': '스푼', '마요네즈': '스푼', '머스타드': '스푼', '스테이크소스': '스푼',
        '밀가루': 'g', '중력분': 'g', '강력분': 'g', '박력분': 'g', '부침가루': 'g', '튀김가루': 'g', '빵가루': 'g',
        '전분가루': '스푼', '감자전분': '스푼', '옥수수전분': '스푼', '찹쌀가루': 'g',
        '카레가루': 'g', '짜장가루': 'g', '베이킹파우더': '작은술', '이스트': 'g',

        // --- 곡류 및 면/기타 ---
        '쌀': '컵', '백미': '컵', '현미': '컵', '찹쌀': '컵', '흑미': '줌', '보리': '줌', '팥': '줌', '콩': '줌',
        '소면': '인분', '중면': '인분', '칼국수면': '인분', '당면': '줌', '라면': '봉지', '우동사리': '봉지', '우동면': '봉지',
        '스파게티면': '인분', '파스타면': '인분', '펜네': '줌', '수제비반죽': '줌',
        '떡볶이떡': '줌', '떡국떡': '줌', '조랭이떡': '줌',
        '만두': '개', '물만두': '개', '군만두': '개',
        '호두': '알', '아몬드': '알', '땅콩': '알', '잣': '작은술', '해바라기씨': '줌',
        '식빵': '장', '바게트': '조각', '모닝빵': '개'
    };

    const STAR_SVG_PATH = "M12,17.27L18.18,21l-1.64-7.03L22,9.24l-7.19-0.61L12,2L9.19,8.63L2,9.24l5.46,4.73L5.82,21L12,17.27z";

    /**
     * 별점 HTML 렌더링 헬퍼
     */
    const renderStars = (rating) => {
        const fullStars = Math.floor(rating);
        const hasHalf = rating % 1 >= 0.5;
        let html = '';
        for (let i = 1; i <= 5; i++) {
            let cls = 'star-svg';
            if (i <= fullStars) cls += ' active';
            else if (i === fullStars + 1 && hasHalf) cls += ' half';

            html += `
                <svg class="${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="${STAR_SVG_PATH}"/>
                </svg>
            `;
        }
        return html;
    };

    // 1. 초기 접기 상태 복원
    const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
    const isCollapsed = safeLocalStorage.getItem(`recipe_collapsed_${platform}_${widgetId}`) === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    // 2. 헤더 클릭 시 접기/펼치기
    let isDragging = false;
    el.addEventListener('mousedown', (e) => {
        // 타이틀 수정 모드 중에는 모든 카드 상호작용(접기, 드래그 등)을 차단
        if (el.classList.contains('is-editing')) return;
        if (e.target.closest('button, input, textarea') || e.target.closest('.recipe-icon-wrapper')) return;
        isDragging = false;
        const startX = e.clientX;
        const startY = e.clientY;
        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5) {
                isDragging = true;
            }
        };
        const onUp = (upEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);

            if (!isDragging && upEvent.target.closest('.recipe-header')) {
                const collapsed = el.classList.toggle('collapsed');
                const platform = window.innerWidth <= 768 ? 'mobile' : 'pc';
                safeLocalStorage.setItem(`recipe_collapsed_${platform}_${widgetId}`, collapsed);

                // 접기/펴기 상태에 따른 레이아웃 독립 저장 트리거
                import('./dashboard-grid.js').then(m => m.saveLayout());
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // View 상태 관리 ('list', 'detail', 'edit')
    let currentView = 'list';
    let currentRecipeId = null;

    /**
     * 데이터를 서버에 동기화
     */
    const saveSettings = async () => {
        try {
            await apiFetch(`/api/widgets/${widgetId}`, {
                method: 'PATCH',
                body: JSON.stringify({ settings: { ...settings, recipes, title: customTitle, icon: customIcon } })
            });
        } catch (e) {
            console.error('[Recipe] 위젯 설정 저장 실패', e);
        }
    };

    /**
     * 뷰 전환 유틸리티
     */
    const renderView = (view, payload = null) => {
        currentView = view;
        currentRecipeId = payload;

        // 전역 SVG 정의 (그래디언트 등) 추가
        if (!document.getElementById('recipeGlobalSvgDefs')) {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.id = 'recipeGlobalSvgDefs';
            svg.setAttribute('style', 'width:0; height:0; position:absolute;');
            svg.setAttribute('aria-hidden', 'true');
            svg.innerHTML = `
                <defs>
                    <linearGradient id="starHalfGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="50%" stop-color="#FBBF24" />
                        <stop offset="50%" stop-color="rgba(255, 255, 255, 0.3)" />
                    </linearGradient>
                </defs>
            `;
            document.body.appendChild(svg);
        }

        // 버튼 및 제목 갱신
        if (view === 'list') {
            headerTitle.textContent = customTitle;
            if (editTitleBtn) editTitleBtn.style.display = 'flex';
            renderListView();
        } else if (view === 'detail') {
            if (editTitleBtn) editTitleBtn.style.display = 'none';
            const r = recipes.find(x => x.id === currentRecipeId);
            headerTitle.textContent = r ? r.title : '레시피 상세';
            renderDetailView(r);
        } else if (view === 'edit') {
            if (editTitleBtn) editTitleBtn.style.display = 'none';
            const isNew = !currentRecipeId;
            headerTitle.textContent = isNew ? '새 레시피 작성' : '레시피 수정';
            renderEditView(isNew ? null : recipes.find(x => x.id === currentRecipeId));
        }
    };

    /**
     * 메인 타이틀(위젯 제목) 수정 기능
     */
    if (editTitleBtn && headerTitle) {
        const pencilIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
        const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events: none;"><path d="M20 6L9 17L4 12"/></svg>`;

        editTitleBtn.innerHTML = pencilIcon; // 초기 아이콘 설정
        editTitleBtn.title = "제목 수정";

        editTitleBtn.onclick = async (e) => {
            if (currentView !== 'list') return;
            e.stopPropagation();

            const isEditing = el.classList.contains('is-editing');

            if (!isEditing) {
                // 1. 편집 모드 진입
                el.classList.add('is-editing');
                editTitleBtn.innerHTML = checkIcon;
                editTitleBtn.title = "저장";

                const current = customTitle;
                const input = document.createElement('input');
                input.value = current;
                input.className = 'recipe-title-edit-input';

                Object.assign(input.style, {
                    background: 'rgba(255, 255, 255, 0.15)', border: '1px solid #8B5CF6', color: 'white',
                    borderRadius: '6px', padding: '2px 10px', width: '180px',
                    fontSize: '1.2rem', fontWeight: '700', outline: 'none',
                    boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)'
                });

                // 취소 버튼 추가
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'cancel-title-edit-btn';
                cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                cancelBtn.title = "취소";
                cancelBtn.style.cssText = "background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; margin-left:4px; position:relative; z-index:9999; pointer-events:auto;";
                
                cancelBtn.onmousedown = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    input.value = current;
                    exitEditMode(current);
                };
                cancelBtn.ontouchstart = cancelBtn.onmousedown;
                
                editTitleBtn.parentNode.insertBefore(cancelBtn, editTitleBtn.nextSibling);

                headerTitle.replaceWith(input);
                input.focus();
                input.select();

                // 입력창 내 클릭/드래그 시 상위 위젯의 드래그/접기 이벤트와 충돌 방지
                input.onmousedown = (e) => e.stopPropagation();

                input.onkeydown = (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') editTitleBtn.click();
                    if (e.key === 'Escape') cancelBtn.click();
                };
            } else {
                // 2. 편집 완료 및 저장
                const input = el.querySelector('.recipe-title-edit-input');
                if (input) {
                    const newTitle = input.value.trim() || '나만의 레시피 북';
                    customTitle = newTitle;
                    settings.title = customTitle;
                    await saveSettings(); // DB 저장
                    exitEditMode(newTitle);
                }
            }
        };

        const exitEditMode = (title) => {
            const input = el.querySelector('.recipe-title-edit-input');
            if (input) {
                headerTitle.textContent = title;
                input.replaceWith(headerTitle);
            }
            const cancelBtn = el.querySelector('.cancel-title-edit-btn');
            if (cancelBtn) cancelBtn.remove();
            el.classList.remove('is-editing');
            editTitleBtn.innerHTML = pencilIcon;
            editTitleBtn.title = "제목 수정";
        };
    }

    /**
     * 메인 아이콘 수정 기능
     */
    if (iconBtn && iconPalette) {
        iconBtn.onclick = (e) => {
            if (currentView !== 'list') return; // 리스트 뷰에서만 허용
            e.stopPropagation();
            iconPalette.classList.toggle('hidden');
        };

        iconPalette.onclick = (e) => {
            e.stopPropagation();
            const chip = e.target.closest('.icon-chip');
            if (chip) {
                customIcon = chip.textContent;
                settings.icon = customIcon;
                iconBtn.textContent = customIcon;
                iconPalette.classList.add('hidden');
                saveSettings(); // DB 저장
            }
        };

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!iconPalette.classList.contains('hidden') && !iconPalette.contains(e.target) && e.target !== iconBtn) {
                iconPalette.classList.add('hidden');
            }
        });
    }

    /**
     * 목록 뷰 브랜치 렌더링
     */
    const renderListView = () => {
        const addCardHTML = `
            <div class="recipe-card recipe-add-card fade-in" id="btnAddNewRecipe">
                <div class="add-card-icon">+</div>
                <div class="add-card-text">새 레시피 작성</div>
            </div>
        `;

        if (recipes.length === 0) {
            container.innerHTML = `
                <div class="recipe-empty-state fade-in">
                    <div class="empty-icon">🍽️</div>
                    <p>등록된 레시피가 없습니다.</p>
                </div>
                <div class="recipe-list-grid" style="margin-top: 20px;">${addCardHTML}</div>
            `;
        } else {
            const listHTML = recipes.map((r, idx) => `
                <div class="recipe-card fade-in" data-id="${r.id}" draggable="true" data-index="${idx}">
                    <div class="drag-handle" title="순서 변경 이동" draggable="false">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <circle cx="9" cy="8" r="1.2"/><circle cx="15" cy="8" r="1.2"/>
                            <circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/>
                            <circle cx="9" cy="16" r="1.2"/><circle cx="15" cy="16" r="1.2"/>
                        </svg>
                    </div>
                    <div class="recipe-card-emoji">${r.emoji || '🍳'}</div>
                    <div class="recipe-card-info">
                        <h4 class="recipe-card-title">${r.title || '이름 없음'}</h4>
                        <div class="recipe-card-stars">${renderStars(r.rating || 0)}</div>
                        <span class="recipe-card-meta">재료 ${r.ingredients?.length || 0}개 · 순서 ${r.steps?.length || 0}단계</span>
                    </div>
                </div>
            `).join('');

            container.innerHTML = `<div class="recipe-list-grid">${listHTML}${addCardHTML}</div>`;
        }

        const newBtn = container.querySelector('#btnAddNewRecipe');
        if (newBtn) newBtn.onclick = () => renderView('edit');

        let draggedItem = null;
        let scrollInterval = null;

        const stopAutoScroll = () => {
            if (scrollInterval) {
                cancelAnimationFrame(scrollInterval);
                scrollInterval = null;
            }
        };

        const startAutoScroll = (direction) => {
            stopAutoScroll();
            const step = () => {
                const speed = 5; // 스크롤 속도
                container.scrollTop += (direction === 'down' ? speed : -speed);
                scrollInterval = requestAnimationFrame(step);
            };
            scrollInterval = requestAnimationFrame(step);
        };

        container.querySelectorAll('.recipe-card[data-id]').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('.drag-handle')) return;
                renderView('detail', card.dataset.id);
            };

            card.ondragstart = (e) => {
                draggedItem = card;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.id);
                setTimeout(() => card.classList.add('dragging'), 0);
            };

            card.ondragend = () => {
                card.classList.remove('dragging');
                draggedItem = null;
                container.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('drag-over', 'drag-over-after'));
                stopAutoScroll();
            };

            card.ondragover = (e) => {
                e.preventDefault();
                container.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('drag-over', 'drag-over-after'));

                if (card === draggedItem) {
                    stopAutoScroll();
                    return;
                }

                // 오토 스크롤 감지 (상/하단 15% 영역)
                const containerRect = container.getBoundingClientRect();
                const threshold = containerRect.height * 0.15;
                const mouseY = e.clientY - containerRect.top;

                if (mouseY < threshold) {
                    startAutoScroll('up');
                } else if (mouseY > containerRect.height - threshold) {
                    startAutoScroll('down');
                } else {
                    stopAutoScroll();
                }

                const box = card.getBoundingClientRect();
                const offset = e.clientX - box.left - (box.width / 2);
                if (offset > 0) {
                    card.classList.add('drag-over-after');
                } else {
                    card.classList.add('drag-over');
                }
            };

            card.ondragleave = () => {
                card.classList.remove('drag-over', 'drag-over-after');
                // 컨테이너를 벗어날 때 스크롤 중단은 신중해야 함 (다음 카드로 이동 중일 수 있으므로)
            };

            card.ondrop = (e) => {
                e.preventDefault();
                stopAutoScroll();
                const isAfter = card.classList.contains('drag-over-after');
                card.classList.remove('drag-over', 'drag-over-after');
                if (card === draggedItem) return;

                const draggedId = e.dataTransfer.getData('text/plain');
                if (!draggedId) return;

                const draggedIndex = recipes.findIndex(r => r.id === draggedId);
                const targetIndex = parseInt(card.dataset.index);

                if (draggedIndex === -1 || isNaN(targetIndex)) return;

                const [removed] = recipes.splice(draggedIndex, 1);

                let insertIndex = targetIndex;
                if (isAfter) insertIndex++;
                if (draggedIndex < insertIndex) insertIndex--;

                recipes.splice(insertIndex, 0, removed);
                saveSettings();
                renderListView();
            };

            // 모바일 전체 스크롤 방지 (드래그 중)
            card.addEventListener('touchstart', (e) => {
                if (e.target.closest('.drag-handle')) {
                    // 드래그 핸들을 잡았을 때만 전체 스크롤 방지 고려 (필요 시)
                }
            }, { passive: true });
        });

        // 드래그 종료 시 무조건 스크롤 중지
        container.ondragleave = (e) => {
            // 컨테이너 영역 완전히 벗어났을 때만
            if (!container.contains(e.relatedTarget)) {
                stopAutoScroll();
            }
        };
        container.onmouseup = stopAutoScroll;
    };

    /**
     * 상세 뷰 브랜치 렌더링
     */
    const renderDetailView = (recipe) => {
        if (!recipe) return renderView('list');

        const ingsHTML = (recipe.ingredients || []).map(i => {
            if (typeof i === 'object') {
                return `
                    <div class="ingredient-item-row">
                        <span class="ing-name">${i.name}</span>
                        <span class="ing-amount">${i.quantity}${i.unit || ''}</span>
                    </div>
                `;
            }
            return `<li>${i}</li>`;
        }).join('');

        const stepsHTML = (recipe.steps || []).map((s, idx) => `
            <div class="recipe-step-item">
                <div class="step-num">${idx + 1}</div>
                <div class="step-text">${s}</div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="recipe-detail-pane fade-in">
                <div class="recipe-detail-top-nav" style="display:flex; justify-content:space-between; align-items:center;">
                    <button class="btn-recipe-back">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> 목록
                    </button>
                    <button class="btn-recipe-edit-action" title="레시피 수정">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 수정하기
                    </button>
                </div>
                <div class="recipe-detail-header" style="margin-top:16px;">
                    <span class="recipe-detail-emoji">${recipe.emoji || '🍳'}</span>
                    <div class="recipe-detail-title-group">
                        <h3 class="recipe-detail-title">${recipe.title || '제목 없음'}</h3>
                        <div class="recipe-detail-stars">${renderStars(recipe.rating || 0)}</div>
                    </div>
                </div>
                
                ${recipe.thumbnail ? `<img src="${recipe.thumbnail}" class="recipe-detail-thumbnail" alt="레시피 썸네일">` : ''}
                
                <div class="recipe-detail-section">
                    <h4 class="section-title">주요 재료</h4>
                    <div class="recipe-ingredients-table">
                        ${ingsHTML || '<div class="text-muted">재료가 등록되지 않았습니다.</div>'}
                    </div>
                </div>

                <div class="recipe-detail-section">
                    <h4 class="section-title">조리 순서</h4>
                    <div class="recipe-steps-list">
                        ${stepsHTML || '<div class="text-muted">조리 순서가 등록되지 않았습니다.</div>'}
                    </div>
                </div>
                
                <div class="recipe-detail-footer">
                     <button class="btn-recipe-danger delete-current-recipe">이 레시피 삭제</button>
                </div>
            </div>
        `;

        container.querySelector('.btn-recipe-back').onclick = () => renderView('list');
        container.querySelector('.btn-recipe-edit-action').onclick = () => renderView('edit', currentRecipeId);
        container.querySelector('.delete-current-recipe').onclick = async () => {
            if (await window.appConfirm('이 레시피를 정말 삭제하시겠습니까?')) {
                recipes = recipes.filter(x => x.id !== recipe.id);
                saveSettings();
                renderView('list');
            }
        };
    };

    /**
     * 수정/작성 뷰 브랜치 렌더링
     */
    const renderEditView = (recipe = null) => {
        const title = recipe ? recipe.title : '';
        const emoji = recipe ? recipe.emoji : '🍳';
        const ings = recipe ? (recipe.ingredients || []).join('\n') : '';
        // 데이터가 없으면 '1. '로 강제 시작
        const steps = (recipe && recipe.steps && recipe.steps.length > 0)
            ? recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
            : '1. ';

        container.innerHTML = `
            <div class="recipe-edit-pane fade-in">
                <div class="recipe-edit-header">
                     <div class="recipe-item-icon-wrapper" style="position: relative;">
                         <div id="recipeEmojiInput" class="recipe-emoji-input clickable-emoji">${emoji}</div>
                         <div class="recipe-icon-palette item-icon-palette hidden" style="width: 200px; flex-wrap: wrap;">
                             <button class="icon-chip" type="button">🍳</button>
                             <button class="icon-chip" type="button">🍚</button>
                             <button class="icon-chip" type="button">🍜</button>
                             <button class="icon-chip" type="button">🍝</button>
                             <button class="icon-chip" type="button">🥩</button>
                             <button class="icon-chip" type="button">🥗</button>
                             <button class="icon-chip" type="button">🍰</button>
                             <button class="icon-chip" type="button">🍞</button>
                             <button class="icon-chip" type="button" title="아침">🌅</button>
                             <button class="icon-chip" type="button" title="점심">☀️</button>
                             <button class="icon-chip" type="button" title="저녁">🌙</button>
                         </div>
                     </div>
                     <div class="recipe-title-rating-group" style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                         <input type="text" id="recipeTitleInput" class="recipe-title-input" placeholder="레시피 제목" value="${title}">
                         <div class="recipe-rating-selector" id="recipeRatingSelector">
                             ${[1, 2, 3, 4, 5].map(n => {
            const r = recipe?.rating || 0;
            let cls = '';
            if (n <= Math.floor(r)) cls = 'active';
            else if (n === Math.ceil(r) && r % 1 !== 0) cls = 'half-preview';
            return `
                                    <span class="star-icon ${cls}" data-value="${n}">
                                        <svg class="star-svg" viewBox="0 0 24 24">
                                            <path d="${STAR_SVG_PATH}"/>
                                        </svg>
                                    </span>`;
        }).join('')}
                             <span class="rating-value-text">${recipe?.rating ? recipe.rating + '점' : '평가 전'}</span>
                         </div>
                     </div>
                </div>

                <!-- AI 자동 생성 버튼 -->
                <div class="recipe-ai-banner" id="recipeAiBanner">
                    <div class="ai-banner-content">
                        <span class="ai-banner-icon">✨</span>
                        <span class="ai-banner-text">YouTube 영상에서 AI가 자동으로 레시피를 채워드립니다</span>
                        <div class="ai-banner-btns" style="display: flex; gap: 8px;">
                            <button type="button" class="btn-go-youtube" id="btnGoYoutube">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                                YouTube 이동
                            </button>
                            <button type="button" class="btn-ai-generate" id="btnAiGenerate">🤖 AI 자동 생성</button>
                        </div>
                    </div>
                </div>

                <!-- AI 로딩 오버레이 -->
                <div class="recipe-ai-loading hidden" id="recipeAiLoading">
                    <div class="ai-loading-spinner"></div>
                    <div class="ai-loading-text" id="aiLoadingText">YouTube 영상 분석 중...</div>
                </div>
                
                <div class="recipe-edit-section">
                     <label>✨ 필요한 재료 (재료명 입력 시 단위 자동 인식)</label>
                     <div style="display: flex; gap: 8px; align-items: flex-end; margin-bottom: 12px;">
                         <div class="recipe-thumbnail-container" id="recipeThumbnailContainer" ${recipe && recipe.thumbnail ? '' : 'style="display:none; margin-bottom: 0;"'}>
                             <img src="${recipe?.thumbnail || ''}" id="recipeThumbnailPreview" class="recipe-thumbnail-preview" alt="썸네일 미리보기">
                             <button type="button" class="btn-remove-thumbnail" id="btnRemoveThumbnail" title="썸네일 삭제">×</button>
                         </div>
                         <button type="button" class="btn-upload-thumbnail" id="btnCustomThumbnail">📷 사진 얹기</button>
                         <input type="file" id="recipeThumbnailInput" accept="image/*" style="display: none;">
                     </div>
                     <div id="ingredientsEditContainer" class="ingredients-edit-container">
                         <!-- 재료 행이 여기에 추가됨 -->
                     </div>
                     <button type="button" class="btn-add-ingredient">+ 재료 추가</button>
                </div>

                <div class="recipe-edit-section">
                     <label id="stepInputLabel">🔥 조리 순서 (자동 번호 생성)</label>
                     <textarea id="recipeStepInput" class="recipe-textarea tall" placeholder="1. 내용을 입력하세요" style="white-space: pre-wrap !important;">${steps}</textarea>
                </div>

                <div class="recipe-edit-actions">
                     <button class="btn-recipe-cancel">취소</button>
                     <button class="btn-recipe-save">저장하기</button>
                </div>
            </div>
        `;

        let selectedRating = recipe ? (recipe.rating || 0) : 0;
        const ratingSelector = container.querySelector('#recipeRatingSelector');
        if (ratingSelector) {
            const stars = ratingSelector.querySelectorAll('.star-icon');
            const valText = ratingSelector.querySelector('.rating-value-text');

            const updateUI = (val) => {
                stars.forEach(s => {
                    const sVal = parseInt(s.dataset.value);
                    s.classList.remove('active', 'half-preview');
                    if (sVal <= Math.floor(val)) {
                        s.classList.add('active');
                    } else if (sVal === Math.ceil(val) && val % 1 !== 0) {
                        s.classList.add('half-preview');
                    }
                });
                valText.textContent = val > 0 ? `${val}점` : '평가 전';
            };

            stars.forEach(star => {
                star.onmousemove = (e) => {
                    const rect = star.getBoundingClientRect();
                    const isHalf = (e.clientX - rect.left) < (rect.width / 2);
                    const hoverVal = parseInt(star.dataset.value) - (isHalf ? 0.5 : 0);
                    updateUI(hoverVal);
                };

                star.onclick = (e) => {
                    const rect = star.getBoundingClientRect();
                    const isHalf = (e.clientX - rect.left) < (rect.width / 2);
                    selectedRating = parseInt(star.dataset.value) - (isHalf ? 0.5 : 0);
                    updateUI(selectedRating);
                };
            });

            ratingSelector.onmouseleave = () => {
                updateUI(selectedRating);
            };
        }

        const ingsContainer = container.querySelector('#ingredientsEditContainer');
        const addIngBtn = container.querySelector('.btn-add-ingredient');

        // ─── AI 자동 생성 로직 ─────────────────────────────────────
        const thumbnailContainer = container.querySelector('#recipeThumbnailContainer');
        const thumbnailPreview = container.querySelector('#recipeThumbnailPreview');
        const btnRemoveThumbnail = container.querySelector('#btnRemoveThumbnail');
        const btnCustomThumbnail = container.querySelector('#btnCustomThumbnail');
        const thumbnailInput = container.querySelector('#recipeThumbnailInput');

        if (btnCustomThumbnail && thumbnailInput) {
            btnCustomThumbnail.onclick = () => thumbnailInput.click();

            thumbnailInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 300;
                        let width = img.width;
                        let height = img.height;

                        if (width > MAX_WIDTH) {
                            height = Math.round((height * MAX_WIDTH) / width);
                            width = MAX_WIDTH;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // 압축된 Base64 (품질 0.7)
                        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                        if (thumbnailPreview) thumbnailPreview.src = resizedBase64;
                        if (thumbnailContainer) {
                            thumbnailContainer.style.display = 'flex';
                            thumbnailContainer.style.marginBottom = '0';
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            };
        }

        if (btnRemoveThumbnail) {
            btnRemoveThumbnail.onclick = () => {
                if (thumbnailPreview) thumbnailPreview.src = '';
                if (thumbnailContainer) thumbnailContainer.style.display = 'none';
                if (thumbnailInput) thumbnailInput.value = ''; // input 초기화
            };
        }

        const btnAiGenerate = container.querySelector('#btnAiGenerate');
        const aiLoading = container.querySelector('#recipeAiLoading');
        const aiLoadingText = container.querySelector('#aiLoadingText');
        const aiBanner = container.querySelector('#recipeAiBanner');

        const setLoading = (loading, text = '') => {
            aiLoading.classList.toggle('hidden', !loading);
            aiBanner.classList.toggle('hidden', loading);
            if (text) aiLoadingText.textContent = text;
        };

        const fillRecipeFromAI = (recipe, videoId) => {
            console.log('[RecipeAI] Received recipe data:', recipe, 'videoId:', videoId);

            // 썸네일 노출
            const thumbnailContainer = container.querySelector('#recipeThumbnailContainer');
            const thumbnailPreview = container.querySelector('#recipeThumbnailPreview');
            if (videoId && thumbnailContainer && thumbnailPreview) {
                thumbnailPreview.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                thumbnailContainer.style.display = 'flex';
            }

            // 제목 채우기
            const titleInput = container.querySelector('#recipeTitleInput');
            if (recipe.title && titleInput) titleInput.value = recipe.title;

            // 이모지 채우기
            const emojiBtn = container.querySelector('#recipeEmojiInput');
            if (recipe.emoji && emojiBtn) emojiBtn.textContent = recipe.emoji;

            // 재료 채우기
            ingsContainer.innerHTML = '';
            const ingredients = recipe.ingredients || [];
            if (Array.isArray(ingredients) && ingredients.length > 0) {
                ingredients.forEach(i => {
                    if (typeof i === 'string') {
                        // 문자열로 들어온 경우 name에 통째로 넣음
                        ingsContainer.appendChild(createIngRow(i, '', ''));
                    } else if (typeof i === 'object') {
                        // 정상적인 객체인 경우
                        ingsContainer.appendChild(createIngRow(
                            i.name || '',
                            i.quantity || '',
                            i.unit || ''
                        ));
                    }
                });
            } else {
                ingsContainer.appendChild(createIngRow());
            }

            // 조리 순서 채우기 (steps 또는 instructions 키 모두 대응)
            const stepInput = container.querySelector('#recipeStepInput');
            const stepsArray = recipe.steps || recipe.instructions || [];

            if (Array.isArray(stepsArray) && stepsArray.length > 0 && stepInput) {
                const stepText = stepsArray.map((s, idx) => {
                    if (typeof s === 'object') {
                        // 객체로 들어온 경우 첫 번째 value 추출 시도
                        return `${idx + 1}. ${Object.values(s)[0] || JSON.stringify(s)}`;
                    }
                    // 이미 번호가 붙어있는지 정규식 확인 (1. 1) 등)
                    const cleanStep = String(s).replace(/^\d+[\.\)]\s*/, '');
                    return `${idx + 1}. ${cleanStep}`;
                }).join('\n');

                stepInput.value = stepText;
            }
        };

        const showYoutubeUrlModal = (callback) => {
            const modalHTML = `
                <div class="youtube-url-modal-overlay" id="youtubeUrlModalOverlay">
                    <div class="youtube-url-modal-container">
                        <div class="youtube-modal-header">
                            <span class="youtube-modal-icon">🎬</span>
                            <h3 class="youtube-modal-title">유튜브 레시피 추출</h3>
                            <p class="youtube-modal-desc">분석할 영상의 주소를 입력해주세요</p>
                        </div>
                        <input type="text" class="youtube-url-input" id="youtubeUrlInput" placeholder="https://www.youtube.com/watch?v=..." spellcheck="false" autocomplete="off">
                        <div class="youtube-modal-actions">
                            <button type="button" class="btn-youtube-modal-cancel" id="btnYoutubeModalCancel">취소</button>
                            <button type="button" class="btn-youtube-modal-submit" id="btnYoutubeModalSubmit">분석 시작</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            const overlay = document.getElementById('youtubeUrlModalOverlay');
            const input = document.getElementById('youtubeUrlInput');
            const cancelBtn = document.getElementById('btnYoutubeModalCancel');
            const submitBtn = document.getElementById('btnYoutubeModalSubmit');

            setTimeout(() => overlay.classList.add('visible'), 10);
            input.focus();

            const close = () => {
                overlay.classList.remove('visible');
                setTimeout(() => overlay.remove(), 300);
            };

            cancelBtn.onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };

            const handleSubmit = () => {
                const url = input.value.trim();
                if (url) {
                    close();
                    callback(url);
                } else {
                    input.style.borderColor = '#ff6b6b';
                    input.placeholder = 'URL을 입력해주세요!';
                    setTimeout(() => {
                        input.style.borderColor = '';
                        input.placeholder = 'https://www.youtube.com/watch?v=...';
                    }, 2000);
                }
            };

            submitBtn.onclick = handleSubmit;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') close();
            };
        };

        if (btnAiGenerate) {
            btnAiGenerate.onclick = () => {
                showYoutubeUrlModal(async (youtubeUrl) => {
                    setLoading(true, 'YouTube 영상 정보를 가져오는 중...');

                    try {
                        // 자막 추출 시도 중 메시지
                        setTimeout(() => setLoading(true, '자막을 분석하는 중...'), 1200);
                        setTimeout(() => setLoading(true, 'AI가 레시피를 정리하는 중...'), 3000);

                        const response = await apiFetch('/api/recipe/parse-youtube', {
                            method: 'POST',
                            body: JSON.stringify({ url: youtubeUrl.trim() })
                        });

                        let data;
                        const responseText = await response.text();

                        try {
                            data = JSON.parse(responseText);
                        } catch (e) {
                            console.error('[RecipeAI] JSON Parse Error. Raw response:', responseText);
                            throw new Error(`서버 응답이 올바른 형식이 아닙니다. (Status: ${response.status})\n응답 내용: ${responseText.substring(0, 50)}...`);
                        }

                        if (!response.ok) {
                            throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
                        }

                        setLoading(false);
                        fillRecipeFromAI(data.recipe, data.videoId);

                        // 성공 피드백
                        btnAiGenerate.textContent = '✅ 완료! 수정 후 저장해주세요';
                        btnAiGenerate.style.background = 'rgba(16, 185, 129, 0.2)';
                        btnAiGenerate.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                        btnAiGenerate.style.color = '#10b981';
                        setTimeout(() => {
                            btnAiGenerate.textContent = '🤖 AI 자동 생성 (재시도)';
                            btnAiGenerate.style = '';
                        }, 5000);

                    } catch (err) {
                        setLoading(false);
                        window.appAlert('❌ AI 생성 실패: ' + err.message);
                    }
                });
            };
        }

        const btnGoYoutube = container.querySelector('#btnGoYoutube');
        if (btnGoYoutube) {
            btnGoYoutube.onclick = () => {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                if (isMobile) {
                    // 환경 요구사항: 모바일 어플리케이션을 화면위에 띄우고
                    window.location.href = "youtube://www.youtube.com";
                    // 1.5초 후에도 반응이 없으면 (앱 미설치 등) 브라우저로 폴백
                    setTimeout(() => {
                        window.open("https://www.youtube.com", "_blank");
                    }, 1500);
                } else {
                    // 환경 요구사항: PC 환경인 경우 탭을 추가로 띄움
                    window.open("https://www.youtube.com", "_blank");
                }
            };
        }
        // ───────────────────────────────────────────────────────────

        const createIngRow = (name = '', qty = '', unit = '') => {
            const row = document.createElement('div');
            row.className = 'ingredient-row';
            row.innerHTML = `
                <input type="text" class="ingredient-input ing-name-input" placeholder="재료명" value="${name}">
                <input type="text" class="ingredient-input ing-qty-input" placeholder="수량" value="${qty}">
                <input type="text" class="ingredient-input ing-unit-input" placeholder="단위" value="${unit}">
                <button type="button" class="btn-remove-ingredient" title="삭제">×</button>
            `;

            const nameInput = row.querySelector('.ing-name-input');
            const qtyInput = row.querySelector('.ing-qty-input');
            const unitInput = row.querySelector('.ing-unit-input');
            const removeBtn = row.querySelector('.btn-remove-ingredient');

            // 사용자가 단위를 직접 수정했는지 여부를 추적
            let isUnitManuallyEdited = unit !== '';

            nameInput.addEventListener('input', () => {
                const val = nameInput.value.trim();
                // 사용자가 직접 수정하지 않은 경우에만 자동 인식 작동
                if (!isUnitManuallyEdited && UNIT_MAP[val]) {
                    unitInput.value = UNIT_MAP[val];
                }
            });

            // 사용자가 단위 칸에 직접 입력하면 자동 인식 중단
            unitInput.addEventListener('input', () => {
                isUnitManuallyEdited = unitInput.value.trim() !== '';
            });

            removeBtn.onclick = () => row.remove();
            return row;
        };

        // 기존 재료 로드
        if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(i => {
                if (typeof i === 'object') {
                    ingsContainer.appendChild(createIngRow(i.name, i.quantity, i.unit));
                } else {
                    // 구형 데이터 호환: "재료명 수량" 형태 파싱 시도
                    const match = i.match(/^(.+?)\s*(\d+.*)$/);
                    if (match) {
                        ingsContainer.appendChild(createIngRow(match[1].trim(), match[2].trim(), ''));
                    } else {
                        ingsContainer.appendChild(createIngRow(i, '', ''));
                    }
                }
            });
        } else {
            ingsContainer.appendChild(createIngRow());
        }

        addIngBtn.onclick = () => {
            ingsContainer.appendChild(createIngRow());
            const lastRow = ingsContainer.lastElementChild;
            if (lastRow) lastRow.querySelector('.ing-name-input').focus();
        };

        const stepInput = container.querySelector('#recipeStepInput');
        const stepLabel = container.querySelector('#stepInputLabel');

        if (stepLabel) stepLabel.innerHTML += '';

        // 스크롤 상단 이동 (모바일에서 키보드가 즉시 올라와 화면을 가리는 것을 방지)
        setTimeout(() => {
            if (container) {
                container.scrollTop = 0;
                // 부모 요소(위젯 자체)에 스크롤이 있는 경우도 대비
                if (container.parentElement) container.parentElement.scrollTop = 0;
            }
        }, 100);

        let isAdjusting = false;

        const syncNumbers = (e) => {
            if (isAdjusting) return;
            isAdjusting = true;

            const val = stepInput.value;
            const cursorPos = stepInput.selectionStart;

            // 1. 첫 줄 번호 강제 (지워졌을 경우)
            if (val.length > 0 && !/^\d+\.\s*/.test(val)) {
                stepInput.value = '1. ' + val.replace(/^\d+\.\s*/, '');
                stepInput.selectionStart = stepInput.selectionEnd = cursorPos + 3;
            }

            // 2. 엔터 키 특수 처리
            if (e && e.key === 'Enter') {
                const textBefore = val.substring(0, cursorPos);
                const textAfter = val.substring(cursorPos);
                const lines = textBefore.split('\n');
                const lastLine = lines[lines.length - 1];
                const match = lastLine.match(/^(\d+)\.\s*(.*)/);

                if (match) {
                    const num = parseInt(match[1]);
                    const content = match[2].trim();
                    if (content === '') {
                        // 빈 번호에서 엔터 -> 리스트 종료
                        e.preventDefault();
                        const cleaned = textBefore.substring(0, textBefore.length - lastLine.length) + '\n' + textAfter;
                        stepInput.value = cleaned;
                        stepInput.selectionStart = stepInput.selectionEnd = cursorPos - lastLine.length + 1;
                    } else {
                        // 내용 있으면 다음 번호
                        e.preventDefault();
                        const nextPrefix = `\n${num + 1}. `;
                        stepInput.value = textBefore + nextPrefix + textAfter;
                        stepInput.selectionStart = stepInput.selectionEnd = cursorPos + nextPrefix.length;
                    }
                }
            }
            isAdjusting = false;
        };

        stepInput.addEventListener('keydown', syncNumbers);
        stepInput.addEventListener('input', () => syncNumbers());
        stepInput.addEventListener('click', () => syncNumbers());

        container.querySelector('.btn-recipe-cancel').onclick = () => {
            renderView(recipe ? 'detail' : 'list', recipe ? recipe.id : null);
        };

        const emojiBtn = container.querySelector('#recipeEmojiInput');
        const emojiPalette = container.querySelector('.item-icon-palette');

        if (emojiBtn && emojiPalette) {
            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                emojiPalette.classList.toggle('hidden');
            };
            emojiPalette.onclick = (e) => {
                e.stopPropagation();
                const chip = e.target.closest('.icon-chip');
                if (chip) {
                    emojiBtn.textContent = chip.textContent;
                    emojiPalette.classList.add('hidden');
                }
            };
        }

        container.querySelector('.btn-recipe-save').onclick = () => {
            const newTitle = container.querySelector('#recipeTitleInput').value.trim() || '새 레시피';
            const newEmoji = container.querySelector('#recipeEmojiInput').textContent.trim() || '🍳';
            const newRating = selectedRating;
            const rawSteps = container.querySelector('#recipeStepInput').value;

            const newIngs = Array.from(ingsContainer.querySelectorAll('.ingredient-row')).map(row => ({
                name: row.querySelector('.ing-name-input').value.trim(),
                quantity: row.querySelector('.ing-qty-input').value.trim(),
                unit: row.querySelector('.ing-unit-input').value.trim()
            })).filter(i => i.name);

            const newSteps = rawSteps.split('\n')
                .map(s => s.replace(/^\d+\.\s*/, '').trim())
                .filter(s => s);

            let finalThumbnail = recipe ? (recipe.thumbnail || '') : '';
            const thumbnailContainer = container.querySelector('#recipeThumbnailContainer');
            const thumbnailPreview = container.querySelector('#recipeThumbnailPreview');
            if (thumbnailContainer && thumbnailContainer.style.display !== 'none' && thumbnailPreview) {
                finalThumbnail = thumbnailPreview.src;
            }

            if (recipe) {
                recipe.title = newTitle;
                recipe.emoji = newEmoji;
                recipe.rating = newRating;
                recipe.ingredients = newIngs;
                recipe.steps = newSteps;
                recipe.thumbnail = finalThumbnail;
            } else {
                const newRecipe = {
                    id: 'rcp_' + Date.now(),
                    title: newTitle,
                    emoji: newEmoji,
                    rating: newRating,
                    thumbnail: finalThumbnail,
                    ingredients: newIngs,
                    steps: newSteps
                };
                recipes.push(newRecipe);
                currentRecipeId = newRecipe.id;
            }

            saveSettings();
            renderView('detail', recipe ? recipe.id : currentRecipeId);
        };
    };

    // 초기 실행
    renderView('list');
}
