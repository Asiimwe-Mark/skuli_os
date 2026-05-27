declare module 'africastalking' {
  interface AfricasTalkingOptions {
    username: string;
    apiKey: string;
  }

  interface SmsMessage {
    to: string[];
    message: string;
    from?: string;
  }

  interface SmsRecipient {
    number: string;
    status: string;
    statusCode: number;
    messageId: string;
    cost: string;
  }

  interface SmsResponse {
    SMSMessageData: {
      Message: string;
      Recipients: SmsRecipient[];
    };
  }

  interface MobileMoneyPaymentOptions {
    productName: string;
    phoneNumber: string;
    currencyCode: string;
    amount: number;
    providerChannel?: string;
    metadata?: Record<string, string>;
  }

  interface MobileMoneyResponse {
    transactionId: string;
    status: string;
    description: string;
    providerChannel?: string;
  }

  interface SMS {
    send(options: SmsMessage): Promise<SmsResponse>;
  }

  interface MobileMoney {
    payment(options: MobileMoneyPaymentOptions): Promise<MobileMoneyResponse>;
  }

  interface AfricasTalkingClient {
    SMS: SMS;
    MOBILE_MONEY: MobileMoney;
  }

  function AfricasTalking(options: AfricasTalkingOptions): AfricasTalkingClient;

  export = AfricasTalking;
}
