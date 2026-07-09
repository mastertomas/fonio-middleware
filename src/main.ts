import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

function applySecurityMiddleware(
  app: NestExpressApplication,
  config: ConfigService,
) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    const secure =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https' ||
      config.get('NODE_ENV') !== 'production';
    if (secure && config.get('NODE_ENV') === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  if (config.get('FORCE_HTTPS') === 'true') {
    app.use((req, res, next) => {
      const secure =
        req.secure || req.headers['x-forwarded-proto'] === 'https';
      if (secure) return next();
      const host = req.headers.host ?? 'localhost';
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.set('trust proxy', 1);
  applySecurityMiddleware(app, config);

  app.useStaticAssets(join(__dirname, '..', 'public', 'admin'), {
    prefix: '/admin',
    index: 'index.html',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Unknown fields are silently stripped (whitelist) instead of rejected.
      // fonio may send extra/unresolved template fields; those must not 400 the request.
      forbidNonWhitelisted: false,
    }),
  );

  const swaggerEnabled = config.get('SWAGGER_ENABLED') !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vermietung Middleware API')
      .setDescription(
        'Secure GDPR-conscious middleware between fonio.ai and Hostaway. ' +
          'All secrets via server environment only. Full API reference below. ' +
          'See docs/SECURITY.md for roles, logging, and HTTPS.',
      )
      .setVersion('0.1.0')
      .addApiKey(
        { type: 'apiKey', name: 'x-api-key', in: 'header' },
        'fonio-api-key',
      )
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Middleware API running on http://localhost:${port}`);
  console.log(`Admin UI: http://localhost:${port}/admin`);
  if (swaggerEnabled) {
    console.log(`Swagger docs: http://localhost:${port}/docs`);
  }
}
bootstrap();
