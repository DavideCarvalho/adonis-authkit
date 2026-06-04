import { readFile } from 'node:fs/promises'

/**
 * Cache in-memory após primeira leitura
 */
let commandsMetaData: any[] | undefined

/**
 * Lê os metadados dos commands a partir do arquivo commands.json.
 * O Ace usa esta função para listar os comandos disponíveis do pacote.
 */
export async function getMetaData() {
  if (commandsMetaData) {
    return commandsMetaData
  }

  const commandsIndex = await readFile(new URL('./commands.json', import.meta.url), 'utf-8')
  commandsMetaData = JSON.parse(commandsIndex).commands

  return commandsMetaData
}

/**
 * Importa a classe do comando pelo `commandName`.
 * O Ace chama esta função quando precisa executar um comando do pacote.
 */
export async function getCommand(metaData: { commandName: string }) {
  const commands = await getMetaData()
  const command = commands!.find(({ commandName }: any) => metaData.commandName === commandName)
  if (!command) {
    return null
  }

  const { default: commandConstructor } = await import(
    new URL(command.filePath, import.meta.url).href
  )
  return commandConstructor
}
