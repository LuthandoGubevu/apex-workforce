import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// 32-byte AES key stored as 64-char hex in the TEMPLATE_ENCRYPTION_KEY env var.
// Set via: firebase functions:secrets:set TEMPLATE_ENCRYPTION_KEY
const KEY_ENV = 'TEMPLATE_ENCRYPTION_KEY';

function getKey(): Buffer {
  const hex = process.env[KEY_ENV];
  if (!hex || hex.length !== 64) {
    throw new Error(`${KEY_ENV} must be a 64-char hex string (32 bytes). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedBlob {
  iv:         string; // 12-byte random nonce, hex-encoded
  ciphertext: string; // AES-256-GCM encrypted payload, hex-encoded
  tag:        string; // 16-byte GCM auth tag, hex-encoded
}

/** Encrypts a fingerprint template. Zeroes rawBytes in-place after encryption. */
export function encryptTemplate(rawBytes: Buffer): EncryptedBlob {
  const key = getKey();
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  rawBytes.fill(0); // POPIA: wipe raw biometric data from memory immediately
  return {
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag:        tag.toString('hex'),
  };
}

/** Decrypts a stored template blob. Caller is responsible for zeroing the result after use. */
export function decryptTemplate(blob: EncryptedBlob): Buffer {
  const key = getKey();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(blob.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]);
}
