import vine from '@vinejs/vine'

export const signupValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().normalizeEmail(),
    fullName: vine.string().trim().minLength(2).maxLength(255),
    password: vine.string().minLength(8).maxLength(255),
  })
)

export const forgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().normalizeEmail(),
  })
)

export const resetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
    password: vine.string().minLength(8).maxLength(255),
  })
)
