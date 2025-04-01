export function wrapWithRetry<T extends object>(
  instance: T,
  expectedMessage: string[],
  delay: number = 350,
  maxRetries: number = 3,
): T {
  const wrapper = Object.create(instance);

  for (const key of Reflect.ownKeys(Object.getPrototypeOf(instance))) {
    const original = (instance as any)[key];

    if (typeof original === 'function') {
      (wrapper as any)[key] = async (...args: any[]) => {
        let attempts = 0;

        while (attempts < maxRetries) {
          try {
            const result = await original.apply(instance, args);

            if (
              typeof result === 'object' &&
              verificarMensagemDeErro(result?.message, expectedMessage)
            ) {
              console.warn(
                `Tentativa ${attempts + 1}: ${result.message}. Tentando novamente em ${delay}ms...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              attempts++;
              continue;
            }

            return result;
          } catch (error) {
            console.error(`Erro ao chamar ${String(key)}:`, error);
            throw error;
          }
        }

        throw new Error(`Máximo de tentativas atingido para o método ${String(key)}`);
      };
    } else {
      (wrapper as any)[key] = original;
    }
  }

  return wrapper as T;
}

function verificarMensagemDeErro(errorMessage: string, expectedMessage: string[]): boolean {
  let encontrou = false;
  expectedMessage.forEach((message) => {
    encontrou = message.startsWith(errorMessage);
    if (encontrou) return encontrou;
  });

  return encontrou;
}
