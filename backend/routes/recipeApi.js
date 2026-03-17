/**
 * @file recipeApi.js
 * @description 유튜브 URL을 받아 자막을 추출하고, Gemini AI로 레시피를 자동 파싱하는 API
 * ESM 의존성 없이 순수 Node.js fetch & YouTube Data API 사용
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getSubtitles } = require('youtube-captions-scraper');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * 유튜브 URL에서 Video ID 추출
 */
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
        /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * YouTube Data API로 영상 정보(제목, 설명, 자막 트랙) 가져오기
 */
async function fetchVideoInfo(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
        const snippet = data.items[0].snippet;
        return {
            title: snippet.title || '',
            description: snippet.description || '',
            channelTitle: snippet.channelTitle || '',
            tags: snippet.tags || []
        };
    }
    return { title: '', description: '', channelTitle: '', tags: [] };
}

/**
 * YouTube Captions API로 자막 목록 가져오기 (API Key 방식)
 */
async function fetchCaptionList(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            return data.items.map(item => ({
                id: item.id,
                language: item.snippet.language,
                trackKind: item.snippet.trackKind // 'standard' or 'asr'(자동생성)
            }));
        }
    } catch (e) {
        console.log('[RecipeAI] Caption list fetch failed:', e.message);
    }
    return [];
}

/**
 * YouTube 영상 자막 추출 (youtube-captions-scraper 사용)
 */
async function fetchTranscriptFromPage(videoId) {
    try {
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'ko'
        });
        return captions.map(c => c.text).join(' ');
    } catch (e) {
        console.log('[RecipeAI] 한국어 자막 실패, 기본 자막 시도:', e.message);
        try {
            const captions = await getSubtitles({
                videoID: videoId
            });
            return captions.map(c => c.text).join(' ');
        } catch (err) {
            console.log('[RecipeAI] 자막 추출 최종 실패:', err.message);
            return null;
        }
    }
}

/**
 * Gemini AI로 레시피 파싱
 */
async function parseRecipeWithGemini(text, videoInfo) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `당신은 요리 레시피 파싱 전문가입니다. 다음 텍스트를 분석하여 레시피 정보를 JSON 형식으로 추출해주세요.
영상에 등장하는 요리 과정을 단계별로 풀어서 설명하고, 등장한 식자재를 파악해 주세요.
명시적인 텍스트가 부족하더라도 문맥상 추론 가능한 요리 재료와 순서가 있다면 적극적으로 생성해 주세요.

## 영상 정보
제목: ${videoInfo.title}
채널: ${videoInfo.channelTitle}

## 분석할 텍스트
${text.substring(0, 15000)}

## 출력 형식 (반드시 순수 JSON만, 마크다운 코드블록 없이)
{
  "title": "레시피 이름",
  "emoji": "레시피를 대표하는 이모지(예: 🍚, 🍜, 🥩 등)",
  "ingredients": [
    {"name": "재료명", "quantity": "수량(숫자만)", "unit": "단위(ml/g/개/스푼 등)"}
  ],
  "steps": [
    "첫 번째 조리 단계 내용",
    "두 번째 조리 단계 내용"
  ]
}

## 지침
- 재료명, 수량, 단위를 최대한 명시적으로 분리해주세요.
- 조리 순서는 번호 없이 내용만 적어주세요.
- 원본 텍스트에 요리 정보가 극도로 적더라도 영상 제목/설명에서 유추해 기본 뼈대라도 만들어 주세요 (빈 배열 지양).
- 순수 JSON만 반환 (절대 앞뒤에 설명 텍스트 없이)`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // JSON 파싱 (마크다운 코드블록 제거 후 처리)
    const jsonText = responseText
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();
    return JSON.parse(jsonText);
}

/**
 * POST /api/recipe/parse-youtube
 * 유튜브 URL로 레시피 자동 생성
 */
router.post('/parse-youtube', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: '유튜브 URL을 입력해주세요.' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: '유효하지 않은 유튜브 URL입니다.' });
    }

    try {
        // 영상 기본 정보 + 자막 동시에 가져오기
        const [videoInfo, transcriptText] = await Promise.all([
            fetchVideoInfo(videoId),
            fetchTranscriptFromPage(videoId)
        ]);

        let sourceText;
        let sourceType;

        if (transcriptText && transcriptText.length > 100) {
            console.log(`[RecipeAI] 자막 추출 성공 (${transcriptText.length}자)`);
            sourceText = transcriptText;
            sourceType = 'transcript';
        } else if (videoInfo.description && videoInfo.description.length > 50) {
            console.log('[RecipeAI] 자막 없음 → 영상 설명란 사용');
            sourceText = `영상 제목: ${videoInfo.title}\n\n영상 설명:\n${videoInfo.description}`;
            sourceType = 'description';
        } else {
            console.log('[RecipeAI] 자막/설명 없음 → 제목 + 태그로 추측');
            const tagsText = videoInfo.tags.length > 0 ? `\n태그: ${videoInfo.tags.join(', ')}` : '';
            sourceText = `영상 제목: ${videoInfo.title}${tagsText}`;
            sourceType = 'title';
        }

        const recipe = await parseRecipeWithGemini(sourceText, videoInfo);

        res.json({
            success: true,
            source: sourceType,
            videoId: videoId,
            recipe
        });

    } catch (err) {
        console.error('[RecipeAI] 파싱 실패:', err.message);
        res.status(500).json({ error: '레시피 파싱 중 오류가 발생했습니다: ' + err.message });
    }
});

module.exports = router;
