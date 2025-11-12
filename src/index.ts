/**
 * KoaX - High-performance Koa-compatible framework
 *
 * Key optimizations:
 * 1. Context pooling - Reuses context objects to reduce GC pressure
 * 2. Iterative middleware dispatch - Cleaner than koa-compose
 * 3. Optimized request/response wrappers with caching
 *
 * New features:
 * 4. Hooks system (onRequest, onResponse, onError) - Fastify-inspired
 * 5. Structured logging - Pino-like logger
 * 6. Automatic request timing - Performance monitoring built-in
 *
 * Fully compatible with existing Koa middleware
 */

export { KoaXApplication } from './application';
export { Context, ContextPool } from './context';
export { KoaXRequest } from './request';
export { KoaXResponse } from './response';
export { Middleware, KoaXContext, KoaXOptions, HookFunction, ErrorHookFunction } from './types';
export { Logger, LogLevel, LoggerOptions, createLogger, generateRequestId } from './logger';
export {
  Transport,
  ConsoleTransport,
  FileTransport,
  HttpTransport,
  MultiTransport,
  FunctionTransport,
  FilterTransport,
  transports
} from './transports';

// Default export for convenience
import { KoaXApplication } from './application';
export default KoaXApplication;
