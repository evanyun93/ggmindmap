/**
 * @file mindmap-engine.js
 * @description 자유 드로잉 데이터를 분석하여 정제된 도형(원, 사각형, 삼각형)으로 변환하는 엔진.
 *
 * 핵심 알고리즘 개선 포인트:
 *  - 각도 커버리지(Angular Coverage): 원은 360° 전체를 커버하지만 사각형은 모서리에 갭이 생김
 *  - 정규화된 에러(Normalized Error): 절대값이 아닌 도형 크기 대비 상대 에러 비교
 *  - 폐합도(Closedness): 시작점과 끝점이 가까울수록 닫힌 도형 (원/사각형)
 *  - 종합 스코어링: 여러 특징의 가중 합산으로 최종 도형 결정
 */

export class MindmapEngine {
    constructor() {
        this.points = [];
    }

    addPoint(x, y) {
        this.points.push({ x, y });
    }

    clearPoints() {
        this.points = [];
    }

    recognizeShape() {
        if (this.points.length < 15) return null;

        const { minX, minY, maxX, maxY } = this.getBoundingBox();
        const width  = maxX - minX;
        const height = maxY - minY;
        const cx     = (minX + maxX) / 2;
        const cy     = (minY + maxY) / 2;

        if (width < 20 || height < 20) return null;

        const radius = (width + height) / 4;
        const diag   = Math.hypot(width, height);

        // ── 1. 폐합도 (0 = 열린 선, 1 = 완전히 닫힌 도형) ────────────
        const first = this.points[0];
        const last  = this.points[this.points.length - 1];
        const closedDist = Math.hypot(first.x - last.x, first.y - last.y) / diag;
        const closedness = Math.max(0, 1 - closedDist * 2); // 가중 적용

        // ── 2. 각도 커버리지 (18 섹터 기준) ─────────────────────────
        // 원: 거의 모든 섹터 커버 / 사각형: 변 부근 섹터만 커버, 모서리 섹터 약함
        const SECTORS = 18;
        const covered = new Set();
        this.points.forEach(p => {
            const angle  = Math.atan2(p.y - cy, p.x - cx); // -π ~ π
            const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS;
            covered.add(sector);
        });
        const angularCoverage = covered.size / SECTORS;

        // ── 3. 원형 에러 (정규화: 반지름 대비) ──────────────────────
        let circleErrSum = 0;
        this.points.forEach(p => {
            circleErrSum += Math.abs(Math.hypot(p.x - cx, p.y - cy) - radius);
        });
        const avgCircleErr = circleErrSum / this.points.length / radius;

        // ── 4. 사각형 에러 (정규화: min(w,h)/2 대비) ─────────────────
        let rectErrSum = 0;
        this.points.forEach(p => {
            const dx = Math.min(Math.abs(p.x - minX), Math.abs(p.x - maxX));
            const dy = Math.min(Math.abs(p.y - minY), Math.abs(p.y - maxY));
            rectErrSum += Math.min(dx, dy);
        });
        const avgRectErr = rectErrSum / this.points.length / (Math.min(width, height) * 0.5);

        // ── 5. 가로세로 비율 (1에 가까울수록 정사각형/원에 가까움) ────
        const aspectRatio = Math.min(width, height) / Math.max(width, height);

        // ── 6. 삼각형 에러 ───────────────────────────────────────────
        const distToSeg = (p, p1, p2) => {
            const num = Math.abs((p2.x - p1.x) * (p1.y - p.y) - (p1.x - p.x) * (p2.y - p1.y));
            const den = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
            return num / den;
        };
        const pTop   = { x: cx,   y: minY };
        const pLeft  = { x: minX, y: maxY };
        const pRight = { x: maxX, y: maxY };
        let triErrSum = 0;
        this.points.forEach(p => {
            triErrSum += Math.min(
                distToSeg(p, pLeft,  pRight),
                distToSeg(p, pTop,   pLeft),
                distToSeg(p, pTop,   pRight)
            );
        });
        const avgTriErr = triErrSum / this.points.length / (Math.min(width, height) * 0.5);

        // ── 종합 스코어 계산 ──────────────────────────────────────────
        //
        // 원 스코어: 낮은 원형 에러 + 높은 각도 커버리지 + 폐합 + 정방형 바운딩박스
        //   → 핵심은 angularCoverage: 원을 그리면 360° 고르게 커버
        const circleScore =
            (1 - Math.min(avgCircleErr, 1)) * 0.30 +
            angularCoverage               * 0.40 +  // ← 가장 중요한 판별자
            closedness                    * 0.15 +
            aspectRatio                   * 0.15;

        // 사각형 스코어: 낮은 rect 에러 + 폐합
        //   → angularCoverage가 높으면 (= 원처럼 그렸으면) 패널티
        const rectScore =
            (1 - Math.min(avgRectErr, 1)) * 0.55 +
            closedness                    * 0.25 +
            (1 - angularCoverage)         * 0.20;   // ← 원이면 감점

        // 삼각형 스코어
        const triScore =
            (1 - Math.min(avgTriErr, 1))  * 0.50 +
            (1 - closedness)              * 0.20 +
            (1 - angularCoverage * 0.5)   * 0.30;

        console.log(
            `[Engine] ○ ${circleScore.toFixed(2)}  □ ${rectScore.toFixed(2)}  △ ${triScore.toFixed(2)}` +
            `  | cov:${angularCoverage.toFixed(2)}  closed:${closedness.toFixed(2)}  aspect:${aspectRatio.toFixed(2)}`
        );

        // 최고 스코어 도형 선택
        const candidates = [
            { type: 'circle',   score: circleScore },
            { type: 'rect',     score: rectScore   },
            { type: 'triangle', score: triScore    },
        ].sort((a, b) => b.score - a.score);

        const winner = candidates[0];

        if (winner.type === 'circle' && circleScore > 0.45) {
            return {
                type: 'circle',
                x: cx, y: cy,
                radius: Math.max(radius, 32)
            };
        }
        if (winner.type === 'triangle' && triScore > 0.42) {
            return {
                type: 'triangle',
                x: cx, y: cy,
                width:  Math.max(width, 80),
                height: Math.max(height, 70)
            };
        }
        // 기본: 사각형
        return {
            type: 'rect',
            x: cx, y: cy,
            width:  Math.max(width, 80),
            height: Math.max(height, 45)
        };
    }

    getBoundingBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        return { minX, minY, maxX, maxY };
    }
}

export const mindmapEngine = new MindmapEngine();
