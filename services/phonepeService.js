import {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
  PrefillUserLoginDetails,
  RefundRequest,
  PhonePeException,
} from '@phonepe-pg/pg-sdk-node';

class PhonePeService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.clientId = process.env.PHONEPE_CLIENT_ID || 'MOCK_CLIENT_ID';
    this.clientSecret = process.env.PHONEPE_CLIENT_SECRET || 'MOCK_CLIENT_SECRET';
    this.clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION || '1', 10);
    this.env =
      process.env.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX;

    this.initClient();
  }

  /**
   * Initialize PhonePe StandardCheckoutClient singleton
   */
  initClient() {
    try {
      this.client = StandardCheckoutClient.getInstance(
        this.clientId,
        this.clientSecret,
        this.clientVersion,
        this.env
      );
      this.initialized = true;
      console.log(
        `✅ PhonePe StandardCheckoutClient initialized in ${
          this.env === Env.PRODUCTION ? 'PRODUCTION' : 'SANDBOX'
        } mode.`
      );
    } catch (error) {
      console.error('⚠️ PhonePe StandardCheckoutClient initialization warning:', error.message);
    }
  }

  /**
   * Get active PhonePe client instance
   */
  getClient() {
    if (!this.client) {
      this.initClient();
    }
    return this.client;
  }

  /**
   * Create a Standard Checkout Payment Request (focused on UPI & QR)
   *
   * @param {Object} params
   * @param {string} params.merchantOrderId - Unique order ID
   * @param {number} params.amountInPaise - Payable amount in paise (₹1,000 = 100000 paise)
   * @param {string} params.redirectUrl - URL to redirect browser after payment
   * @param {string} [params.candidatePhone] - Candidate phone number for UPI prefill
   * @param {string} [params.candidateName] - Candidate name
   */
  async createPaymentOrder({
    merchantOrderId,
    amountInPaise,
    redirectUrl,
    candidatePhone,
    candidateName,
  }) {
    const client = this.getClient();
    if (!client) {
      throw new Error('PhonePe client is not initialized. Please verify credentials in .env.');
    }

    const builder = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaise)
      .redirectUrl(redirectUrl)
      .message('KR Material Registration Fee - UPI & QR');

    // Prefill phone number for expedited UPI lookup if available
    if (candidatePhone) {
      const cleanPhone = candidatePhone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        try {
          const prefill = PrefillUserLoginDetails.builder()
            .phoneNumber(cleanPhone)
            .build();
          builder.prefillUserLoginDetails(prefill);
        } catch (err) {
          console.warn('Could not attach prefillUserLoginDetails:', err.message);
        }
      }
    }

    const payRequest = builder.build();
    const payResponse = await client.pay(payRequest);

    return {
      success: true,
      paymentUrl: payResponse.redirectUrl,
      orderId: payResponse.orderId || null,
      merchantOrderId,
    };
  }

  /**
   * Fetch order status from PhonePe and map into standard application states
   *
   * @param {string} merchantOrderId
   */
  async getOrderStatus(merchantOrderId) {
    const client = this.getClient();
    if (!client) {
      throw new Error('PhonePe client is not initialized.');
    }

    try {
      const response = await client.getOrderStatus(merchantOrderId);

      // Map PhonePe state into internal status
      // PhonePe documented states: COMPLETED, FAILED, PENDING
      let internalStatus = 'PENDING';
      const state = (response.state || '').toUpperCase();

      if (state === 'COMPLETED') {
        internalStatus = 'SUCCESS';
      } else if (state === 'FAILED' || state === 'CANCELLED') {
        internalStatus = 'FAILED';
      } else {
        internalStatus = 'PENDING';
      }

      // Extract transaction / UPI details if present
      let transactionId = null;
      let paymentMode = 'UPI';

      if (response.paymentDetails && response.paymentDetails.length > 0) {
        const latestDetail = response.paymentDetails[response.paymentDetails.length - 1];
        transactionId = latestDetail.transactionId || null;
        paymentMode = latestDetail.paymentMode || 'UPI';
      }

      return {
        success: true,
        state,
        internalStatus,
        orderId: response.orderId,
        amount: response.amount ? response.amount / 100 : null,
        transactionId,
        paymentMode,
        raw: response,
      };
    } catch (error) {
      console.error(`PhonePe getOrderStatus error for [${merchantOrderId}]:`, error.message);
      throw error;
    }
  }

  /**
   * Verify server-to-server webhook callback from PhonePe
   *
   * @param {Object} params
   * @param {string} params.username - Configured webhook username
   * @param {string} params.password - Configured webhook password
   * @param {string} params.authHeader - 'Authorization' or 'x-verify' header
   * @param {string} params.rawBody - Raw request body string (unaltered)
   */
  validateWebhookCallback({ username, password, authHeader, rawBody }) {
    const client = this.getClient();
    if (!client) {
      throw new Error('PhonePe client is not initialized.');
    }

    return client.validateCallback(username, password, authHeader, rawBody);
  }

  /**
   * Initiate a refund using PhonePe SDK
   *
   * @param {Object} params
   * @param {string} params.merchantRefundId
   * @param {string} params.originalMerchantOrderId
   * @param {number} params.amountInPaise
   */
  async refundPayment({ merchantRefundId, originalMerchantOrderId, amountInPaise }) {
    const client = this.getClient();
    if (!client) {
      throw new Error('PhonePe client is not initialized.');
    }

    const request = RefundRequest.builder()
      .merchantRefundId(merchantRefundId)
      .originalMerchantOrderId(originalMerchantOrderId)
      .amount(amountInPaise)
      .build();

    const response = await client.refund(request);
    return response;
  }

  /**
   * Check status of a refund
   *
   * @param {string} refundId
   */
  async getRefundStatus(refundId) {
    const client = this.getClient();
    if (!client) {
      throw new Error('PhonePe client is not initialized.');
    }

    return client.getRefundStatus(refundId);
  }
}

// Export singleton instance
export default new PhonePeService();
