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

/**
 * Troca de senha no console de conta. A regra da nova senha espelha o
 * signupValidator (min 8, max 255); a senha atual é confirmada à parte via
 * verifyCredentials.
 */
export const changePasswordValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(1),
    newPassword: vine.string().minLength(8).maxLength(255),
  })
)

/** Troca de e-mail no console de conta: senha atual + o novo e-mail. */
export const changeEmailValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(1),
    newEmail: vine.string().trim().email().normalizeEmail(),
  })
)

/**
 * Edição de perfil no console de conta: nome e avatarUrl, ambos opcionais.
 * Campos vazios são normalizados para string vazia (limpa o valor).
 */
export const updateProfileValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(255).optional(),
    avatarUrl: vine.string().trim().url().maxLength(2048).optional(),
  })
)

/**
 * Deleção self-service de conta (LGPD). Aceita confirmação por senha atual
 * (`currentPassword`) OU pelo e-mail digitado (`confirmEmail`, p/ contas
 * passwordless). Ambos opcionais aqui; o controller exige que UM deles confirme.
 */
export const deleteAccountValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().optional(),
    confirmEmail: vine.string().trim().optional(),
  })
)

/** Criação de usuário no console admin (email obrigatório; nome/senha opcionais). */
export const adminCreateUserValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().normalizeEmail(),
    name: vine.string().trim().maxLength(255).optional(),
    password: vine.string().minLength(8).maxLength(255).optional(),
  })
)
