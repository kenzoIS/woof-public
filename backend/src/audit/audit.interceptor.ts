import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, tap, throwError } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const started = Date.now();
    const path = request.originalUrl || request.url || '';
    if (path.includes('/audit/')) return next.handle();

    const user = request.user || request.session?.user;
    const hasAuth = Boolean(user || request.headers?.['authorization']);
    const actor = hasAuth ? 'Owner' : 'System';
    const actorType = hasAuth ? 'user' : 'system';
    const module = path.split('/').filter(Boolean)[1] || 'system';
    const category =
      module === 'auth' || module === 'security'
        ? 'security'
        : actorType === 'user'
          ? 'workflow'
          : 'ai_system';
    const action = `${request.method} ${path.replace(/^\/api\/?/, '')}`;
    const target =
      request.params && Object.keys(request.params).length
        ? JSON.stringify(request.params)
        : undefined;

    const write = (status: 'success' | 'failed') =>
      this.auditService.record({
        actor: String(actor),
        actorType,
        action,
        module,
        category,
        target,
        status,
        method: request.method,
        path,
        durationMs: Date.now() - started,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        stateAfter: status === 'success' ? `${response.statusCode}` : undefined,
        metadata: {
          query: request.query || {},
          statusCode: response.statusCode,
        },
      });

    return next.handle().pipe(
      tap(() => void write('success')),
      catchError((error) => {
        void this.auditService.record({
          actor: String(actor),
          actorType,
          action,
          module,
          category,
          target,
          status: 'failed',
          method: request.method,
          path,
          durationMs: Date.now() - started,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: {
            query: request.query || {},
            statusCode: error?.status || 500,
            error: error?.message,
          },
        });
        return throwError(() => error);
      }),
    );
  }
}
