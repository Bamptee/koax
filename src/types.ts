import { IncomingMessage, ServerResponse } from 'http';
import { KoaXRequest } from './request';
import { KoaXResponse } from './response';
import { KoaXApplication } from './application';
import { Logger } from './logger';
import { Transport } from './transports';
import { ServerTransport } from './server-transports';

/**
 * Middleware function signature compatible with Koa
 * @param ctx - Context object containing request/response
 * @param next - Function to call next middleware in chain
 */
export type Middleware = (ctx: KoaXContext, next: () => Promise<void>) => Promise<void> | void;

/**
 * Hook function signature
 * Hooks are executed at specific lifecycle points
 */
export type HookFunction = (ctx: KoaXContext) => Promise<void> | void;

/**
 * Error hook function signature
 */
export type ErrorHookFunction = (error: Error, ctx: KoaXContext) => Promise<void> | void;

/**
 * Context object interface - fully compatible with Koa's context
 *
 * This interface is designed to be structurally compatible with Koa.Context
 * so that all existing Koa middleware will work without modifications.
 * We use structural typing instead of extends to avoid deep inheritance issues.
 */
export interface KoaXContext {
  // Core properties
  app: KoaXApplication;
  req: IncomingMessage;
  res: ServerResponse;
  request: KoaXRequest;
  response: KoaXResponse;
  state: Record<string, any>;

  // NEW: KoaX additions (not in standard Koa)
  log: Logger;           // Structured logger with request context
  requestId: string;     // Unique request ID for tracing
  startTime: number;     // Request start timestamp for timing

  // Delegated from request (Koa-compatible)
  url: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  originalUrl: string;
  origin: string;
  href: string;
  host: string;
  hostname: string;
  fresh: boolean;
  stale: boolean;
  socket: any;
  secure: boolean;
  ip: string;
  ips: string[];

  // Delegated from response (Koa-compatible)
  status: number;
  message: string;
  body: any;
  type: string;
  length?: number;
  lastModified?: Date;
  etag?: string;

  // Helper methods (Koa-compatible)
  throw(status: number, message?: string): never;
  assert(condition: any, status: number, message?: string): asserts condition;
  set(field: string, val: string | string[]): void;
  get(field: string): string | number | string[] | undefined;
  remove(field: string): void;
  vary(field: string): void;
  redirect(url: string, alt?: string): void;
  attachment(filename?: string): void;
  is(...types: string[]): string | false | null;
  accepts(...types: string[]): string | false;
  acceptsEncodings(...encodings: string[]): string | false;
  acceptsCharsets(...charsets: string[]): string | false;
  acceptsLanguages(...languages: string[]): string | false;

  // Optional Koa methods (for middleware compatibility)
  onerror?(err: Error): void;
  toJSON?(): any;
  inspect?(): any;

  // Router properties (added by @koa/router and KoaX Router)
  params?: Record<string, string>;           // URL parameters from route patterns
  router?: any;                               // Reference to the Router instance
  matched?: any[];                            // Array of matched route layers
  _matchedRoute?: string;                     // Pattern of the matched route
  _matchedRouteName?: string;                 // Name of the matched route (if named)

  // Internal pooling flag (KoaX-specific)
  _inUse?: boolean;
}

/**
 * Application options
 */
export interface KoaXOptions {
  env?: string;
  proxy?: boolean;
  subdomainOffset?: number;
  contextPoolSize?: number; // Size of context pool
  logger?: {
    enabled?: boolean;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    prettyPrint?: boolean;
    name?: string;
    transport?: Transport; // NEW: Custom transport (console, file, HTTP, etc.)
  };
  timing?: boolean; // Enable automatic request timing (default: true)
  serverTransport?: ServerTransport; // NEW: Custom server transport (HTTP, HTTP/2, uWebSockets, etc.)
}
