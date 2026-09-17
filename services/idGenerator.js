import Application from '../models/Application.js';

/**
 * Generates a unique, human-readable Application ID
 * Format: APP-YYYY-XXXXXX (e.g. APP-2026-000001)
 */
async function generateApplicationId() {
  const currentYear = new Date().getFullYear();
  const prefix = `APP-${currentYear}-`;

  try {
    // Find the latest application created this year
    const lastApplication = await Application.findOne({
      applicationId: new RegExp(`^${prefix}`),
    })
      .sort({ createdAt: -1 })
      .select('applicationId');

    let nextNumber = 1;

    if (lastApplication && lastApplication.applicationId) {
      const parts = lastApplication.applicationId.split('-');
      if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) {
          nextNumber = lastNum + 1;
        }
      }
    }

    const paddedNumber = String(nextNumber).padStart(6, '0');
    return `${prefix}${paddedNumber}`;
  } catch (error) {
    // Fallback in case of query failure
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}${randomSuffix}`;
  }
}

export { generateApplicationId };
