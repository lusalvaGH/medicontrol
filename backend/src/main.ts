import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const puerto = config.getOrThrow<number>('puerto');
  const host = config.getOrThrow<string>('host');
  await app.listen(puerto, host);
  console.log(`MEDICONTROL API escuchando en http://${host}:${puerto}/api`);
}

void iniciar();
