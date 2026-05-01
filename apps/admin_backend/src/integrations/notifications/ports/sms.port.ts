export const SMS_PORT = 'SmsPort';

export interface SmsPort {
  send(to: string, message: string): Promise<void>;
}
