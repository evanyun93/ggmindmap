const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

let isFirebaseInitialized = false;

try {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isFirebaseInitialized = true;
    console.log('✅ Firebase Admin SDK 초기화 완료');
  } else {
    console.warn(`⚠️ [FCM] Firebase 서비스 계정 키 파일을 찾을 수 없습니다: ${serviceAccountPath}`);
    console.warn('⚠️ 푸시 알림 기능이 작동하지 않습니다. 키 파일을 업로드해 주세요.');
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK 초기화 중 오류 발생:', error);
}

module.exports = {
  admin,
  isFirebaseInitialized
};
