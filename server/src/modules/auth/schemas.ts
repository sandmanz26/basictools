import { z } from 'zod'
import { PASSWORD_MAX, PASSWORD_MESSAGE, passwordOk } from '../../lib/password.js'
import { emailField } from '../../lib/schemas.js'
import { PERMISSIONS } from '../../domain/permissions.js'

export const newPassword = z.string().max(PASSWORD_MAX).refine(passwordOk, PASSWORD_MESSAGE)

export const registerBody = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(200),
  email: emailField,
  password: newPassword,
})

export const loginBody = z.object({
  email: emailField,
  password: z.string().min(1).max(PASSWORD_MAX),
  remember: z.boolean().default(false),
})

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword,
})

export const forgotBody = z.object({ email: emailField })
export const resetBody = z.object({ token: z.string().min(20).max(200), password: newPassword })

export const meOut = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  roleId: z.uuid(),
  roleKey: z.string(),
  status: z.enum(['pending', 'active', 'disabled']),
  permissions: z.array(z.enum(PERMISSIONS)),
})

export const sessionOut = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int(),
  user: meOut,
})

export const messageOut = z.object({ message: z.string() })
