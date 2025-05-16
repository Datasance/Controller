const crypto = require('crypto')

class SecretHelper {
  constructor () {
    this.ALGORITHM = 'aes-256-gcm'
    this.IV_LENGTH = 12
    this.SALT_LENGTH = 16
    this.TAG_LENGTH = 16
    this.KEY_LENGTH = 32
    this.ITERATIONS = 100000
  }

  async encryptSecret (secretData, secretName) {
    const salt = crypto.randomBytes(this.SALT_LENGTH)
    const key = await this._deriveKey(secretName, salt)
    const iv = crypto.randomBytes(this.IV_LENGTH)
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv)
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(secretData), 'utf8'),
      cipher.final()
    ])
    const tag = cipher.getAuthTag()
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
  }

  async decryptSecret (encryptedData, secretName) {
    const buffer = Buffer.from(encryptedData, 'base64')
    const salt = buffer.subarray(0, this.SALT_LENGTH)
    const iv = buffer.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH)
    const tag = buffer.subarray(this.SALT_LENGTH + this.IV_LENGTH, this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH)
    const encrypted = buffer.subarray(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH)
    const key = await this._deriveKey(secretName, salt)
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    return JSON.parse(decrypted.toString('utf8'))
  }

  async _deriveKey (secretName, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        secretName,
        salt,
        this.ITERATIONS,
        this.KEY_LENGTH,
        'sha256',
        (err, key) => {
          if (err) reject(err)
          else resolve(key)
        }
      )
    })
  }
}

module.exports = new SecretHelper()
