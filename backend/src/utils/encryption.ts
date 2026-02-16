import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : undefined;

if (!KEY && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY must be set in production environment');
}

export const encrypt = (text: string): string => {
  if (!KEY) {
    throw new Error('Encryption key not configured');
  }
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
};

export const decrypt = (encryptedData: string): string => {
  if (!KEY) {
    throw new Error('Encryption key not configured');
  }
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')), 
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
};

export const hashSensitiveData = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};
