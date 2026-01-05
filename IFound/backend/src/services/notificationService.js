const nodemailer = require('nodemailer');

class NotificationService {
  constructor() {
    // Create test account for local development
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        // Use real SMTP
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        });
      } else {
        // Use Ethereal for testing (https://ethereal.email)
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('📧 Using Ethereal test email account:', testAccount.user);
      }
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Send email notification
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"I Found!!" <noreply@ifound.app>',
        to,
        subject,
        text,
        html,
      });

      console.log('📧 Email sent:', info.messageId);
      console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));

      return info;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    const html = `
      <h1>Welcome to I Found!!</h1>
      <p>Hi ${user.first_name},</p>
      <p>Thank you for joining I Found!! - the crowdsourced finding platform.</p>
      <p>You can now:</p>
      <ul>
        <li>Help find missing persons and lost items</li>
        <li>Earn bounties for verified findings</li>
        <li>Post your own cases if you've lost something</li>
      </ul>
      <p>Get started by browsing active cases in your area!</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to I Found!!',
      html,
      text: `Hi ${user.first_name}, Welcome to I Found!!`,
    });
  }

  /**
   * Send case created notification
   */
  async sendCaseCreatedEmail(user, caseData) {
    const html = `
      <h1>Your Case Has Been Posted</h1>
      <p>Hi ${user.first_name},</p>
      <p>Your case <strong>"${caseData.title}"</strong> has been successfully posted.</p>
      <p><strong>Bounty Amount:</strong> $${caseData.bounty_amount}</p>
      <p><strong>Case Type:</strong> ${caseData.case_type}</p>
      <p>We'll notify you when someone submits a tip.</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: user.email,
      subject: 'Case Posted Successfully - I Found!!',
      html,
      text: `Your case "${caseData.title}" has been posted.`,
    });
  }

  /**
   * Send new submission notification to poster
   */
  async sendNewSubmissionEmail(poster, submission, caseData) {
    const html = `
      <h1>New Tip Received!</h1>
      <p>Hi ${poster.first_name},</p>
      <p>Someone just submitted a tip for your case: <strong>"${caseData.title}"</strong></p>
      <p><strong>Submission Type:</strong> ${submission.submission_type}</p>
      <p><strong>Submitted:</strong> ${new Date(submission.created_at).toLocaleString()}</p>
      <p>Log in to review and verify the submission.</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: poster.email,
      subject: 'New Tip Received - I Found!!',
      html,
      text: `New tip received for "${caseData.title}"`,
    });
  }

  /**
   * Send submission verified notification
   */
  async sendSubmissionVerifiedEmail(finder, submission, caseData) {
    const bountyAmount = (parseFloat(caseData.bounty_amount) * parseFloat(submission.bounty_percentage)) / 100;

    const html = `
      <h1>Congratulations! Your Tip Was Verified! 🎉</h1>
      <p>Hi ${finder.first_name},</p>
      <p>Great news! Your tip for <strong>"${caseData.title}"</strong> has been verified.</p>
      <p><strong>Bounty Earned:</strong> $${bountyAmount.toFixed(2)}</p>
      <p>The bounty will be processed and transferred to your account.</p>
      <p>Thank you for helping make a difference!</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: finder.email,
      subject: 'Your Tip Was Verified! - I Found!!',
      html,
      text: `Your tip was verified! You earned $${bountyAmount.toFixed(2)}`,
    });
  }

  /**
   * Send case resolved notification
   */
  async sendCaseResolvedEmail(poster, caseData) {
    const html = `
      <h1>Case Resolved! 🎉</h1>
      <p>Hi ${poster.first_name},</p>
      <p>Your case <strong>"${caseData.title}"</strong> has been marked as resolved.</p>
      <p>We're so happy we could help!</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: poster.email,
      subject: 'Case Resolved - I Found!!',
      html,
      text: `Your case "${caseData.title}" has been resolved!`,
    });
  }

  /**
   * Send nearby case alert
   */
  async sendNearbyCaseAlert(user, caseData) {
    const html = `
      <h1>New Case in Your Area</h1>
      <p>Hi ${user.first_name},</p>
      <p>A new ${caseData.case_type.replace('_', ' ')} case has been posted near you:</p>
      <p><strong>${caseData.title}</strong></p>
      <p><strong>Bounty:</strong> $${caseData.bounty_amount}</p>
      <p><strong>Priority:</strong> ${caseData.priority_level}</p>
      <p>Check the app to see if you can help!</p>
      <p>Best regards,<br>The I Found!! Team</p>
    `;

    return this.sendEmail({
      to: user.email,
      subject: 'New Case Near You - I Found!!',
      html,
      text: `New case near you: "${caseData.title}" - $${caseData.bounty_amount} bounty`,
    });
  }

  /**
   * Send push notification (placeholder for future implementation)
   */
  async sendPushNotification(userId, notification) {
    // TODO: Implement Firebase Cloud Messaging
    console.log(`📱 Push notification to user ${userId}:`, notification);
    return { success: true, message: 'Push notification queued' };
  }
}

module.exports = new NotificationService();
