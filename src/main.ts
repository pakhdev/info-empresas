import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }),
);
app.enableCors();
const PORT = process.env.API_PORT;
await app.listen(PORT, () => console.log(`InfoEmpresas backend started at ${ PORT }`));
}
bootstrap();
