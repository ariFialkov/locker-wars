/**
 * Global money scale. The item bank is authored in believable "street" dollars
 * (a sofa is a few hundred, a motorcycle a few thousand). VALUE_SCALE converts
 * that to game dollars so a typical locker hammers for $10–$100.
 */
export const VALUE_SCALE = 0.02;
/** Convert an authored street-dollar amount to game dollars. */
export const g = (streetDollars: number): number => streetDollars * VALUE_SCALE;

export const START_BALANCE = 500;
export const BAILOUT_AMOUNT = 100;
