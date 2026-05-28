export function getWelcomeEmailHtml(
  schoolName: string,
  adminName: string,
  loginUrl: string,
  credentials?: { email: string; password: string }
): string {
  const credentialsBlock = credentials
    ? `
          <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-weight: bold; color: #1a1a2e;">Your Login Credentials</p>
            <p style="margin: 4px 0; color: #333;"><strong>Email:</strong> ${credentials.email}</p>
            <p style="margin: 4px 0; color: #333;"><strong>Password:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${credentials.password}</code></p>
            <p style="margin: 8px 0 0; color: #666; font-size: 13px;">Please change your password after your first login.</p>
          </div>
        `
    : "";
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin: 0; padding: 0; background: #f4f4f5; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #1a1a2e; font-size: 32px; margin: 0;">
            SK<span style="color: #f59e0b;">U</span>LI
          </h1>
          <p style="color: #666; margin-top: 4px;">School Management Platform</p>
        </div>

        <!-- Main Card -->
        <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1a1a2e; margin-top: 0;">Welcome, ${adminName}!</h2>
          <p style="color: #333; line-height: 1.6;">
            Your account on <strong>${schoolName}</strong> has been set up on SKULI.
            You're ready to start managing fees, students, academics, and communication — all in one place.
          </p>
          ${credentialsBlock}

          <a href="${loginUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a2e; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 24px 0;">
            Go to Dashboard
          </a>

          <h3 style="color: #1a1a2e; margin-top: 28px;">Quick Start Checklist</h3>
          <ol style="color: #333; line-height: 2;">
            <li>Add your classes and streams</li>
            <li>Enroll your students</li>
            <li>Set up the fee structure</li>
            <li>Add teachers and staff</li>
            <li>Connect Africa's Talking for SMS</li>
          </ol>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; color: #999; font-size: 12px;">
          <p>The SKULI Team</p>
          <p>Manage your school smarter.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
