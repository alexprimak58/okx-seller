import ccxt from 'ccxt';
import { getCurrentTime } from './utils/common';

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = 15,
  delay = 10000
) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`[${getCurrentTime()}] Ошибка:`, error);
      if (i < retries - 1) {
        console.log(
          `[${getCurrentTime()}] Повторная попытка... (${i + 1}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

(async () => {
  try {
    const apiKey: string = '';
    const secret: string = '';
    const password: string = '';

    const exchange = new ccxt.okx({
      apiKey: apiKey,
      secret: secret,
      password: password,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        timeout: 60000,
      },
    });

    exchange.options['defaultType'] = 'spot';

    const symbol: string = 'GRASS/USDT';

    console.log(`[${getCurrentTime()}] Начало мониторинга баланса GRASS...`);

    while (true) {
      const balance = await fetchWithRetry(() => exchange.fetchBalance());
      if (!balance) continue;

      const freeBalance = balance.free as unknown as { [key: string]: number };
      let grassBalance: number = freeBalance['GRASS'] || 0;

      if (grassBalance >= 3) {
        const ticker = await fetchWithRetry(() => exchange.fetchTicker(symbol));
        if (!ticker) continue;

        const lastPrice = ticker.last;

        if (lastPrice !== undefined) {
          const currentPrice = Math.floor(lastPrice * 1000) / 1000;

          console.log(
            `[${getCurrentTime()}] Обнаружено ${grassBalance} GRASS. Начинаем продажу по цене ${currentPrice} USDT...`
          );

          const params = {
            timeInForce: 'IOC',
          };

          while (grassBalance >= 5) {
            try {
              const order = await fetchWithRetry(() =>
                exchange.createOrder(
                  symbol,
                  'limit',
                  'sell',
                  grassBalance,
                  currentPrice,
                  params
                )
              );

              if (order) {
                const orderDetails = await exchange.fetchOrder(
                  order.id,
                  symbol,
                  { acknowledged: true }
                );
                if (orderDetails.status === 'closed') {
                  console.log(
                    `[${getCurrentTime()}] Ордер полностью выполнен: продано ${
                      orderDetails.amount
                    } GRASS на общую сумму ${
                      orderDetails.cost
                    }$ по средней цене ${orderDetails.average}$ за токен.`
                  );
                  grassBalance = 0;
                } else if (orderDetails.status === 'canceled') {
                  if (orderDetails.filled > 0) {
                    console.log(
                      `[${getCurrentTime()}] Ордер частично выполнен: продано ${
                        orderDetails.filled
                      } GRASS на общую сумму ${
                        orderDetails.cost
                      }$ по средней цене ${
                        orderDetails.average
                      }$ за токен. Остаток ${
                        orderDetails.remaining
                      } GRASS не был исполнен и отменен.`
                    );

                    const updatedBalance = await fetchWithRetry(() =>
                      exchange.fetchBalance()
                    );
                    if (updatedBalance) {
                      const updatedFreeBalance =
                        updatedBalance.free as unknown as {
                          [key: string]: number;
                        };
                      grassBalance = updatedFreeBalance['GRASS'] || 0;
                    }
                  } else {
                    console.log(
                      `[${getCurrentTime()}] Ордер не был исполнен и был отменен.`
                    );
                    break;
                  }
                } else {
                  console.log(
                    `[${getCurrentTime()}] Статус ордера: ${
                      orderDetails.status
                    }.`
                  );
                }
              }
            } catch (error) {
              console.error(
                `[${getCurrentTime()}] Ошибка при размещении ордера:`,
                error
              );
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          console.log(
            `[${getCurrentTime()}] Продажа завершена или больше нет доступных токенов для продажи.`
          );
        } else {
          console.log(
            `[${getCurrentTime()}] Не удалось получить текущую цену для ${symbol}. Ожидание...`
          );
        }
      } else {
        console.log(
          `[${getCurrentTime()}] Баланс GRASS: ${grassBalance}. Ожидание поступления токенов...`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Произошла ошибка:', error);
  }
})();
