export const EMAIL_PORT = 'EmailPort';

export interface EmailPort {
  send(to: string, subject: string, body: string): Promise<void>;
}
