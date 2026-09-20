// Rush ("boost") orders. Every working day the customer asks to receive the order earlier than the normal
// completion date adds 25% of the price: 1 day +25%, 2 days +50%, 3 days +75%, 4 days +100% (the maximum).
// The Worker uses the same rule to offer rush days and to verify the price of an order.
export const RUSH_STEP = 0.25;
export const RUSH_MAX_DAYS = 4;

export const rushMultiplier = days => Math.round(Number(days) * RUSH_STEP * 100) / 100;
export const rushPercent = days => Math.round(rushMultiplier(days) * 100);
