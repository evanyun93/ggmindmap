/**
 * @file spreadsheet.js
 * @description 경량 엑셀 스타일의 스프레드시트 위젯입니다. 수식 계산 및 로컬 데이터 저장을 지원합니다.
 */

export class Spreadsheet {
    /**
     * @param {string} containerId - 위젯이 렌더링될 요소의 ID
     * @param {object} options - 초기 설정 (행, 열 수 등)
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.rows = options.rows || 5;
        this.cols = options.cols || 10;
        this.data = {}; // 예: { "A1": { value: "10", formula: "" } }
        this.headers = {}; // 예: { "col-0": "날짜", "row-1": "항목" }
        this.selectedCell = null;

        if (this.container) {
            this.init();
        }
    }

    init() {
        this.loadHeaders();
        this.render();
        this.loadData();
    }

    /**
     * 그리드 테이블을 렌더링합니다.
     */
    render() {
        this.container.innerHTML = '';
        this.container.classList.add('spreadsheet-container');

        const table = document.createElement('table');
        table.className = 'spreadsheet-table';

        // 헤더 행 (A, B, C... 또는 커스텀 이름)
        const headerRow = document.createElement('tr');
        headerRow.appendChild(document.createElement('th')); // 왼쪽 상단 빈 칸
        for (let c = 0; c < this.cols; c++) {
            const th = document.createElement('th');
            const defaultLabel = String.fromCharCode(65 + c);
            th.textContent = this.headers[`col-${c}`] || defaultLabel;
            th.contentEditable = true;
            th.className = 'col-header-editable';
            th.addEventListener('blur', (e) => this.updateHeader('col', c, e.target.textContent.trim() || defaultLabel));
            th.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
            headerRow.appendChild(th);
        }
        table.appendChild(headerRow);

        // 데이터 행들
        for (let r = 1; r <= this.rows; r++) {
            const tr = document.createElement('tr');

            // 행 번호 (1, 2, 3... 또는 커스텀 이름)
            const rowHeader = document.createElement('td');
            const defaultRowLabel = r.toString();
            rowHeader.className = 'row-header row-header-editable';
            rowHeader.textContent = this.headers[`row-${r}`] || defaultRowLabel;
            rowHeader.contentEditable = true;
            rowHeader.addEventListener('blur', (e) => this.updateHeader('row', r, e.target.textContent.trim() || defaultRowLabel));
            rowHeader.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
            tr.appendChild(rowHeader);

            for (let c = 0; c < this.cols; c++) {
                const td = document.createElement('td');
                const cellId = `${String.fromCharCode(65 + c)}${r}`;
                td.dataset.id = cellId;
                td.contentEditable = true;
                td.addEventListener('focus', (e) => this.onCellFocus(e, cellId));
                td.addEventListener('blur', (e) => this.onCellBlur(e, cellId));
                td.addEventListener('keydown', (e) => this.onCellKeyDown(e, cellId));
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }

        this.container.appendChild(table);
    }

    /**
     * 헤더 이름을 업데이트하고 저장합니다.
     */
    updateHeader(type, index, value) {
        this.headers[`${type}-${index}`] = value;
        this.saveHeaders();
    }

    saveHeaders() {
        localStorage.setItem('mindmap_spreadsheet_headers', JSON.stringify(this.headers));
    }

    loadHeaders() {
        const saved = localStorage.getItem('mindmap_spreadsheet_headers');
        if (saved) {
            this.headers = JSON.parse(saved);
        }
    }

    onCellFocus(e, cellId) {
        this.selectedCell = cellId;
        const cellData = this.data[cellId];
        if (cellData && cellData.formula) {
            e.target.textContent = cellData.formula; // 편집 시 수식 표시
        }
    }

    onCellBlur(e, cellId) {
        const value = e.target.textContent.trim();
        this.updateCell(cellId, value);
        this.selectedCell = null;
    }

    onCellKeyDown(e, cellId) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
        }
    }

    /**
     * 셀 데이터를 업데이트하고 관련 종속성을 갱신합니다.
     */
    updateCell(cellId, input) {
        let formula = '';
        let value = input;

        if (input.startsWith('=')) {
            formula = input;
            value = this.evaluateFormula(input.substring(1));
        } else if (!isNaN(Number(input)) && input !== '') {
            value = Number(input);
        }

        this.data[cellId] = { value, formula };
        this.renderCell(cellId);
        this.saveData();
        this.updateDependencies();
    }

    renderCell(cellId) {
        const cell = this.container.querySelector(`td[data-id="${cellId}"]`);
        if (cell) {
            const cellData = this.data[cellId];
            cell.textContent = cellData ? cellData.value : '';
        }
    }

    /**
     * 입력된 수식을 계산합니다 (기본 산술 연산 및 셀 참조 지원).
     */
    evaluateFormula(formula) {
        try {
            // 셀 참조(A1, B2 등)를 실제 값으로 치환
            const parsedFormula = formula.toUpperCase().replace(/([A-Z]+[0-9]+)/g, (match) => {
                const cell = this.data[match];
                const val = cell ? cell.value : 0;
                return isNaN(Number(val)) ? 0 : val;
            });

            // 보안을 위해 허용되지 않는 문자 제거 후 계산
            const safeFormula = parsedFormula.replace(/[^0-9+\-*/().\s]/g, '');
            // eslint-disable-next-line no-new-func
            return new Function('return ' + safeFormula)();
        } catch (e) {
            return '#ERROR';
        }
    }

    /**
     * 수식이 걸린 다른 셀들을 재계산합니다.
     */
    updateDependencies() {
        Object.keys(this.data).forEach(cellId => {
            if (this.data[cellId].formula) {
                const val = this.evaluateFormula(this.data[cellId].formula.substring(1));
                this.data[cellId].value = val;
                this.renderCell(cellId);
            }
        });
    }

    saveData() {
        localStorage.setItem('mindmap_spreadsheet_data', JSON.stringify(this.data));
    }

    loadData() {
        const saved = localStorage.getItem('mindmap_spreadsheet_data');
        if (saved) {
            this.data = JSON.parse(saved);
            Object.keys(this.data).forEach(cellId => this.renderCell(cellId));
        }
    }
}
