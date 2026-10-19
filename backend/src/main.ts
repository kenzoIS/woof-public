import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Only trust forwarded client IPs when the deployment proxy is explicitly configured.
  if (process.env.TRUST_PROXY === 'true') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const port = Number(process.env.PORT) || 3001;

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.use((_req, response, next) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3002')
        .split(',')
        .map((value) => value.trim());
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // ── Security: Global Validation Pipeline ──────────────────────────
  // Rejects payloads with unexpected/injected fields (anti-injection).
  // Skips validation for endpoints without explicit DTOs so existing
  // routes continue to function while DTOs are progressively adopted.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      skipMissingProperties: false,
      skipNullProperties: false,
      skipUndefinedProperties: false,
      // Allow endpoints without DTOs to pass through without breaking
      validateCustomDecorators: true,
    }),
  );

  // Enable graceful shutdown to release port on restart
  app.enableShutdownHooks();

  const server = await app.listen(port, '0.0.0.0');
  
  // Increase server timeouts for large CSV processing
  server.setTimeout(600000); // 10 minutes
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 601000;

  console.log(`🐾 WOOF Backend running on port ${port}`);
}

bootstrap();
