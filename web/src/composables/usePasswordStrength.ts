const LOWERCASE_RE = /[a-z]/
const UPPERCASE_RE = /[A-Z]/
const DIGIT_RE = /\d/
const SPECIAL_CHAR_RE = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/
const COMMON_PASSWORDS = ['password', '123456', 'qwerty', 'abc123', '111111']

export interface PasswordStrength {
  score: number
  level: string
  color?: string
  valid: boolean
}

export function getPasswordStrength(pwd: string): PasswordStrength {
  if (!pwd)
    return { score: 0, level: '', valid: false }

  let score = 0

  if (pwd.length >= 6)
    score++
  if (pwd.length >= 10)
    score++

  let typeCount = 0
  if (LOWERCASE_RE.test(pwd))
    typeCount++
  if (UPPERCASE_RE.test(pwd))
    typeCount++
  if (DIGIT_RE.test(pwd))
    typeCount++
  if (SPECIAL_CHAR_RE.test(pwd))
    typeCount++

  if (typeCount >= 2)
    score += 2
  if (typeCount >= 3)
    score++
  if (typeCount >= 4)
    score++

  if (COMMON_PASSWORDS.some(p => pwd.toLowerCase().includes(p))) {
    score = Math.max(0, score - 2)
  }

  const level = score <= 2 ? '弱' : score <= 4 ? '中' : score <= 6 ? '强' : '非常强'
  const color = score <= 2 ? '#ef5350' : score <= 4 ? '#ffa726' : score <= 6 ? '#66bb6a' : '#43a047'
  const valid = pwd.length >= 6 && typeCount >= 2

  return { score, level, color, valid }
}
