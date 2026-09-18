import nodemailer from 'nodemailer';

// Configure Transporter
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass || user === 'your-email@gmail.com') {
    // If not configured, return null to log gracefully in dev
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

const getBaseEmailTemplate = (title, contentHtml) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFC; margin: 0; padding: 0; color: #1E293B; }
      .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08); }
      .header { background: linear-gradient(135deg, #0B1F3A 0%, #1A365D 100%); padding: 30px 24px; text-align: center; border-bottom: 4px solid #F59E0B; }
      .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
      .header p { color: #FCD34D; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; }
      .content { padding: 32px 28px; line-height: 1.6; }
      .greeting { font-size: 18px; font-weight: 600; color: #0B1F3A; margin-bottom: 16px; }
      .badge { display: inline-block; padding: 6px 14px; background-color: #FEF3C7; color: #92400E; font-weight: 600; font-size: 13px; border-radius: 4px; border: 1px solid #FDE68A; margin: 12px 0; }
      .info-box { background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #F59E0B; border-radius: 6px; padding: 18px 20px; margin: 20px 0; }
      .info-box p { margin: 8px 0; font-size: 14px; }
      .info-label { font-weight: 600; color: #0B1F3A; min-width: 140px; display: inline-block; }
      .info-value { color: #1E293B; font-family: monospace, sans-serif; font-size: 14px; }
      .btn { display: inline-block; background-color: #F59E0B; color: #0B1F3A !important; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 4px; margin: 20px 0; text-align: center; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3); }
      .footer { background-color: #041021; color: #94A3B8; text-align: center; padding: 24px; font-size: 12px; border-top: 1px solid #1E293B; }
      .footer a { color: #F59E0B; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>KR1 Material & Manpower Suppliers</h1>
        <p>Trusted Industrial Partner & Manpower Solutions</p>
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} KR1 Material & Manpower Suppliers. All rights reserved.</p>
        <p>Kakinada, Andhra Pradesh, India | Email: <a href="mailto:info@kr1.in">info@kr1.in</a> | Phone: +91 9666193543</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

// Generic mail sender
const sendMail = async ({ to, subject, html }) => {
  const from = process.env.EMAIL_FROM || '"KR1 Material & Manpower Suppliers" <info@kr1.in>';
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`\n📧 [EMAIL SIMULATION]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Notice: SMTP credentials not fully configured in .env. Email body simulated.\n`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * 1. Application Submitted Email
 */
const sendApplicationSubmittedEmail = async (application) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const paymentUrl = `${frontendUrl}/payment/${application.applicationId}`;

  const content = `
    <div class="greeting">Dear ${application.personalDetails.fullName},</div>
    <p>Thank you for submitting your application to <strong>KR1 Material & Manpower Suppliers</strong>.</p>
    
    <div class="info-box">
      <p><span class="info-label">Application ID:</span> <span class="info-value"><strong>${application.applicationId}</strong></span></p>
      <p><span class="info-label">Applicant Name:</span> <span class="info-value">${application.personalDetails.fullName}</span></p>
      <p><span class="info-label">Applicant Type:</span> <span class="info-value">${application.applicantType.toUpperCase()}</span></p>
      <p><span class="info-label">Registration Fee:</span> <span class="info-value">₹${application.payment.amount || 1499}</span></p>
      <p><span class="info-label">Payment Status:</span> <span class="badge">Payment Pending</span></p>
    </div>

    <p>To finalize your application verification, please complete the registration fee payment via PhonePe QR code and submit your Transaction ID.</p>
    
    <div style="text-align: center;">
      <a href="${paymentUrl}" class="btn">Proceed to Payment Screen</a>
    </div>

    <p style="font-size: 13px; color: #64748B;">Once your transaction ID is verified by our administrative team, you will automatically receive your login credentials to access your Candidate Dashboard.</p>
  `;

  return await sendMail({
    to: application.personalDetails.email,
    subject: `Application Submitted - [${application.applicationId}] | KR1 Material & Manpower Suppliers`,
    html: getBaseEmailTemplate('Application Submitted', content),
  });
};

/**
 * 2. Payment Received & Welcome Credentials Email
 */
const sendPaymentReceivedCredentialsEmail = async (application, temporaryPassword) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const loginUrl = `${frontendUrl}/login`;

  const content = `
    <div class="greeting">Welcome to KR1 Material & Manpower Suppliers!</div>
    <p>Dear <strong>${application.personalDetails.fullName}</strong>,</p>
    
    <p>We are pleased to inform you that your payment of <strong>₹${application.payment.amount || 1499}</strong> has been <strong>verified and received successfully</strong>.</p>

    <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-left: 4px solid #10B981; border-radius: 6px; padding: 18px 20px; margin: 20px 0;">
      <h3 style="color: #065F46; margin: 0 0 12px 0; font-size: 16px;">✓ Payment Confirmed & Account Activated</h3>
      <p style="margin: 6px 0;"><span class="info-label">Application ID:</span> <span class="info-value"><strong>${application.applicationId}</strong></span></p>
      <p style="margin: 6px 0;"><span class="info-label">Transaction ID:</span> <span class="info-value">${application.payment.transactionId || 'Verified by Admin'}</span></p>
      <p style="margin: 6px 0;"><span class="info-label">Current Status:</span> <span style="color: #059669; font-weight: 700;">PAYMENT RECEIVED</span></p>
    </div>

    <div class="info-box" style="border-left-color: #0B1F3A;">
      <h3 style="color: #0B1F3A; margin: 0 0 10px 0; font-size: 15px;">Your Candidate Portal Login Credentials:</h3>
      <p><span class="info-label">Login Email:</span> <span class="info-value"><strong>${application.personalDetails.email}</strong></span></p>
      <p><span class="info-label">Temporary Password:</span> <span class="info-value" style="background-color: #FEF3C7; padding: 3px 8px; border-radius: 4px; font-weight: 700; color: #92400E;">${temporaryPassword}</span></p>
    </div>

    <p>You can now log in to your Candidate Dashboard to track your application review progress, view your submitted details, and download your registered documents.</p>

    <div style="text-align: center;">
      <a href="${loginUrl}" class="btn">Login to Candidate Portal</a>
    </div>

    <p style="font-size: 12px; color: #64748B;">For security reasons, please do not share these credentials with anyone.</p>
  `;

  return await sendMail({
    to: application.personalDetails.email,
    subject: `Payment Confirmed & Login Credentials - [${application.applicationId}] | KR1 Material & Manpower Suppliers`,
    html: getBaseEmailTemplate('Payment Confirmed & Account Created', content),
  });
};

/**
 * 3. Application Under Review Email (APPLICATION_PENDING)
 */
const sendApplicationUnderReviewEmail = async (application) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dashboardUrl = `${frontendUrl}/dashboard`;

  const content = `
    <div class="greeting">Dear ${application.personalDetails.fullName},</div>
    <p>Your application <strong>[${application.applicationId}]</strong> is currently <strong>Under Review</strong> by the recruitment and screening team at KR1 Material & Manpower Suppliers.</p>
    
    <div class="info-box">
      <p><span class="info-label">Application ID:</span> <span class="info-value"><strong>${application.applicationId}</strong></span></p>
      <p><span class="info-label">Status:</span> <span style="color: #2563EB; font-weight: 700;">APPLICATION PENDING (Under Review)</span></p>
      <p><span class="info-label">Applicant Type:</span> <span class="info-value">${application.applicantType.toUpperCase()}</span></p>
    </div>

    <p>Our team is reviewing your profile, educational background, and qualifications against our current industrial and marine manpower requirements. We will notify you as soon as the evaluation is finalized.</p>

    <div style="text-align: center;">
      <a href="${dashboardUrl}" class="btn">View Live Status on Dashboard</a>
    </div>
  `;

  return await sendMail({
    to: application.personalDetails.email,
    subject: `Application Under Review - [${application.applicationId}] | KR1 Material & Manpower Suppliers`,
    html: getBaseEmailTemplate('Application Under Review', content),
  });
};

/**
 * 4. Application Confirmed Email (CONFIRMED)
 */
const sendApplicationConfirmedEmail = async (application, remarks = '') => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dashboardUrl = `${frontendUrl}/dashboard`;

  const content = `
    <div class="greeting">Congratulations, ${application.personalDetails.fullName}! 🎉</div>
    <p>We are delighted to inform you that your application for <strong>KR1 Material & Manpower Suppliers</strong> has been <strong>CONFIRMED</strong>!</p>
    
    <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-left: 4px solid #10B981; border-radius: 6px; padding: 18px 20px; margin: 20px 0;">
      <p style="margin: 6px 0;"><span class="info-label">Application ID:</span> <span class="info-value"><strong>${application.applicationId}</strong></span></p>
      <p style="margin: 6px 0;"><span class="info-label">Final Status:</span> <span style="color: #059669; font-weight: 800; font-size: 15px;">CONFIRMED / SELECTED</span></p>
      ${remarks ? `<p style="margin: 6px 0;"><span class="info-label">Admin Notes:</span> <span class="info-value">${remarks}</span></p>` : ''}
    </div>

    <p>Our onboarding and HR coordination team will contact you shortly with further details regarding placement, documentation verification, and induction schedules.</p>

    <div style="text-align: center;">
      <a href="${dashboardUrl}" class="btn">Go to Candidate Portal</a>
    </div>
  `;

  return await sendMail({
    to: application.personalDetails.email,
    subject: `Application Confirmed! - [${application.applicationId}] | KR1 Material & Manpower Suppliers`,
    html: getBaseEmailTemplate('Application Confirmed', content),
  });
};

/**
 * 5. Application Rejected Email (REJECTED)
 */
const sendApplicationRejectedEmail = async (application, remarks = '') => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dashboardUrl = `${frontendUrl}/dashboard`;

  const content = `
    <div class="greeting">Dear ${application.personalDetails.fullName},</div>
    <p>Thank you for your interest in career opportunities with <strong>KR1 Material & Manpower Suppliers</strong> and for taking the time to apply.</p>
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-left: 4px solid #EF4444; border-radius: 6px; padding: 18px 20px; margin: 20px 0;">
      <p style="margin: 6px 0;"><span class="info-label">Application ID:</span> <span class="info-value"><strong>${application.applicationId}</strong></span></p>
      <p style="margin: 6px 0;"><span class="info-label">Status:</span> <span style="color: #DC2626; font-weight: 700;">REJECTED</span></p>
      ${remarks ? `<p style="margin: 6px 0;"><span class="info-label">Remarks:</span> <span class="info-value">${remarks}</span></p>` : ''}
    </div>

    <p>After careful consideration of all applications against our present project requirements, we regret to inform you that we are unable to proceed with your candidature at this stage.</p>

    <p>Your profile will remain in our talent database for consideration in upcoming deployments and future project requirements.</p>

    <div style="text-align: center;">
      <a href="${dashboardUrl}" class="btn">View Candidate Portal</a>
    </div>
  `;

  return await sendMail({
    to: application.personalDetails.email,
    subject: `Application Status Update - [${application.applicationId}] | KR1 Material & Manpower Suppliers`,
    html: getBaseEmailTemplate('Application Status Update', content),
  });
};

export {
  sendApplicationSubmittedEmail,
  sendPaymentReceivedCredentialsEmail,
  sendApplicationUnderReviewEmail,
  sendApplicationConfirmedEmail,
  sendApplicationRejectedEmail,
};
