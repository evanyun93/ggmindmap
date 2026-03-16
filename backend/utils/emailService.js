const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a reusable transporter object using the default SMTP transport
// If no environment variables are set, we will only log to console
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a password reset verification email.
 * @param {string} toEmail The recipient's email address
 * @param {string} verificationCode The 6-digit verification code
 */
async function sendPasswordResetEmail(toEmail, verificationCode) {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"MindMap" <noreply@mindmap.app>', // sender address
    to: toEmail,
    subject: '[MindMap] 비밀번호 재설정 인증번호',
    text: `요청하신 비밀번호 재설정 인증번호는 [ ${verificationCode} ] 입니다. 이 인증번호는 10분간 유효합니다.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #333 text-align: center;">MindMap 비밀번호 재설정</h2>
        <p style="font-size: 16px; color: #555;">비밀번호 재설정을 위한 인증번호입니다.</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${verificationCode}</span>
        </div>
        <p style="font-size: 14px; color: #777;">이 인증번호는 10분간 유효합니다. 본인이 요청하지 않은 경우 이 메일을 무시해 주세요.</p>
      </div>
    `
  };

  if (transporter) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ 비밀번호 재설정 이메일 발송 완료: %s', info.messageId);
    } catch (error) {
      console.error('❌ 이메일 발송 실패:', error);
      // Fallback to console logging if sending fails
      console.log('--- 🛑 이메일 발송 오류로 콘솔에 대신 출력합니다 ---');
      console.log(`To: ${toEmail}\nSubject: ${mailOptions.subject}\nCode: ${verificationCode}`);
      console.log('--------------------------------------------------');
    }
  } else {
    // Mock Mode
    console.log('\n================================================--');
    console.log('📧 [MOCK EMAIL 발송]');
    console.log(`To: ${toEmail}`);
    console.log(`Subject: ${mailOptions.subject}`);
    console.log(`인증번호(Code): ${verificationCode}`);
    console.log('SMTP 설정(SMTP_HOST 등)이 없어서 콘솔에만 출력합니다.');
    console.log('================================================--\n');
  }
}

module.exports = {
  sendPasswordResetEmail
};
