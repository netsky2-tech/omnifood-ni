/**
 * Framework-free leaf for the user role domain value.
 *
 * This file must not import anything (frameworks, entities, NestJS, TypeORM)
 * so that security primitives such as permissions.enum.ts can depend on it
 * without transitively loading persistence metadata.
 */
export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
}
