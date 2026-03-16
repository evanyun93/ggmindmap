/**
 * @file context-menu.js
 * @description 대시보드 커스텀 우클릭 메뉴 유틸리티
 */

export class ContextMenu {
    constructor() {
        this.menu = null;
        this.isInitialized = false;
        this.handleDocumentClick = null;
        this.handleDocumentTouchStart = null;
        this.handleDocumentContextMenu = null;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        if (this.isInitialized) return;

        // 기존 메뉴가 있으면 정리 후 재생성
        this.destroy();

        this.menu = document.createElement('div');
        this.menu.id = 'customContextMenu';
        this.menu.className = 'custom-context-menu';
        this.menu.style.display = 'none';
        this.menu.style.position = 'fixed';
        this.menu.style.zIndex = '10000';
        document.body.appendChild(this.menu);

        this.bindGlobalListeners();
        this.isInitialized = true;
    }

    bindGlobalListeners(containerSelector = '#widgetGrid') {
        this.handleDocumentClick = () => this.hide();
        this.handleDocumentTouchStart = (e) => {
            if (!e.target.closest('#customContextMenu')) {
                this.hide();
            }
        };
        this.handleDocumentContextMenu = (e) => {
            // 컨테이너 외부 우클릭 시에만 닫기 (컨테이너 내부는 각 모듈에서 처리)
            if (!e.target.closest(containerSelector)) {
                this.hide();
            }
        };

        document.addEventListener('click', this.handleDocumentClick);
        document.addEventListener('touchstart', this.handleDocumentTouchStart, { passive: true });
        document.addEventListener('contextmenu', this.handleDocumentContextMenu);
    }

    unbindGlobalListeners() {
        if (this.handleDocumentClick) {
            document.removeEventListener('click', this.handleDocumentClick);
            this.handleDocumentClick = null;
        }

        if (this.handleDocumentTouchStart) {
            document.removeEventListener('touchstart', this.handleDocumentTouchStart);
            this.handleDocumentTouchStart = null;
        }

        if (this.handleDocumentContextMenu) {
            document.removeEventListener('contextmenu', this.handleDocumentContextMenu);
            this.handleDocumentContextMenu = null;
        }
    }

    renderItems(items) {
        if (!this.menu) return;
        this.menu.innerHTML = '';

        items.forEach(item => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'menu-separator';
                this.menu.appendChild(sep);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';

            const iconHtml = item.icon ? `<span class="menu-icon">${item.icon}</span>` : '';
            menuItem.innerHTML = `
                ${iconHtml}
                <span class="menu-label">${item.label}</span>
            `;

            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                this.hide();
            });

            this.menu.appendChild(menuItem);
        });
    }

    positionMenu(x, y) {
        if (!this.menu) return;

        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;

        const rect = this.menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) {
            this.menu.style.left = `${window.innerWidth - rect.width - 15}px`;
        }
        if (y + rect.height > window.innerHeight) {
            this.menu.style.top = `${Math.max(10, window.innerHeight - rect.height - 15)}px`;
        }
    }

    show(x, y, items) {
        if (!this.isInitialized) this.init();
        if (!this.menu) return;

        this.renderItems(items);
        this.menu.classList.remove('hide');
        this.menu.style.display = 'block';
        this.positionMenu(x, y);
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
    }

    destroy() {
        this.unbindGlobalListeners();

        const existing = document.getElementById('customContextMenu');
        if (existing) existing.remove();

        this.menu = null;
        this.isInitialized = false;
    }
}

export const contextMenu = new ContextMenu();
