import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);

  app.useStaticAssets(join(__dirname, '..', 'public', 'admin'), {
    prefix: '/admin',
    index: 'index.html',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Vermietung Middleware API')
    .setDescription(
      'Secure middleware between fonio.ai and Hostaway for brainions Vermietung',
    )
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'fonio-api-key')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Middleware API running on http://localhost:${port}`);
  console.log(`Admin UI: http://localhost:${port}/admin`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
