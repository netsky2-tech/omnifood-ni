export interface Ok<Value> {
  readonly ok: true;
  readonly value: Value;
}

export interface Err<Error> {
  readonly ok: false;
  readonly error: Error;
}

export type Result<Value, Error> = Ok<Value> | Err<Error>;

export const ok = <Value>(value: Value): Ok<Value> => ({ ok: true, value });

export const err = <Error>(error: Error): Err<Error> => ({ ok: false, error });
